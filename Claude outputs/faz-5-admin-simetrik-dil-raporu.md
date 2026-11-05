# Faz 5: Admin Panelinin Simetrik Çoklu Dil Sistemine Geçirilmesi (1. dalga)

**Tarih:** 4 Kasım 2026
**Durum:** **Kısmen tamamlandı.** Altyapı ve 1. dalga (9 modül) bitti; 2. dalga (5 modül) bekliyor.

**Faz başındaki kararlar (kullanıcı onayı):**

| Soru | Karar |
|---|---|
| TR slug ayrımının doğrulanması | Migration 108 **taslağı** yazılır ve yalnız tek kullanımlık izole PostgreSQL'de çalıştırılır |
| Ana dil TR değilken yeni kayıt | Ana tablodaki TR aynasının NOT NULL kolonlarına **boş metin (`''`)** yazılır |
| Kapsam | İş **dalgalar halinde** yapılır |

**Bu fazda yapılmayanlar:**

- Canlı DB'ye, canlı sunucuya veya Coolify'a bağlanılmadı.
- Migration 105–108 hiçbir gerçek ortamda çalıştırılmadı; 108 yalnız tek kullanımlık izole test DB'sinde çalıştı.
- `content_mirror_mode()` değeri değişmedi (`'base'`).
- Commit, push ve deploy yapılmadı.
- Faz 6'ya geçilmedi.

---

## 1. Özet

| Alan | Durum |
|---|---|
| **Karar 1 — TR slug = dil slug'ı, teknik anahtardan ayrı** | ✅ Servis, routing, admin ve 108 taslağı hazır. İzole PG'de doğrulandı. Canlıda etkinleşmesi 108'in uygulanmasına bağlı; o zamana kadar TR slug düzenleme **kilitli** (açıklamalı) |
| **Yazma servisi admin'e bağlandı** | ✅ 1. dalga: 9 modül |
| **Eski yazma yolu kapatıldı** | ✅ 9 modülün hepsi: admin eylemleri yeni yolu kullanıyor, eski çeviri servisleri yazmayı reddediyor |
| **`pages.content` riski** | ✅ Çözüldü: sözleşme ve okuma kuralı. Admin "boşalt" = `""` |
| **Yetki ve denetim kaydı** | ✅ Eylemde yetki; denetim kaydı sunucuda `admin_activity_logs`'a |
| **2. dalga: villa, blog_post, page, settings, site_popup** | ⏳ **Yapılmadı.** Eski yazma yolları bu 5 modülde **çalışmaya devam ediyor** (iki yol aynı anda açık değil; yalnız eski yol açık) |
| **Migration 108** | 📝 Yalnız **taslak** (dil slug ayrımı). Mod değişimi (eski planın "108"i) için koşullar **henüz sağlanmadı** (§8) |

---

## 2. Öncelikli karar: teknik anahtar ↔ dil slug'ı

### Neden veritabanı değişikliği gerekiyordu

Bugünkü `base` modunda, 106 aynası her TR içerik yazımında `tr.slug` alanını ana tablodaki `slug` ile **eziyordu**. Guard da `tr` satırına yazmayı engelliyordu. Yani TR URL slug'ı veritabanı değişmeden teknik anahtardan ayrılamazdı.

### Migration 108 taslağı

Dosya: `db/migrations/_drafts/108_language_slug_separation.DRAFT.sql`. Migration çalıştırıcısının taradığı kök klasörde değil.

**Ne değişiyor:**

- **Ayna:** `trg_content_mirror_base_to_tr` artık `tr.slug`'ı yalnız `tr` satırı **ilk kez** oluşurken teknik anahtardan tohumluyor. Sonraki içerik yazımları ve teknik anahtar değişimi TR slug'ına **dokunmuyor**.
- **Guard:** `trg_content_tr_guard`, `base` modunda `tr` satırında **yalnız `slug`** değişen UPDATE'e izin veriyor. İçerik kolonları hâlâ yalnız aynadan yazılabiliyor. `tr` satırı INSERT'i ve silinmesi engelli kalıyor.
- **Yetenek işareti:** `content_language_slugs_separated()`. Uygulama bu fonksiyon varsa TR slug yazımını açıyor.
- **Veri:** Backfill yok (107 sonrası `tr.slug` zaten teknik anahtara eşit). Mod değişmiyor.

