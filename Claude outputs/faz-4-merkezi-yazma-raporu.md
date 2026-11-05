# Faz 4: Merkezi İçerik Yazma Servisi (Seçenek D)

**Tarih:** 4 Kasım 2026
**Kapsam:** `lib/i18n/content/` altında merkezi yazma altyapısı ve izole PostgreSQL doğrulaması.

**Bu fazda yapılmayanlar:**

- Admin ekranları değişmedi.
- Mevcut yazma servisleri yeni servise bağlanmadı ve devre dışı bırakılmadı.
- Public sayfalar değişmedi.
- `content_mirror_mode()` değeri değişmedi (`'base'`).
- Migration 105–107'ye dokunulmadı. Migration 108 oluşturulmadı. Hiçbir migration çalıştırılmadı.
- Canlı DB'ye, sunucuya veya Coolify'a bağlanılmadı.
- Commit, push ve deploy yapılmadı.
- Faz 5'e geçilmedi.

`git diff --stat` boş: izlenen hiçbir dosya değişmedi. HEAD hâlâ `8afb11a`.

---

## 1. Oluşturulan ve değiştirilen dosyalar

### Yeni (`lib/i18n/content/`)

| Dosya | Satır | Görev |
|---|---|---|
| `content-write-validate.ts` | 129 | `validateContentPayload` (saf): alan whitelist'i, tipler, popup uzunlukları, slug biçimi. `contentWriteTarget` (mod + dil → hedef) |
| `content-write-sql.ts` | 147 | Saf SQL üretici: kilitler, ana tablo UPDATE'i, çeviri upsert'i, slug çakışma sorguları. Yalnız parametreli sorgular |
| `content-write-core.ts` | 404 | Çekirdek servis: `saveContent`, `saveContentMany`, `getContentWriteConfig`, hata eşlemesi, deadlock'ta yeniden deneme |
| `content-write.server.ts` | 80 | Sunucu bağlantısı: pg transaction, commit sonrası cache geçersiz kılma, **etkinleştirme bayrağı** |

### Değişen (Faz 1'de oluşturulan, izlenmeyen dosya)

`content-contract.ts` geriye uyumlu genişletildi:

- `ContentWriteResult` başarı durumunda `created`, `target`, `mode`, `written` ve `slug` alanlarını da taşıyor.
- Yeni hata kodları: `not-found`, `busy`, `disabled`.
- Yeni tip: `ContentWriteItem`.
- `saveContentMany` arayüze eklendi.

### Testler

| Dosya | Test | Not |
|---|---|---|
| `tests/unit/content-write-core.test.ts` | 26 | Sahte transaction ile davranış, kilit sırası ve sınır bekçileri |
| `tests/integration/content-write-pg.test.ts` | 18 | İzole PG. `CONTENT_WRITE_PG_URL` yoksa **atlanır** |

**Migration analizi:** Faz 4 için yeni migration **gerekmiyor**. Servis 105 ve 106'nın mevcut ayna, guard ve slug geçmişi mekanizmalarıyla çalışıyor. Bu yüzden taslak migration da oluşturulmadı. Faz 5 için gereken şema işleri §9'da.

---

## 2. `saveContent` mimarisi

```
saveContent(entity, parentId, locale, patch, {actorId})
   └─ saveContentMany([öğe])            ← tek giriş noktası
        1. enabled()? değilse → {ok:false, code:"disabled"}   (sorgu yok)
        2. actorId zorunlu
        3. prepare: varlık (registry), kanonik kimlik, dil, validateContentPayload,
                    aynı (varlık, kayıt, dil) iki kez → red            (sorgu yok)
        4. TEK TRANSACTION
             SET LOCAL lock_timeout / statement_timeout
             mod = content_mirror_mode()
             ana kayıtlar FOR UPDATE        (deterministik sıra, §4)
             slug advisory kilitleri        (anahtar sırası)
             her öğe:  NOT NULL kontrolü (şemadan) → slug kontrolleri →
                       hedef = contentWriteTarget(dil, mod)
                         "base"        → UPDATE ana tablo (ayna tr satırını yazar)
                                         + aynanın slug'ı doğru yazdığı doğrulanır
                         "translation" → INSERT … ON CONFLICT (fk, locale) DO UPDATE
                                         (yalnız gönderilen kolonlar)
        5. COMMIT → onCommitted: cache tag'leri (+ slug değiştiyse locale-slugs)
           Hata  → ROLLBACK (hiçbir öğe kalmaz); 40P01 → bütün tx yeniden (≤2)
```

