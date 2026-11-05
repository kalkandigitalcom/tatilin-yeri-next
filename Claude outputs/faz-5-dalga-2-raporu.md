# Faz 5 — 2. Dalga: Karmaşık Admin Modülleri

**Tarih:** 4 Kasım 2026
**Kapsam:** Villa, Blog, CMS sayfaları, Genel ayarlar ve Popup admin modüllerinin merkezi içerik servislerine (`getContent` / `saveContent` / `saveContentMany` / `createContent`) geçirilmesi.
**Durum:** 2. dalga tamamlandı. Kayıt defterinde (`CONTENT_WRITE_MIGRATED`) 14 içerik türünün **tamamı** merkezi yazmada. Faz 5 bu dalga ile tamamlanmış sayılabilir.

**Bu fazda yapılmayanlar:**

- Migration 105–107 değiştirilmedi; 108 yalnız izole PG'de (tek kullanımlık kopyalarda) uygulandı; 109 oluşturulmadı.
- `content_mirror_mode()` değiştirilmedi (izole PG'de `base` doğrulandı).
- Canlı DB'ye, sunucuya veya Coolify'a bağlanılmadı; production verisi okunmadı.
- Commit, push ve deploy yapılmadı. Faz 6'ya başlanmadı.
- Rezervasyon, fiyatlandırma, ödeme, takvim, voucher ve e-posta kodlarına dokunulmadı.
- 1. dalganın 9 modülü yalnız iki zorunlu noktada değişti (ödeme yöntemi TR ad kontrolü, villa tipi boş teknik anahtar; §7 ve §8).

---

## 1. Ortak altyapı (bu dalgada eklenen)

### 1.1 Teknik yama: içerik ve içerik dışı kolonlar tek transaction'da

Karmaşık modüllerde bir kayıt hem çevrilebilir içerik (ör. villa açıklaması) hem de dilden bağımsız kolonlar (ad, kapasite, yayın durumu, noindex…) taşıyor. Bunlar artık **aynı transaction'da** yazılıyor.

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/content/content-write-sql.ts` | `sqlUpdateTechnical(def, id, values, jsonColumns)` — parametreli `UPDATE`, jsonb kolonları `::jsonb` |
| `lib/i18n/content/content-write-core.ts` | `ContentTechnicalPatch`; `saveContentMany(items, ctx, { technical })` |
| `lib/i18n/content/content-admin.server.ts` | `adminSaveContentMany(..., technical)` + denetim kaydına `technical` değerleri; `ContentTechnicalPatch` tipini yeniden dışa açar (admin modülleri yazma çekirdeğini doğrudan import etmez — Faz 4 sınır testi) |

**Teknik yamanın kuralları (çekirdekte zorlanır):**

- `id`, `slug` (teknik anahtar) ve kayıt defterindeki içerik kolonları **reddedilir** (`validation`).
- Kolon adı `^[a-z_][a-z0-9_]{0,62}$` dışında ise reddedilir. Bu, SQL enjeksiyonuna karşı koruma sağlar.
- Kilit sırası deterministiktir: önce bütün ebeveyn satırlar `FOR UPDATE` (sıralı), sonra teknik UPDATE'ler, sonra slug advisory kilitleri, sonra içerik yazımı. `40P01` durumunda yeniden denenir.
- Teknik UPDATE başarısız olursa içerik de geri alınır; içerik geçersizse teknik kolon da yazılmaz (izole PG'de test edildi).

### 1.2 Diğer ortak parçalar

- **Kayıt defteri** (`content-write-modules.ts`): `site_popup`, `settings`, `blog_post`, `page`, `villa` eklendi (toplam 14).
- **Arayüz bileşenleri:**
  - `RootLocaleNote`'a `scope="form"` eklendi.
  - Yeni `TechnicalKeyNote` bileşeni, ana formdaki URL slug alanının altında teknik anahtarı ve TR slug kilidini açıklıyor. Admin sayfalarındaki "sabit Türkçe metin yok" kaynak kilidi testine uymak için ortak bileşene alındı.
- **Yeni yardımcı:** `lib/i18n/content/content-technical-key(.server).ts` → `assignMissingTechnicalKey` (§8).

---

## 2. Popup

| | Eski yol | Yeni yol |
|---|---|---|
| Okuma | `getSitePopupForAdmin()` — ana tablo = TR + EN/DE çeviri satırları | `getSitePopupForAdminCentral()` — ana dil üstte, diğer iki dil `translations` içinde |
| Yazma | `saveSitePopup()` → ana tabloya doğrudan UPDATE + çeviri upsert | `saveSitePopupCentral()` → `adminSaveContentMany` (ana dil + diğer diller + teknik yama: `is_enabled`, `image_path`, `show_button`, `display_scope`, `dismiss_duration`, `starts_at`, `ends_at`, `updated_at`) |
| Eski yol | — | `saveSitePopup` **kapalı** (`LEGACY_WRITE_DISABLED_MESSAGE`) |

**Korunan kurallar:**

- Bütün metinler `cleanPopupText` ve `normalizePopupStats` ile temizlenir.
- Buton linki her dilde `isSafePopupUrl` ile denetlenir (`javascript:`, `//evil` reddedilir).
- Buton metni varken URL zorunlu; URL o dilde veya ana dilde bulunabilir.
- Gösterim ayarı ve tarihler doğrulanır. Popup en az bir görsel veya başlık olmadan açılamaz.
- Eski görsel R2'den temizlenir.

**Boş `stats`:** `[]` olarak yazılır, NOT NULL korunur. O dilde okumada ana dile düşülür (Faz 3.1).

**Dosyalar:**

- `settings/popup/popup-content.server.ts` (yeni)
- `popup.action.ts`
- `popup/page.tsx` (ana dil sekmesi ilk sırada, etiketler ana dili adlandırıyor)
- `app/services/site-popup.service.ts` (eski yol kapısı)
- `tests/unit/site-popup.test.tsx`

---

## 3. Genel ayarlar

**Çevrilebilir alan analizi (kayıt defteri, 083/085/087):**

- **Çevrilebilir:** `footer_copyright`, `default_meta_title`, `default_meta_description`, `hero_title`, `hero_subtitle`, `hero_badge_text`, `hero_primary_cta_text`, `hero_secondary_cta_text`, `business_hours`.
- **Dilden bağımsız (ana tabloda kaldı):**
  - site adı, şirket unvanı, telefon, e-posta, adres
  - logo, favicon, OG görseli, filigran
  - sosyal medya bağlantıları, CTA bağlantıları (href)
  - izleme kodları, doğrulama token'ları, e-posta ayarları ve gizli anahtarlar
  - bakım modu ve bakım mesajı (çevirisi 084 ile kaldırılmıştı)
  - rezervasyon ayarları, `multilingual_enabled`, `public_default_locale`

  Bunlar çeviri tablosuna **taşınmadı**; teknik yamayla yazılıyor.

| | Eski yol | Yeni yol |
|---|---|---|
| `PUT /api/admin/settings` | `settingsServerRepository.updateById(id, values)` | `saveSettingsCentral()`: 9 alan → ana dil öğesi; kalan kolonlar → teknik yama; tek `adminSaveContentMany` |
| `GET /api/admin/settings` | ham satır | 9 alan ana dilin değeriyle (ana dil TR iken satır aynen döner) |
| Çeviriler ekranı | TR salt okunur, EN/DE yazılır (`settings-translation.service`) | Ana dil salt okunur, diğer iki dil `saveTranslationRow` ile yazılır; "kaldır" = 9 alanı NULL yapmak |
| Eski yol | — | `upsertSettingsTranslation`, `deleteSettingsTranslation`, `settings.service.updateSettings` **kapalı** |

**Korunan davranışlar:**

- **Ana dil:** Bu formdan değiştirilemez (409); kontrol yazmadan **önce** yapılıyor. Ana dil değişimi bir içerik taşıma işlemi değildir: izole PG'de `public_default_locale` değişirken çeviri satırları ve TR ana kolonu **birebir aynı** kaldı.
- **Çoklu dil:** TR dışı ana dilde kapatılamaz (409). Açılıp kapandığında `invalidatePublicRoutingCaches()` çalışmaya devam ediyor.
- **Cache:** `"settings"` tag'i hâlâ düşüyor. Merkezi servis commit sonrası düşürüyor; çeviri eylemi de `revalidateSettings()`'i aynen çağırıyor.
- **Uzunluk limitleri:** `SETTINGS_TRANSLATION_MAX_LEN` ile aynı. Alan listesi beyaz listeyle sınırlı, spread yok.
- **İzin ve denetim:** `settings` izni korunuyor. **Yeni:** genel ayar kaydı artık denetim kaydı (`settings.update`) yazıyor. Eski PUT yazmıyordu. `resend_api_key` gibi gizli alanlar `sanitizeForAudit` ile maskeleniyor.
- **jsonb kolonları:** Eski `query-compiler` kuralı aynen uygulanıyor (plain obje veya gerçek dizi olmayan kolon → `::jsonb`).

**Dosyalar:**

- `settings/_content/settings-content.server.ts` (yeni)
- `api/admin/settings/route.ts`
- `ceviriler/page.tsx`, `SettingsTranslationsPage.tsx`, `settings-translations.action.ts`
- `_components/SettingsTranslationFields.tsx` (sekmeler ve kilit ana dile göre)
- `genel`, `seo`, `iletisim` sayfaları (ana dil notu)
- `settings-translation.service.ts`, `settings.service.ts`

---

## 4. Blog

| | Eski yol | Yeni yol |
|---|---|---|
| `POST /api/admin/blog` | `blogServerRepository.insert` | `createBlogCentral()` → `createContent`: teknik (`slug` = teknik anahtar, kapak, kategori, yazar, OG, `is_active`, `published_at`) + ana dil (başlık, gövde, özet, SEO; ana dil TR değilse ana dil URL slug'ı = teknik anahtar) |
| `PATCH /api/admin/blog/[id]` | `updateById` (slug dahil) | `updateBlogCentral()` → içerik ana dile, yayın/kapak/kategori teknik yamaya; **teknik anahtar yazılmaz** |
| `GET` liste ve detay | ham satır | Başlık ana dilde ve eksik dil rozeti; detayda `technical_key`, `root_locale`, `slug_separated` |
| Çeviri kartı | EN/DE (`blog-translation.service`) | Ana dil dışındaki iki dil (TR dahil olabilir) ve her dilin kendi URL slug'ı |
| Eski yol | — | `upsertBlogTranslation` **kapalı**; route'larda eski dal yalnız modül geçmemişken çalışır |

**Korunan davranışlar:**

- **Yayın durumu ve tarih:** `is_active=true` ilk yayında `published_at = now()` set eder. Zaten varsa korunur. Taslağa alma tarihi silmez.
- **Revalidation:** `/blog` ile `/tr|en|de/blog` revalidation'ı aynen sürüyor.
- **Slug çakışması:** 409 "Bu slug zaten kullanılıyor".

**Slug sözleşmesi:**

- Ana formdaki slug alanı artık **ana dilin URL slug'ı**. Teknik anahtar alanın altında salt okunur gösterilir.
- Aynı değer geri gönderilirse slug yazılmaz. Değişirse ana dilin satırına yazılır; geçmiş ve yönlendirme merkezi servisle oluşur. Boş bırakılırsa temizlenir ve URL teknik anahtar olur.
- Ana dil TR ve 108 yokken TR slug değişikliği `guard` ile reddedilir. Alan kilitli gösterilir ve anlaşılır bir 409 mesajı döner.

**Diğer:**

- **Eksik çeviri ve noindex:** Diğer diller ana dile düşer, `isFallback=true` olur, Faz 3.1 noindex kuralı uygulanır (izole PG'de doğrulandı).
- **Güvenlik iyileştirmesi:** Eski EN/DE çeviri yolu gövdeyi sanitize etmiyordu. Artık her dilde `sanitizeHtml` uygulanıyor.

**Dosyalar:**

- `blog/blog-content.server.ts` (yeni)
- `api/admin/blog/route.ts`, `api/admin/blog/[id]/route.ts`
- `blog-translations.action.ts`, `BlogTranslationsCard.tsx`, `BlogPostForm.tsx`
- `blog/page.tsx`, `blog/[id]/page.tsx`
- `blog-translation.service.ts`

---

## 5. CMS sayfaları

| | Eski yol | Yeni yol |
|---|---|---|
| `POST /api/admin/pages` | `insert(payload)` (ham obje, `content` aynası dahil) | `createPageCentral()` → `createContent`: içerik + bölümler ana dile, kalan alanlar (`noindex`, `is_active`, `show_in_menu`, kapak, menü…) teknik; `content` **yazılmaz** |
| `PATCH /api/admin/pages/[id]` | `updateReturning` (body, content aynası, slug…) | `updatePageCentral()` → içerik ana dile, `noindex`/`is_active`/`show_in_menu`/`cover_image` teknik |
| `GET` liste ve detay | ham satır | Ana dil değerleri; ana dil TR değilse eski `content` gizlenir |
| Çeviri kartı | EN/DE (`page-translation.service`) | Ana dil dışındaki iki dil + URL slug + bölüm metinleri |
| Menü PATCH (`show_in_menu`, `menu_order`, `menu_parent_id`) | `updateById` | Değişmedi: içerik değil, dilden bağımsız alanlar |
| Eski yol | — | `upsertPageTranslation` **kapalı** |

**body / eski `content` sözleşmesi** (1. dalga kararıyla aynı):

- Ana formda gövde boşaltılırsa **`""` yazılır**. Böylece eski `pages.content` metni **geri gelmez**. Eski istemci `null` gönderse de `""` olarak yorumlanır.
- `null` "değer yok" anlamına gelir. Eski `content` yalnız bu durumda, yalnız TR'nin ek yedeği olarak görünür (Faz 3.1).
- `pages.content` kolonuna hiçbir yol yazmıyor. İstemcinin gönderdiği `content` anahtarı yok sayılıyor.
- Formun ilk yüklemesinde `body ?? content` davranışı korundu: ana dil TR, gövde NULL ve eski metin varsa forma gelir. Kaydedilince gövdeye taşınır (eski davranış).

**Bölümler:**

- Ana form bölüm **yazmaz** (eski davranış).
- Yeni sayfada bölümler `parsePageSections` ile temizlenip ana dile yazılır.
- Çeviri kartında `undefined` gönderilirse dokunulmaz; geçersiz veya boş dizi `NULL` olur ve ana dile düşülür. 40 000 karakter sınırı geçerli.
- Ana dilde bölüm yoksa yapı ana tablodan (TR aynası) alınır; bu, okuma zincirindeki yedekle aynı.

**Yedek ve noindex:** Eksik dil ana dile düşer ve `isFallback=true` olur. Gövde `""` ise o dilde içerik yok sayılır ve Faz 3.1 zinciri uygulanır.

**Dosyalar:**

- `pages/_content/page-content.server.ts` (yeni)
- `api/admin/pages/route.ts`, `api/admin/pages/[id]/route.ts`
- `pages/[id]/page.tsx`, `PageTranslationsCard.tsx`, `page-translations.action.ts`
- `pages/page.tsx`
- `page-translation.service.ts`

---

## 6. Villa

**Alan ayrımı:**

- **Çevrilebilir:** `description`, `badge`, `seo_title`, `seo_description` ve dil URL slug'ı.
- **Çevrilmez:** Villa adı (`title`) özel isim olduğu için çevrilmez (Phase 10F). Teknik alan olarak yazılır.

| | Eski yol | Yeni yol |
|---|---|---|
| Oluşturma (`POST /api/admin/villas` → `createVillaFull`) | `generateUniqueSlug` → `insertVilla(core)` | `generateUniqueSlug` → `createVillaCoreCentral()` → `createContent` (teknik anahtar + teknik alanlar + ana dil içeriği) |
| Güncelleme (`PUT …/[id]/full` → `updateVillaFull`) | Ad'dan `generateUniqueSlug` → `updateVillaById(core)` | `updateVillaCoreCentral()` → `saveContentMany` (ana dil içeriği + teknik yama); **teknik anahtar yeniden üretilmez** |
| Kopyalama (`…/[id]/clone` → `cloneVilla`) | ana tablo satırını `insertVilla` ile kopyalar | `cloneVillaCoreCentral()` → `createContent`: kaynağın **3 dildeki** içeriği (dil slug'ları hariç), yeni teknik anahtar, `is_active=false` |
| Düzenleme formu okuma (`loadVillaEditData`) | ham satır | `overlayVillaRoot()` → ana dil metinleri + `technical_key` |
| Çeviri kartı | EN/DE (`villa-translation.service`) | Ana dil dışındaki iki dil; **ana dil URL slug'ı** ayrı alan ve eylem (`saveVillaRootSlugAction`) |
| Eski yol | — | Servisler çağıran admin olmadan merkezi yolda **hata verir** (`LEGACY_WRITE_DISABLED_MESSAGE`); `upsertVillaTranslation` **kapalı** |

**Etkilenmeyenler (ayrı ve aynı sırada çalışır, kodları değişmedi):**

- Tip, özellik, kural ve dahil ilişkileri: oluşturmada `.length > 0` ise insert; güncellemede `replace_*` RPC.
- Mesafeler (`setVillaDistancesServer`) ve fiyatlar (`setVillaPricesServer`).
- Galeri, rezervasyon, takvim ve iCal.

Birim testi çağrı sırasını (`core → types → features → distances → prices`) ve fiyat argümanlarını birebir doğruluyor. Merkezi oluşturma başarısız olursa ilişki ve fiyat **yazılmaz**.

**Teknik anahtar ve dil slug'ı:**

- `villa.slug` yalnız oluşturmada ad'dan üretilir. Ad değişince **değişmez**.
- Galeri klasörü (`villa.slug`) bu sayede sabit kalır; ad değişse de görsel yolları kopmaz.
- Ana dilin URL slug'ı çeviri kartındaki "Ana dil URL slug'ı" alanından düzenlenir. Geçmiş ve yönlendirme merkezi servis tarafından tutulur.
- Ana dil TR ve 108 yokken bu alan kilitlidir.
- Düzenleme formundaki URL önizlemesi merkezi modda ad yazıldıkça değişmez.

**jsonb teknik alanlar:**

- `pool_heating_months`, `youtube_videos`, `bedroom_layout`, `bathroom_layout`: güncellemede `jsonColumns`, oluşturmada JSON metni (PG kolon tipine göre çevirir).
- `search_title` ve `real_title_search` (GENERATED) yazılmaz.

**AST sözleşme testleri:**

- `create/updateVillaOrchestrationContract` yürüyücüsü artık `else` dalını da (koşullu olarak) tarıyor. Eski yolun sıra, await ve tam-bir-kez beklentileri aynen geçerli.
- **Yeni sözleşme:** merkezi yazım tek, awaited ve ilişkilerden önce. Merkezi ve eski villa yazımı aynı `if/else`'in iki dalında; ikisi birlikte çalışamaz.

**Dosyalar:**

- `app/services/villa-admin/_helpers/content.server.ts` (yeni)
- `create.service.ts`, `update.service.ts`, `clone.service.ts`
- 3 route (`actor: auth.caller`)
- `villas/[id]/villa-edit.action.ts`, `villas/[id]/page.tsx`
- `VillaTranslationsCard.tsx`, `villa-translations.action.ts`
- `villa-translation.service.ts`

---

## 7. Risk 1: Ödeme yöntemi adı ve Türkçe voucher

**Analiz:**

- Voucher (`app/lib/voucher/data.ts`) ve üç rezervasyon e-postası `payment_methods.name` (TR aynası) değerini okuyor ve `trim() || null` uyguluyor. Şablonlar değer `null` ise "Ödeme Yöntemi" satırını **göstermiyor**.
- Bu yüzden boş ad yazdırılmıyor. Ama ana dil EN/DE iken oluşturulan yöntemde bilgi **kayboluyordu**. Bunun nedeni, Faz 5 kararıyla TR'nin `''` ile başlaması.

**Uygulanan kontrol** (yalnız ödeme yöntemleri; genel mimaride TR zorunlu **değil**):

- **Oluşturma:** Ana dil TR değilse `name_tr` zorunlu ve aynı transaction'da TR satırına yazılıyor (`createContent` locales: ana dil + `tr`). Arayüzde ana dil TR değilken "Türkçe ad (voucher / e-posta)" alanı çıkıyor.
- **Çeviri paneli:** TR adı boşaltılamıyor. EN/DE boş bırakılabilir; genel kural değişmedi.
- **Mesaj** (`lib/i18n/content/payment-method-tr.ts`): "Ödeme yöntemi için Türkçe ad zorunlu (voucher ve e-postalar Türkçe gönderilir)".

**Neden okuma tarafında yedek yapılmadı:** Voucher ve e-posta kodu rezervasyon/ödeme kapsamında ("dokunma" kuralı). Faz 0 kararı da bu çıktıların TR kalmasını istiyor. Yazma tarafındaki kontrol, eksik TR adı üretilmesini kaynağında engelliyor.

**Mevcut veri için salt okunur kontrol** (canlıda ayrı onayla çalıştırılmalı):

```sql
SELECT id, created_at FROM payment_methods WHERE btrim(coalesce(name,'')) = '';
```

Bugün canlıda ana dil TR olduğundan bu sorgunun boş dönmesi beklenir.

**Testler:** Birim testlerinde ana dil TR/EN/DE ile reddetme, aynı transaction'da TR yazımı ve panelde TR boşaltma reddi doğrulandı.

---

## 8. Risk 2: Teknik anahtarı boş eski kategoriler

**Analiz:**

- Eski kod, slug'ı NULL olan villa tipinde ad kaydedilince slug'ı addan üretiyordu.
- 1. dalgada teknik anahtar ad değişiminden bağımsız yapıldığı için bu kayıtlar **hiç anahtar alamıyordu**. Sonuç:
  - kapak yükleme kapalıydı (`category-covers/<slug>`, buton "Önce 'Kaydet' ile slug üret" diyordu);
  - `/villa-turleri/<slug>` landing URL'i yoktu;
  - menü bağlantısı yoktu.

**Çözüm:** `assignMissingTechnicalKey(entity, id, ad)`, `updateVillaTypeAction`'da ad kaydından sonra çalışıyor.

- **Yalnız boş anahtar doldurulur:** `SELECT … FOR UPDATE` + `UPDATE … WHERE slug IS NULL OR btrim(slug)=''`. **Dolu anahtar asla değişmez**, yanlış eşleşme oluşmaz.
- **Aday seçimi:** Aynı türün başka bir kaydının teknik anahtarıyla **ya da** herhangi bir dildeki URL slug'ıyla çakışmayan ilk aday seçilir (`-2`, `-3`…).
- **Kapsam:** Tek transaction. Dil URL slug'larına dokunulmaz. Atama olursa routing cache'i yenilenir.
- **Eşzamanlılık:** 6 paralel çağrıda tek atama yapıldı ve hepsi aynı anahtarı gördü (izole PG).
- **Kapak:** Anahtar atandığında kapak yükleme açılıyor. Kapak yolu teknik anahtardan türediği için sonradan ad değişse de yol sabit kalıyor.

**Veri düzeltme planı** (canlıda **ayrı onayla**; bu fazda çalıştırılmadı):

1. **Salt okunur tespit:**

   ```sql
   SELECT id, name FROM villa_types WHERE slug IS NULL OR btrim(slug) = '';
   ```

2. **Kayıt azsa:** Admin, her kaydın adını bir kez "Kaydet"ler; anahtar otomatik ve güvenli biçimde atanır. Migration gerekmez.
3. **Kayıt çoksa:** `assignMissingTechnicalKeyWith` ile tek seferlik bir betik çalıştırılabilir; aynı kurallar uygulanır. Önce staging kopyasında çalıştırılmalı, sonuç listesi onaylanmalı.
4. **Sonra:** Kapaklar yüklenir. Menüde bu tiplere bağlı öğeler kontrol edilir.

---

## 9. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| Tam paket (8 parça) | **269 dosya, 5.155 test: 5.078 başarılı, 77 atlanan, 0 başarısız** |
| Yeni birim testleri | `faz5-dalga2.test.tsx` **53**, `faz5-dalga2-villa.test.ts` **16**, AST sözleşmesi +4 |
| İzole PG: dalga 2 (`content-faz5-dalga2-pg`, 108 taslağı) | **25/25**. Biri temiz kopya olmak üzere 4 koşu; koşular tekrarlanabilir |
| İzole PG: Faz 5 (1. dalga) / Faz 4 yazma / Faz 3 okuma | **9/9**, **18/18**, **14/14** (temiz kopyalarda, yeni çekirdekle) |
| TypeScript | Kaynak kodda **0 hata** (61 eski `.next/types` hatası değişmedi) |
| ESLint | **0 hata, 194 uyarı** (önceki toplamla aynı; yeni uyarı yok) |
| Production build (izole kopya) | **Başarılı:** 33,7 sn derleme, 49/49 sayfa |

**Sayılar:**

- 1. dalga sonunda 5.057 test vardı; **98 yeni test** eklendi (69 birim, 4 AST, 25 entegrasyon).
- 77 atlanan testin 11'i önceden atlanan testler. 66'sı, normal pakette DB adresi olmadığı için atlanan izole PG testleri: okuma 14, yazma 18, Faz 5 9, dalga 2 25.

**İstenen senaryoların karşılığı (her modül):**

| Senaryo | Kapsam |
|---|---|
| Ana dil TR / EN / DE | Birimde 5 modülün hepsi; PG'de popup, ayarlar, blog, sayfa, villa |
| Yeni kayıt ve güncelleme (3 dil) | PG'de oluştur, diğer iki dilde yaz, ana dilde güncelle; birimde öğe ve locale doğrulaması |
| Eksik çeviri | PG'de `isFallback=true` ve ana dil değeri (blog, sayfa, popup); boş `stats` → ana dil |
| Teknik anahtar / slug ayrımı | PG'de ana tablo `slug` sabit, dil slug'ları ayrı satırda; villada ad değişimi anahtarı değiştirmez |
| Slug değişimi ve geçmiş | PG'de `url_redirects` ana dil kaydı (blog, sayfa, villa); birimde aynı slug geri gelince yazılmaz |
| Eski yazma yolu kapalı | Birimde 5 modülün eski servis/route yolları çağrılmaz veya reddeder |
| Yetki ve denetim kaydı | Birimde 403 (ayarlar, blog), denetim satırı (`settings.update`, `content.create`, `content.update`); çağıranın iletildiği doğrulandı |
| Transaction rollback | PG'de hatalı teknik kolon → içerik geri; geçersiz içerik → teknik geri; çakışan teknik anahtar → kayıt yok |
| Eşzamanlı yazma | PG'de ayarlar 12 paralel (2 dil + teknik), sayfa 15 paralel; kilitlenme yok; ayna tutarlı |
| Eski davranışla uyum | Ana dil TR'de GET aynen; yayın tarihi kuralı; popup doğrulamaları; ilişki/fiyat sırası; jsonb parity |

**Güncellenen eski testler** (beklentiler gevşetilmedi):

- **Eski servis zincirini test eden dosyalara kayıt defteri mock'u ("geçmemiş") eklendi:** `settings-translation-service`, `page-translation.service`, `page-translations-wiring`, `villa-translation-service`, `cloneVillaPayload`.
- **Eylem testleri merkezi yardımcılara aynı mock'larla delege ediyor:** `settings-translations-action`, `page-translations-action`, `villa-translations-action`. Çağıranın iletildiği ayrıca doğrulanıyor.
- **Route testleri:** `sec03`, `phase4-root-locale-api` ve `site-locales-admin-route`'ta yazma adımı aynı spy'a yönlendirildi. Sıra ve çağrı sayısı beklentileri aynen geçerli.
- **Etiket:** `PageTranslationsCard` testindeki referans etiketi yeni metne güncellendi ("Türkçe (ana dil — referans, salt okunur)").
- **`faz5-admin-content`:** "modül listesi" beklentisi 14 türe güncellendi.

---

## 10. Davranış değişiklikleri (bilinçli)

1. **Villa adı değişince URL değişmez.** Eskiden ad her kayıtta slug'ı yeniden üretiyordu. Artık teknik anahtar sabit; ana dil URL slug'ı çeviri kartından düzenleniyor.
2. **Blog, sayfa ve villada TR URL slug'ı, 108 uygulanana kadar düzenlenemez** (ana dil TR iken). Canlıda 108 yok. Bu yüzden bugün geçiş yapılırsa adminler TR URL'lerini değiştiremez; alan kilitli ve açıklamalı.
3. **Villa kopyalama artık EN/DE içeriği de kopyalıyor** (eskiden yalnız ana tablo = TR). Dil slug'ları kopyalanmıyor.
4. **Genel ayar kaydı artık denetim kaydı yazıyor** (eskiden yazmıyordu).
5. **Blog EN/DE gövdesi sanitize ediliyor** (eskiden edilmiyordu).
6. **Sayfa gövdesi boşaltılınca `""` yazılıyor; `pages.content` hiç yazılmıyor** (1. dalga kararı).

---

## 11. Kalan riskler

1. **108 olmadan canlıya geçiş:** Madde 10-2 nedeniyle önerilen sıra, 108'in (ayrı onayla) staging'de, sonra canlıda uygulanması; ardından bu dalganın etkinleştirilmesi. Alternatif olarak 2. dalga modülleri kayıt defterinden geçici olarak çıkarılabilir; eski yollar kodda duruyor.
2. **Boş gövdenin dil zinciri:** Ana dil TR'de gövde `""` ise Faz 3.1 zinciri diğer aktif dillere geçer. TR sayfasında EN gövde görünebilir; o dilde `isFallback` ve noindex uygulanır. Eski davranış boş gövde göstermekti. İstenirse `""` için "zincirde dur" kuralı ayrı bir karar olarak eklenebilir.
3. **Villa ilişkileri ve fiyatları ayrı transaction'da:** Bu durum eskisiyle aynı. Merkezi çekirdek yazıldıktan sonra ilişki veya fiyat adımı hata verirse villa satırı kalır; route 400 döner. Fiyat ve rezervasyon koduna dokunmama kuralı nedeniyle birleştirilmedi.
4. **Canlıdaki eksik TR adları ve boş anahtarlar:** §7 ve §8'deki salt okunur sorgular canlıda ayrı onayla çalıştırılmalı.
5. **Ödeme yöntemi kontrolü yalnız yeni kayıtlarda:** Ana dil EN/DE'ye geçilmeden önce oluşturulmuş yöntemlerin TR adı zaten dolu. Ana dil değişim önizlemesine (Faz 4 sihirbazı) "TR adı boş ödeme yöntemi" uyarısı eklenmesi Faz 6 için önerilir.
6. **Build ortamı notu:** İlk build denemesinde izole kopyada repodaki `.env.local` dosyası da vardı. Statik üretim bir DB sunucusunun adını çözmeye çalıştı; ağ yoktu, ad çözülemedi ve **bağlantı kurulmadı**. Dosya kopyadan silindi, build env'siz tekrarlandı ve başarılı oldu. Sonraki build'lerde `.env*` dosyaları kopyaya alınmamalı.

---

## 12. Faz 6 giriş kriterleri

1. **Migrations:** 105–107 ve 108 ayrı onayla önce staging'e, sonra canlıya uygulanmalı. `content_mirror_mode()='base'` doğrulanmalı.
2. **Canlı kopyada entegrasyon testleri:** Dört entegrasyon dosyası canlının kopyasına karşı çalıştırılmalı. `CONTENT_DALGA2_PG_URL` adresi 108 uygulanmış bir kopya olmalı.
3. **Salt okunur veri kontrolleri:** §7, §8 ve Faz 3.1 `pages.content` sorguları alınmalı.
4. **Elle arayüz kontrolü** (ana dil TR / EN / DE):
   - popup, genel/SEO/iletişim, çeviriler;
   - blog ve sayfa (oluştur / düzenle / çeviri / slug);
   - villa (oluştur / düzenle / kopyala / galeri / fiyat takvimi / çeviri / ana dil slug'ı).