**İzole PG'de doğrulananlar:**

- uygulama ve tekrar uygulama (idempotent);
- geri alma: 106 fonksiyonları geri yüklenince ayna yeniden teknik anahtarı yazıyor;
- test sonrası 0 ayna sapması.

### Kodda değişenler

| Katman | Değişiklik |
|---|---|
| Yazma servisi (`content-write-core`) | Ana tablo `slug`'ı **asla yazılmaz** |
| ↳ TR URL slug'ı, `base` modu | `tr` satırına `UPDATE … SET slug` ile yazılır. 108 yoksa `guard` döner ("migration 108 gerekli") ve hiçbir şey değişmez. `null` = teknik anahtara düş |
| ↳ TR URL slug'ı, `translations` modu | `tr` satırına yazılır |
| ↳ Teknik anahtar | Yalnız yeni kayıtta (`createContent`) verilir; benzersizlik kilitle kontrol edilir |
| Routing (`lib/i18n/routing`) | `rowsToSlugMap` TR satırlarını **dahil eder**. `toLocalizedSlug`'da TR özel durumu kalktı. `slugSource`: teknik anahtar, TR'nin kendi slug'ı varsa `"base"` döner (kanonik yönlendirme), yoksa `"own"`. Yeni `ownLocaleSlugBase`. **107 sonrası `tr.slug = teknik anahtar` olduğu için URL'ler aynı kalır; 107 öncesinde (bugünkü canlı) TR satırı yok, davranış da aynı** |
| Slug geçmişi | Trigger'lar (103/106) yönetir. TR dil slug'ı değişimi → `url_redirects(kind,'tr',eski)`. Teknik anahtar değişimi → ana tablo trigger'ı (103 kuralı, aynı) |
| Admin | Villa tipi panelinde **teknik anahtar ayrı ve salt okunur**. Ana dilin URL slug'ı ayrı bir alanda. TR slug alanı 108 yoksa kilitli ve açıklamalı. `LocalizedSlugField` artık TR'yi de destekliyor ve "boşsa teknik anahtar" diye yazıyor |

---

## 3. Mimari (admin)

```
Admin sayfası (client)                     ─ ana form = ANA DİL (settings.public_default_locale)
  ├─ liste satırı / form  → <modül>.action.ts ("use server": requirePermission)
  └─ "Çeviriler" paneli   → <modül>-translations.action.ts (authorizeAdminSession + callerHasPermission)
                              ↓
app/(admin)/maki-admin/_content/simple-content.server.ts   (localizeAdminRows, saveRootContent,
                              ↓                              createRootContent, load/saveTranslationRow)
lib/i18n/content/content-admin.server.ts   (ham okuma, cache yok · adminSaveContent / adminCreateContent /
                              ↓              adminSaveContentMany · denetim kaydı commit SONRASI)
lib/i18n/content/content-write.server.ts → content-write-core (saveContent · saveContentMany · createContent)
```

**Dil düzeni** (`adminLocaleLayout`):

| Ana dil | Ana form | Çeviri bölümleri |
|---|---|---|
| TR | TR | EN, DE |
| EN | EN | TR, DE |
| DE | DE | TR, EN |

- Pasif diller sona alınır. Hiçbir dil yapısal olarak ayrıcalıklı değil.
- Ana dil değişince içerik taşınmaz, yalnız düzen değişir.
- Ana dil TR iken ekranlar **eskisiyle birebir aynı** görünüyor (mevcut admin testleri değişmeden geçiyor).

**Eksik çeviri göstergesi:**

- Panellerde eksik dil sekmesinde nokta ve "Eksik çeviri: …" satırı var. Satırda: eksik dilde içerik ana dilden gösterilir ve sayfa arama motorlarına kapalı tutulur.
- Listelerde "Eksik: DE" rozeti (`MissingLocalesBadge`).
- Sayfa başında "Ana dil: …" notu (`RootLocaleNote`).

**Yeni kayıt** (`createContent`) tek transaction'da yapılır:

1. ana kayıt (teknik kolonlar);
2. NOT NULL içerik kolonlarına yer tutucu (`''` / `[]`);
3. ana dildeki içerik;
4. (varsa) diğer diller.

Herhangi bir adım hata verirse ana kayıt da oluşmaz (test edildi).

**Tek yazma yolu:**