### Hedef seçimi

Hedef, transaction içinde okunan **DB modu** ile belirlenir. **Ana dil (`settings.public_default_locale`) hedefi etkilemez**; ana dil değişince içerik taşınmaz. Bu bir testle de doğrulandı: ana dil TR → EN → DE değiştirilirken her yazma aynı yere gitti ve diğer satırlar yerinde kaldı.

| Mod | TR | EN / DE |
|---|---|---|
| `base` (bugün) | Ana tablonun kalıcı ayna kolonları + teknik slug. 106 aynası `tr` satırını aynı transaction'da günceller | Çeviri satırı |
| `translations` (Faz 5+) | `tr` çeviri satırı. 106 aynası ana kolonları günceller (slug hariç) | Çeviri satırı |

### Senkronizasyon güvenliği

- Servis ayna bayrağını (`app.content_mirror`) **hiçbir zaman açmaz**. Guard'ları atlatmaz, yalnız o moddaki doğru tarafa yazar.
- Ters taraf yalnız 106'nın tek yönlü aynasıyla güncellenir. Bu yüzden kontrolsüz çift yönlü senkron oluşmaz.
- Bekçi testi: yazma dosyalarında `set_config(`, DDL, mod değiştiren ifade ve `url_redirects` erişimi yok.

### Eski ve yeni yazma yolunun aynı anda etkin olmaması

- `content-write.server.ts` bir bayrağa bağlı: `CONTENT_WRITE_SERVICE_ENABLED=1` değilse **her çağrı** `disabled` döner. Varsayılan **kapalı**.
- Hiçbir modül bu dosyayı import etmiyor (bekçi testi).
- Faz 5'te modül modül, eski yol kapatılırken açılacak.

### Payload kuralları (`validateContentPayload`)

**Kabul edilen alanlar:**

- Yalnız registry'deki çevrilebilir alanlar, slugKind'li varlıkta ayrıca `slug`.
- Teknik alanlar (`id`, `locale`, parent FK, zaman damgaları) ve bilinmeyen anahtarlar → `validation`.

**Eksik, NULL ve boş ayrımı:**

| Gönderilen | Davranış |
|---|---|
| anahtar yok (veya `undefined`) | Alana **dokunulmaz** (kısmi güncelleme) |
| `null` | NULL yazılır |
| `""` | `""` yazılır (normalize edilmez) |

**Tip ve uzunluk:**

- Metin alanları `string | null` olmalı.
- `sections` dizi veya NULL olmalı.
- `stats` en fazla 4 öğeli bir metin dizisi olmalı; NOT NULL olduğu için NULL kabul edilmez.
- Popup alan uzunlukları 096 CHECK'leriyle aynı (`POPUP_LIMITS`).

**NOT NULL kolonlar:** Şemadan okunur (`information_schema`, tablo başına süreçte bir kez).

- Çeviri tablosunun NOT NULL kolonuna NULL gönderilemez.
- TR yazmalarında ana tablonun NOT NULL kolonuna da gönderilemez. Bu kural iki modda da uygulanır: translations modunda 106 aynası NULL'ı `COALESCE` ile yutardı ve `tr` satırı ile ana kolon ayrışırdı. Örnek: `blog_posts.title` TR için NULL olamaz, EN için olabilir.

### `getContentWriteConfig()`

Şunları döner:

- etkin olup olmadığı;
- DB modu;
- diller;
- 14 varlığın tablo, ana tablo ve alan bilgisi, slug taşıyıp taşımadığı ve dil bazında yazma hedefi.

---

## 3. Desteklenen 14 içerik türü