- `lib/i18n/content/content-write-modules.ts` (`CONTENT_WRITE_MIGRATED`) tek kaynak. Merkezi servis yalnız buradaki modüller için açık; aynı liste eski çeviri servislerini kapatıyor.
- Faz 4'teki ortam bayrağı (`CONTENT_WRITE_SERVICE_ENABLED`) kaldırıldı; artık modül bazında kod düzeyinde açılıyor.

---

## 4. 14 içerik türü: değişen admin bileşenleri ve yazma servisleri

| # | Tür | Admin bileşenleri (değişen) | Yazma yolu (yeni) | Eski yol |
|---|---|---|---|---|
| 1 | **villa_feature** | `features/page.tsx` (ana dil notu, eksik rozeti), `FeatureTranslationsPanel.tsx` (ortak panel) | `features.action.ts`: liste/ekle/güncelle → `localizeAdminRows` / `createRootContent` / `saveRootContent`. `feature-translations.action.ts` → `saveTranslationRow` | `villa-feature-translation.service` yazması **kapalı**; `addVillaFeature`/`updateVillaFeature` artık çağrılmıyor; silme değişmedi |
| 2 | **rule_item** | `rules/page.tsx`, `RuleTranslationsPanel.tsx` | `rules.action.ts`, `rule-translations.action.ts` (aynı desen) | `rule-item-translation.service` **kapalı**; `add/updateRuleItem` çağrılmıyor |
| 3 | **price_include_item** | `price-includes/page.tsx`, `PriceIncludeTranslationsPanel.tsx` | `price-includes.action.ts`, `price-include-translations.action.ts` | `price-include-item-translation.service` **kapalı** |
| 4 | **payment_method** | `PaymentMethodTranslationsPanel.tsx` (boş = temizle) | `app/services/payment-method.action.ts`: liste + oluştur (`createRootContent`; hata → throw, eski davranış), `payment-method-translations.action.ts` | `payment-method-translation.service` **kapalı**; doğrudan `name` INSERT'i çağrılmıyor |
| 5 | **menu** | `MenuTranslationsPanel.tsx` (iki alan aynı anda, dilleri ana dile göre), `menu/new/page.tsx` (ek alanlar = ana dil dışındaki diller) | `app/api/admin/menu/route.ts`: GET adları ana dilde döner, POST `createRootContent` (href/kaynak/aktiflik teknik kolon); `menu-translations.action.ts` | `menu-translation.service` **kapalı**; `menuServerRepository.insert` kullanılmıyor (PATCH sıra, DELETE değişmedi) |
| 6 | **villa_type** | `TypeTranslationsPanel.tsx` (ana dile göre sekmeler; **teknik anahtar salt okunur**; ana dil URL slug alanı; TR slug kilidi) | `types.action.ts`: liste/ekle (teknik anahtar = ana dil adından, değişmez)/güncelle (ad değişince teknik anahtar DEĞİŞMEZ). `type-translations.action.ts`: çeviri + `saveTypeRootSlugAction` | `villa-type-translation.service` **kapalı**; `add/updateVillaType` çağrılmıyor; kapak/sıra/ana sayfa değişmedi |
| 7 | **faq** | `faqs/page.tsx` (çeviri blokları ana dile göre; TR etiketleri eklendi) | `faqs.action.ts` → `faq-content.server.ts` (`replaceFaqsCentral`: aynı sözleşme; mevcutlar TEK transaction `saveContentMany`, yeniler `createContent`), `faq-translations.action.ts` | `replaceFaqs`/`faq-translation.service` yazması **kapalı/çağrılmıyor** |
| 8 | **homepage_collection** | `homepage-collection/page.tsx` (satır altında "Başlık çevirileri") | `homepage-collection.action.ts`: `custom_title` → `saveRootContent` (kapak eski servisle); yeni başlık çeviri eylemleri | `custom_title` doğrudan yazma **çağrılmıyor** |
| 9 | **discount_collection** | `discount-collection/page.tsx` (aynı) | `discount-collection.action.ts` (aynı; seçim/kapak eski servisle) | aynı |
| 10 | **villa** | **değişmedi (2. dalga)** | – | **eski yol açık** |
| 11 | **blog_post** | **değişmedi (2. dalga)** | – | **eski yol açık** |
| 12 | **page** | **değişmedi (2. dalga)** | – | **eski yol açık** (`content` kuralı okuma tarafında çözüldü, §5) |
| 13 | **settings** | **değişmedi (2. dalga)** | – | **eski yol açık** |
| 14 | **site_popup** | **değişmedi (2. dalga)** | – | **eski yol açık** |