| # | Varlık | Çeviri → ana tablo (FK) | Alanlar | Slug | Doğrulanan |
|---|---|---|---|---|---|
| 1 | villa | villa_translations → villa (villa_id) | description, badge, seo_title, seo_description | ✔ | Oluştur, güncelle, TR ayna, slug, eşzamanlılık |
| 2 | villa_type | villa_type_translations → villa_types (type_id) | name | ✔ | Oluştur, güncelle, TR ayna |
| 3 | villa_feature | → villa_features (feature_id) | name | – | aynı |
| 4 | rule_item | → rule_items (rule_id) | title | – | aynı |
| 5 | price_include_item | → price_include_items (include_id) | title | – | aynı |
| 6 | blog_post | → blog_posts (blog_post_id) | title, body, excerpt, seo_title, seo_description | ✔ | + NOT NULL (`title`) |
| 7 | page | → pages (page_id) | title, body, excerpt, seo_title, seo_description, sections (jsonb) | ✔ | aynı |
| 8 | faq | → faqs (faq_id) | question, answer | – | aynı |
| 9 | menu | → menu (menu_id) | name | – | aynı |
| 10 | payment_method | → payment_methods (payment_method_id) | name | – | aynı |
| 11 | settings | → settings (settings_id) | 9 metin alanı | – | aynı |
| 12 | site_popup | → site_popup (popup_id **smallint**) | title, description, highlight_text, stats (jsonb), button_text, button_url | – | + uzunluk / `stats` kuralları |
| 13 | homepage_collection | → homepage_collections (collection_id) | custom_title | – | aynı |
| 14 | discount_collection | → discount_collections (collection_id) | custom_title | – | aynı |

Her tür için izole PG'de doğrulananlar:

- **Mod `base`:**
  - DE **yeni satır oluşturma** (`created=true`) ve **güncelleme** (`created=false`);
  - TR yazma (ana kolon ve `tr` satırı eşit);
  - EN yazma ve ardından merkezi okuma servisinden okuma (ana dil TR, EN ve DE).
- **Mod `translations`:** TR, EN ve DE yazma ve ana kolon aynası.

---

## 4. Transaction ve kilit stratejisi

| Kural | Uygulama |
|---|---|
| Transaction sınırı | `saveContentMany` = **tek transaction**. Bir öğe hata verirse hepsi geri alınır. Cache geçersiz kılma **yalnız commit sonrası** yapılır |
| Kilit zaman aşımı | `SET LOCAL lock_timeout` (5 sn) ve `statement_timeout` (15 sn). Aşımda `busy` döner |
| Aynı kayda eşzamanlı yazma | Önce ana kayıt `SELECT … FOR UPDATE` ile kilitlenir. Aynı kayda bütün dillerdeki yazmalar sıraya girer. Kısmi UPDATE, gönderilmeyen alanlara dokunmadığı için **kayıp güncelleme olmaz** |
| Deterministik kilit sırası | Ana kayıtlar (registry sırası, kanonik kimlik) sırasıyla ve tekrarsız kilitlenir. Ardından slug advisory kilitleri anahtar sırasıyla, ardından yazmalar aynı sırayla yapılır. Bütün oturumlar aynı sırayı izlediği için kilit döngüsü oluşamaz |
| Kilit yönü | Ana kayıt her zaman `tr` satırından önce kilitlenir. Böylece iki ayna yönü (base→tr, tr→base) aynı sırayı paylaşır |
| Slug yarışı | `pg_advisory_xact_lock(hashtextextended('content-slug:<tür>:<slug>'))`: aynı slug'ı talep eden oturumlar sıraya girer, böylece tablolar arası (ana ↔ çeviri) çakışma kontrolü yarışsız olur. Son güvence `(locale, slug)` partial unique index'i (`23505` → `conflict`) |
| Deadlock | Servis yazmaları arasında oluşmaz. Eski yazma yollarıyla çakışmada `40P01` alınırsa bütün transaction en fazla 2 kez yeniden denenir |
| Hata eşlemesi | `23505` → conflict, `23514` / `23502` / `22P02` / `22001` → validation, `23503` → not-found, `55P03` / `57014` → busy, `content_mirror_guard` → guard, diğer → db |

### İzole PG kanıtı