**Ortak yeni dosyalar:**

- **Admin bileşenleri ve kancalar:**
  - `app/components/admin/shared/LocaleTranslationsPanel.tsx`
  - `CollectionTitleTranslations.tsx`
  - `RootLocaleNote.tsx`
  - `useAdminLocaleLayout.ts`
- **Admin sunucu katmanı:**
  - `app/(admin)/maki-admin/_content/simple-content.server.ts`
  - `content-layout.action.ts`
  - `faqs/faq-content.server.ts`
- **İçerik kütüphanesi:**
  - `lib/i18n/content/content-admin.ts`
  - `content-admin.server.ts`
  - `content-write-modules.ts`

**Değişen ortak dosyalar:**

- `content-write-core.ts`: `createContent`, modül bazında etkinleştirme, TR slug yolu.
- `content-write-sql.ts`
- `content-write.server.ts`
- `content-resolve.ts`: `content` kuralı.
- `content-field-rules.ts`
- `content-contract.ts`: NULL ile `""` sözleşmesi.
- `lib/i18n/routing/{sql,context,url}.ts`
- `LocalizedSlugField.tsx`

---

## 5. `pages.content` uyumluluğu (çözüldü)

**Sözleşme** (`content-contract.ts`, yazma):

| Gönderilen | Anlamı | Okuma sonucu |
|---|---|---|
| anahtar yok | dokunma | – |
| `null` | değer yok | eski `pages.content` **görünür** |
| `""` | **bilerek boşaltıldı** | eski metin **görünmez** |

**Okuma:** Faz 3.1'deki "boşluk da content'e düşer" sapması kaldırıldı. Kural, eski `body ?? content` ile birebir aynı oldu: yalnız NULL olduğunda eski kolona düşülür.

**Admin:** Boşaltılan metin alanı daima `""` olarak gönderilir (`textPatch`). Eski sayfa formu (2. dalga) zaten `""` yazıyor; davranış iki yolda da tutarlı.

**Eski veri:** `pages.content` kolonuna hiçbir yol yazmıyor; eski sayfalar NULL gövdeyle eskisi gibi görünüyor.

**İzole PG testi:**

- NULL gövde → eski `content` görünür;
- `""` → görünmez ve `missing` listesine girer;
- `pages.content` değişmeden kalır;
- `null` yazılınca eski `content` yeniden görünür;
- yeni gövde yazılınca yeni gövde görünür.

---

## 6. Yetki, denetim kaydı, transaction ve eşzamanlılık

**Yetki** (eylemde):

- Okuma ve liste eylemleri: `requirePermission(<modül izni>)`.
- Çeviri kayıtları: `authorizeAdminSession` + `callerHasPermission` (eski desen).
- Menü API'si: `authorizeAdminCaller` + `callerHasPermission`.
- `server-action-authz` statik taraması geçiyor.
- Yetkisiz veya oturumsuz çağrıda yazma katmanına hiç inilmiyor (test edildi).

**Denetim kaydı:**

- `admin_activity_logs`'a **sunucuda** yazılır. Mevcut route ile aynı `sanitizeForAudit`, `boundJsonSize` ve `computeDiffSummary` kullanılır.
- Kayıt şu alanları taşır: `content.update`, `content.translation_create` veya `content.create` eylemi; varlık; dil; önce/sonra; diff.
- **Commit sonrası** yazılır. Başarısız kayıtta yazılmaz. Log hatası kaydı bozmaz (test edildi).

**Transaction ve kilit:** Faz 4 kuralları aynen geçerli: tek transaction, deterministik kilit sırası, slug advisory kilitleri, `40P01` durumunda yeniden deneme. Yeni kayıt ana kayıtla birlikte aynı transaction'da oluşur.

**Kısmi güncelleme:** Satır kaydı yalnız ilgili alanı gönderir; diğer alanlar ve diller korunur. NULL ile `""` ayrımı korunur.

---

## 7. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| Tam paket (8 parça) | **266 dosya, 5.057 test: 5.005 başarılı, 52 atlanan, 0 başarısız** |
| Yeni Faz 5 birim testleri | 16 (`faz5-admin-content.test.tsx`) + 3 (`content-slug-separation-routing.test.ts`) |
| İzole PG: Faz 5 (`content-faz5-pg`, 108 taslağı + 108'siz kopya) | **9/9**, art arda 2 koşu |
| İzole PG: Faz 4 yazma (yeni kararla güncellendi) | **18/18**, art arda 2 koşu |
| İzole PG: Faz 3 okuma | **14/14** |
| 108 taslağı: uygula / tekrar uygula / geri al | ✅ / ✅ / ✅; ayna sapması **0** |
| TypeScript | Kaynak kodda **0 hata** (61 eski `.next/types` hatası değişmedi) |
| ESLint | **0 hata**, 194 uyarı (önceki toplamla aynı; yeni uyarı yok) |
| Production build | **Başarılı:** 35,1 sn, 49/49 sayfa |

**Tam paket sayıları:**

- Faz 4 sonunda 5.029 test vardı; 28 yeni test eklendi.
- 52 atlanan testin 11'i önceden atlanan testler. Diğer 41'i (okuma 14, yazma 18, Faz 5 9), normal pakette DB adresi olmadığı için atlanan izole PG testleri.

**İstenen senaryoların karşılığı:**

| İstenen | Kapsam |
|---|---|
| Ana dil TR / EN / DE | Birim: düzen, liste ve kayıt (EN, DE). PG: **14 türün hepsi** × 3 ana dil |
| Üç dilde yeni kayıt | PG: 12 tür için yalnız ana dilde ve 3 dilde birden `createContent`; settings ve site_popup tekil kayıt olduğu için yeni çeviri satırı |
| Üç dilde güncelleme | PG: 14 tür × TR/EN/DE |
| Eksik çeviri | PG: ana dilden yedek, `sourceLocale`, blog/sayfada `isFallback`. Birim: panel ve rozet |
| Teknik anahtar ↔ slug ayrımı | PG: 108 ile TR slug değişir, teknik anahtar değişmez, ayna ezmez, routing doğru çözer; 108'siz `guard`. Birim: routing |
| Slug değişikliği ve geçmişi | PG: `url_redirects(villa,'tr',eski)`, temizleme, çakışma |
| Eski yazma yolunun kapalı olması | Birim: 7 eski çeviri servisi reddediyor ve DB'ye inmiyor; admin kodunda eski çağrı yok (statik tarama) |
| Yetki kontrolü | Birim: izinsiz/oturumsuz → yazma yok; `server-action-authz` taraması |
| Denetim kaydı | Birim: içerik, başarısızlıkta yazmama, log hatası toleransı |
| `content` uyumluluğu | PG + birim (§5) |
| Eşzamanlı yazma | PG: aynı teknik anahtarla 6 eşzamanlı oluşturma → tam 1 başarılı; 15 tur ters sıralı toplu yazma → **0 deadlock** |
| Transaction rollback | PG: yeni kayıtta ikinci dil çakışırsa ana kayıt oluşmuyor; Faz 4 rollback testleri |

**Güncellenen mevcut testler** (gerekçesiyle):

- `routing-dispatch-proxy`: TR satırları artık haritaya girer (karar 1 gereği).
- `content-write-core` ve `content-write-pg`: TR slug artık teknik anahtarı yazmaz; 108 yoksa `guard`.
- `content-read-compat`: boşluklu `body` artık eski `content`'i göstermez (§5).
- `type-translations-action` ve `payment-method-translations` (eylem kısmı): delege hedefi eski servis yerine merkezi katman oldu; yetki assertion'ları aynen kaldı.
- 7 eski servis test dosyası: "modül taşınmamış" varsayımıyla eski mantığı test etmeye devam ediyor (modül listesi mock'lanıyor); kapalılık ayrıca test ediliyor.

Beklentileri gevşetilen test yok.

---

## 8. Eksikler, riskler ve Migration 108 durumu

**Eksik (bu dalgada yapılmadı):**

1. **2. dalga yapılmadı:** villa (çok adımlı form + `VillaTranslationsCard`), blog, CMS sayfası (sections, kapak, `content` formu), settings (+ çeviriler sayfası) ve site_popup. Bu 5 modülde eski yazma yolu **açık ve tek yol**. Merkezi servis bu modüller için kapalı, yani çift yol yok.
2. **Satır rozetleri her yerde yok:** "Ana dil" notu ve eksik rozeti şu an olanaklar, kurallar ve fiyata dahil sayfalarında. Diğer 1. dalga modüllerinde eksik bilgisi yalnız panel içinde gösteriliyor.

**Riskler:**

1. **Routing değişikliği canlıda etkin olacak.** TR slug'ı artık çeviri satırından okunuyor. 107 uygulanmadan önce ve sonra URL'ler aynı kalıyor (test edildi), ancak 108 uygulandıktan sonra TR slug'ı düzenlenirse TR URL'si değişir. Eski URL, `url_redirects` (tr) üzerinden yönlenir.
2. **Boş TR aynası.** Ana dil TR değilken oluşturulan kaydın TR aynası boş başlıyor (onaylı karar). TR okuyan eski kodlar boş görür; örneğin voucher/e-posta ödeme yöntemi adını boş görebilir (karar 7). Admin TR çevirisini girmeli; panelde "eksik" görünüyor.
3. **Eski yollar canlıda kapanacak.** 1. dalga modüllerinin eski yazma yolları kapatıldı. Faz 1–4 migration'ları (105–107) canlıya uygulanmadan bu kod yayınlanırsa yeni yol çalışmaz, çünkü `content_mirror_mode()`, 106 aynası ve 105 tabloları gerekiyor. **Kod, 105–107'den önce deploy edilmemeli.**
4. **Teknik anahtarı olmayan eski kategoriler.** Slug'ı NULL olan eski kategoriye ad güncellemesi artık teknik anahtar üretmiyor (eskiden addan üretiliyordu). Kapak yükleme için teknik anahtar gerekiyor; böyle kayıtlar ayrı bir veri düzeltmesi ister.
5. **SSS kaydı tam atomik değil.** Silme ve teknik sıra güncellemesi ayrı adımlarda yapılıyor (eski davranış da atomik değildi). İçerik yazımı ise tek transaction'da.

**Migration 108 (mod değişimi) koşulları:**

| Koşul | Durum |
|---|---|
| Bütün admin modülleri yeni servisi kullanıyor | ❌ 9/14 (2. dalga eksik) |
| Yeni kayıtlar TR çeviri satırını da oluşturuyor | ✅ (`createContent` + ayna INSERT) |
| Eski yazma yolları kapalı | ❌ 9/14 |
| Eksik TR satırları için güvenli kontrol | ✅ 107 doğrulaması; servis `tr` satırı yokken TR slug'ında `not-found` döner |
| Guard ve ayna doğrulanmış | ✅ izole PG |
| Teknik anahtar ↔ slug ayrımı | ✅ kod + 108 taslağı |

Koşullar sağlanmadığı için **mod değişimi migration'ı tasarlanmadı.** Mevcut 108 taslağı yalnız dil slug ayrımını içeriyor; mod değişimi ayrı bir migration (ör. 109) olmalı.

---

## 9. Faz 6'ya geçiş koşulları

1. **2. dalga tamamlanmalı:** villa, blog, sayfa, ayarlar ve popup aynı desenle geçirilmeli, eski yolları kapatılmalı (`CONTENT_WRITE_MIGRATED` 14/14).
2. **Canlı ön kontroller alınmalı:** Faz 0.1 Q1–Q12 ve `pages.content` sorgusu.
3. **Migrations sırayla uygulanmalı** (ayrı onaylarla, önce staging/kopya veritabanında): 105 → 106 → 107 → **108 (dil slug ayrımı)**. Ardından okuma, yazma ve Faz 5 izole testleri canlı kopyada çalıştırılmalı.
4. **Deploy sırası:** Bu kod **105–107 uygulandıktan sonra** yayınlanmalı (§8 risk 3). TR slug düzenleme 108 uygulandığında kendiliğinden açılır.
5. **Mod değişimi:** Ancak 14/14 geçiş ve canlı doğrulamadan sonra ayrı bir migration (109) olarak tasarlanmalı.
6. **Kapsam dışı:** Rezervasyon, fiyat, ödeme, voucher ve e-posta (TR) kapsam dışında kalmaya devam ediyor.

*Faz 5 1. dalga tamamlandı. Faz 6'ya geçilmedi; commit, push ve deploy yapılmadı.*