- **Kontrol deneyi:** Ham SQL ile iki oturum iki villayı ters sırayla günceller (Faz 2 K4). **`40P01` deadlock oluşur.**
- **Servis:** Aynı villalar 30 tur × 4 eşzamanlı toplu yazma, dört farklı sırayla ve TR+EN karışık. Sonuç: **0 deadlock, 120/120 transaction ilk denemede commit.**
- **Aynı kayıt:** 24 paralel yazma (EN ve DE, 4 farklı alan) → hepsi başarılı, hiçbir alan kaybolmadı. 12 paralel yazma aynı alana → son değer gönderilenlerden biri. TR ve EN aynı kayda paralel yazıldı → ayna tutarlı (`tr` = ana kolon).
- **Slug yarışı:** İki kayıt aynı EN slug'ını 10 tur boyunca aynı anda talep etti → her turda **tam olarak biri** kazandı, diğeri `conflict` aldı, DB'de tek sahip kaldı.
- **Kilit zaman aşımı:** Başka bir oturum kaydı kilitliyken → `busy`.
- **Test sonrası değişmez kontrolü:** Bütün villalarda `tr` satırı = ana kolonlar (**0 sapma**).

---

## 5. Mirror davranışı

| Durum | Servisin yazdığı taraf | Ayna (106) | Doğrulama |
|---|---|---|---|
| `base` + TR | Ana tablo | ana → `tr` satırı (aynı transaction) | 14 tür: ana kolon = `tr` satırı |
| `base` + EN/DE | Çeviri satırı | – | – |
| `translations` + TR | `tr` çeviri satırı | `tr` → ana kolonlar (slug hariç) | 14 tür: ana kolon = `tr` değeri |
| `translations` + EN/DE | Çeviri satırı | – | – |

**Guard'lar:**

- `base` modunda `tr` satırına doğrudan yazma DB'de reddedilir (test edildi). Servis bu yüzden ana tabloya yazar.
- `translations` modunda ana tabloya doğrudan yazma reddedilir (test edildi).

**Faz 2 sınırının kapanması:** `translations` modunda TR satırı olmayan yeni kayda (eski kodla eklenmiş) TR yazma artık **satırı oluşturuyor** (`created=true`) ve ana kolonu aynalıyor (test edildi). Bu, Faz 2'deki "translations modunda eski kod INSERT'i `tr` satırı oluşturmaz" sınırını servis tarafında kapatıyor.

**Mod testi hakkında:** `translations` modu yalnız **ayrı, tek kullanımlık bir test DB'sinde** (`f4t`) ve yalnız test süresince `content_mirror_mode()` yeniden tanımlanarak denendi. Test sonunda `'base'`e geri alındı (doğrulandı). Repoda ve hiçbir migration'da mod değiştirilmedi.

---

## 6. Slug ve slug history davranışı

**Biçim:**

- Mevcut `checkLocalizedSlugFormat` kullanılır: 102 formatı, ayrılmış kelimeler ve güvenli normalizasyon (`"Deniz Manzaralı"` → `deniz-manzarali`).
- Boş değer `null` olur. Hatalı biçim → `validation`.

**Çakışma kuralları:** Mevcut `validateLocalizedSlug` ile aynı, ancak transaction içinde ve kilit altında uygulanır.

- Başka kaydın ana/teknik slug'ı → `conflict`.
- Aynı dilde başka kaydın çeviri slug'ı → `conflict`.

**Mod `base` + TR:**

- TR slug'ı ana kaydın **teknik anahtarıdır** (bugünkü admin davranışıyla aynı). Ana tabloya yazılır ve ayna `tr` satırına kopyalar.
- Boş bırakılamaz (`validation`).
- Ayna slug'ı çakışma veya biçim nedeniyle NULL'a düşürürse sessizce kabul edilmez: transaction geri alınır ve `conflict` döner.

**Mod `translations` + TR:** Yalnız `tr` satırının slug'ı yazılır. Teknik anahtar **değişmez**. `null` verilirse URL teknik anahtara düşer.

**Slug geçmişi:** Servis `url_redirects`'e **hiç yazmaz**. Geçmişi 103 ve 106 trigger'ları yönetir (izole PG'de doğrulandı):

| Durum | Sonuç |
|---|---|
| EN slug değişimi | `url_redirects(villa, en, eski)` |
| EN slug'ı eski değerine dönerse | Yönlendirme silinir |
| EN slug temizleme (`null`) | Geçmişe yazılır |
| `base` + TR slug değişimi | `url_redirects(villa, tr, eski)` (ana tablo trigger'ı); ayna çift kayıt üretmez |
| `translations` + TR slug değişimi | `url_redirects(villa, tr, eski)` (çeviri trigger'ı) |

Okuma servisi yeni slug'ı hemen çözer (`findIdBySlug`). Commit sonrası `revalidateLocaleSlugs()` çağrılır.

---

## 7. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| Yeni birim testleri (`content-write-core.test.ts`) | **26/26 başarılı** |
| İzole PG yazma entegrasyonu (PG 16; `f4` mod=base + `f4t` mod=translations) | **18/18 başarılı, art arda 3 koşuda kararlı** |
| İzole PG okuma entegrasyonu (Faz 3/3.1, genişletilmiş sözleşmeyle) | **14/14 başarılı** |
| Tam paket (8 parça) | **263 dosya, 5.029 test: 4.986 başarılı, 43 atlanan, 0 başarısız** |
| TypeScript | Kaynak kodda **0 hata** (sayılan 61 hatanın hepsi eski `.next/types`'tan, değişmedi) |
| ESLint (tüm repo) | **0 hata.** 194 uyarının hepsi önceden var; yeni dosyalarda 0 |
| Production build (izole kopya) | **Başarılı:** 33,4 sn, 49/49 statik sayfa |

**Tam paket sayıları:**

- Faz 3.1 sonunda 4.985 test vardı; 44 yeni test eklendi (26 birim, 18 entegrasyon).
- 43 atlanan testin 11'i önceden atlanan testler. Diğer 32'si (14 okuma + 18 yazma), normal pakette DB URL'si olmadığı için atlanan entegrasyon testleri.

**İstenen senaryoların karşılığı:**

| İstenen | Test |
|---|---|
| 14 türde yeni kayıt oluşturma / mevcut kayıt güncelleme | DE oluştur + güncelle (`base`); TR satırı olmayan kayıtta TR oluşturma (`translations`) |
| TR, EN, DE yazma | 14 tür × TR (`base`) + EN (`base`) + TR/EN/DE (`translations`) |
| Ana dil TR, EN, DE | Yazma hedefi ve veri yeri değişmiyor; okuma servisi her ana dilde yazılanı görüyor |
| Legacy TR mirror | 14 tür ana kolon = `tr` satırı; test sonrası 0 sapma |
| Eksik alan ve NULL | Kısmi güncelleme, NULL, `""`, NOT NULL reddi, `stats` NULL reddi |
| Slug çakışması ve slug history | §6 |
| Transaction rollback | Toplu yazmada çakışma; yazma sırasında enjekte DB hatası (çeviri ve ana tablo yolu) → 0 iz |
| Eşzamanlı yazma (aynı ve farklı kayıt) | §4 |
| Deterministik kilit sırası | Birim: karışık girdi → sıralı kilit, sonra slug kilidi, sonra yazma. PG: kontrol deneyi + 0 deadlock |
| Okuma servisiyle uyumluluk | 14 tür × ana dil TR/EN/DE: `getContent` yazılan değeri `sourceLocale` ile döndürüyor; `findIdBySlug` yeni slug'ı buluyor |

---

## 8. Bilinen riskler ve çözülemeyen konular

**Karar gerektiren mimari çelişki:**

- **Mod `base`'de TR slug = teknik anahtar.** Bugünkü admin davranışı korundu (TR slug'ı değiştirmek ana `slug`'ı değiştirir). Faz 0 planına göre `translations` modunda teknik anahtar dil slug'larından ayrılıyor. Bu, iki mod arasında TR slug semantiğinin **farklı** olduğu anlamına gelir. Faz 5'te TR slug düzenlemesinin hangi moda kadar teknik anahtarı değiştireceği **açıkça karara bağlanmalı**. Varsayım yapılmadı; mevcut davranış korundu.

**Diğer riskler:**

1. **Eski yollarla deadlock:** Eski yazma yolları (admin formları) bu kilit sırasını izlemiyor. Servis ve eski yollar aynı kayıtlara aynı anda yazarsa deadlock yine mümkün. Servis bunu yeniden deneyerek karşılar, ancak asıl çözüm Faz 5'te eski yolun ilgili modül için kapatılması. İki yol aynı anda etkin olmamalı (bayrak varsayılan kapalı).
2. **`pages.content` (Faz 3.1):** Servis eski `content` kolonuna yazmaz (eski kolonlar silinmez ve değiştirilmez). TR gövdesi `null` veya boş yazılırsa, okuma servisi eski `content` metnini yedek olarak yeniden gösterebilir. Faz 5'te admin "gövdeyi temizle" akışı bunu hesaba katmalı, ya da `content` metninin `body`'ye taşınması ayrı bir veri kararı olarak ele alınmalı.
3. **Yetki kontrolü:** `actorId` zorunlu ama servis yetki kontrolü yapmaz ve denetim kaydı yazmaz. Yetki (`requirePermission`) ve `admin_activity_logs`, Faz 5'te servisi çağıran server action'ın sorumluluğunda olmalı.
4. **Revalidation kapsamı:** Commit sonrası `content`, `content:<varlık>` ve eski tag'ler revalidate ediliyor (`settings` yalnız settings içeriğinde). Faz 3'te kalıcı cache'e alınmayan 6 türün public sayfaları kendi cache'lerine bağlı; Faz 5 geçişinde her modülün `revalidatePath` ihtiyacı ayrıca kontrol edilmeli.
5. **Canlı şema doğrulanmadı:** Testler minimal ana tablo şemalarıyla izole PG 16'da yapıldı. Canlı şemanın NOT NULL ve unique özellikleri (ör. `villa_types.slug` unique mi?) Faz 0.1 Q1–Q12 ile doğrulanmalı. Servis NOT NULL kolonları zaten çalışma anında şemadan okuyor.
6. **İyimser eşzamanlılık yok:** Aynı alana eşzamanlı yazmada son yazan kazanır (kilitli ve tutarlı, ama "başkası değiştirdi" uyarısı yok). Admin'de iki kişinin aynı içeriği aynı anda düzenlemesi bekleniyorsa Faz 5'te `updated_at` tabanlı bir kontrol eklenebilir.

---

## 9. Faz 5'e geçiş koşulları

1. **Canlı ön kontroller:** Faz 0.1 Q1–Q12 ve Faz 3.1'deki `pages.content` sorgusunun sonuçları alınmış olmalı.
2. **Migrations:** 105–107 ayrı onayla önce staging/kopya veritabanında, sonra canlıda uygulanmış olmalı. 107 doğrulaması 0 fark göstermeli.
3. **Canlı kopyada testler:** Okuma ve yazma entegrasyon testleri **canlı DB'nin bir kopyasında** çalıştırılmalı (`CONTENT_READ_PG_URL` / `CONTENT_WRITE_PG_URL`; yazma testi veri değiştirir, yalnız kopyada).
4. **TR slug kararı:** §8'deki "TR slug = teknik anahtar mı?" sorusu karara bağlanmalı.
5. **Migration 108 tasarımı (Faz 5 işi, ayrı onay):** Modül bazında ayna yönü. Ayrıca `translations` modunda eski kodun ana tabloya yaptığı INSERT için `tr` satırı oluşturan bir yol ve `REDIRECTS_SQL`'deki "`tr` = taban geçmişi" varsayımının ayrıştırılması (Faz 0 §6) gerekiyor.
6. **Modül bazında geçiş:** Her modül için:
   - admin server action'ı yetki kontrolü yapıp `saveContent` / `saveContentMany` çağırır;
   - o modülün eski yazma yolu **aynı değişiklikte** kapatılır;
   - bayrak (`CONTENT_WRITE_SERVICE_ENABLED`) ancak eski yollar kapatıldıkça açılır;
   - geri dönüş: bayrak kapatılır ve eski form geri açılır.
7. **Kapsam dışı:** Rezervasyon, fiyat, ödeme, voucher ve e-posta (TR) geçişin dışında kalır (karar 7).

*Faz 4 tamamlandı. Faz 5'e geçilmedi; commit, push ve deploy yapılmadı.*
