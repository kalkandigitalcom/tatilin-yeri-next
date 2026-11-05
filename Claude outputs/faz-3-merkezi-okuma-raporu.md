# Faz 3: Merkezi Simetrik İçerik Okuma Servisi (Seçenek D)

**Tarih:** 4 Kasım 2026
**Kapsam:** Yalnız merkezi okuma servisi, mevcut okuma yollarına paralel. Hiçbir modül yeni servise taşınmadı.
**Dokunulmayanlar:** Migration oluşturulmadı/çalıştırılmadı. Canlı DB ve sunucuya bağlanılmadı. Yazma servisleri, admin ekranları, public sayfalar, rezervasyon, fiyat ve ödeme kodu değişmedi. Commit, push ve deploy yapılmadı. Faz 4'e geçilmedi.

---

## 1. Oluşturulan ve değiştirilen dosyalar

`git diff --stat` boş: izlenen (tracked) hiçbir dosya değişmedi. Bütün değişiklikler yeni ve izlenmeyen dosyalarda.

### Yeni dosyalar: `lib/i18n/content/`

| Dosya | Satır | Görev |
|---|---|---|
| `content-resolve.ts` | 199 | Saf çözümleyici: boşluk kuralı, yedek zinciri ile alan bazında seçim, kimlik doğrulama/kanonikleştirme, cache anahtarı |
| `content-sql.ts` | 78 | Saf SQL üretici (yalnız SELECT, tanımlayıcı beyaz listesi, değerler parametre) |
| `content-repository.ts` | 78 | Bağlantıdan bağımsız repository (`query` enjekte edilir), 500'lük parçalama |
| `content-locale-context.ts` | 41 | settings'ten ana dil ve aktif diller (mevcut `getRootLocale` / `getEnabledPublicLocales`) |
| `content-cache-policy.ts` | 63 | Tag ve kalıcı cache politikası (14 varlık) |
| `content-read-core.ts` | 248 | Çekirdek servis: `getContent`, `getContentMany`, `getCoverage`, `getAllLocales`, `findIdBySlug`, `getCoverageReport` |
| `content-read.server.ts` | 87 | Sunucu bağlantısı: `getPgPool`, `unstable_cache`, React `cache()`, `getCachedSettings` |
| `content-legacy-compare.ts` | 116 | Teşhis: eski okuma kuralının birebir simülasyonu ve fark sınıflandırma |

### Değişen dosya (Faz 1'de oluşturulan, izlenmeyen)

`content-contract.ts` geriye uyumlu genişletildi:

- `LocalizedContent` tipine `fallbackFields?` ve `requestedLocale?` eklendi.
- `getCoverage` dönüş tipi `ContentCoverage` oldu. Bu tip `{total, filled}` ile birlikte `rows?` ve `slugFilled?` alanlarını da taşır.

### Yeni testler

| Dosya | Test | Not |
|---|---|---|
| `tests/unit/content-read-core.test.ts` | 34 | Sahte repository ile davranış |
| `tests/unit/content-read-sql-resolve.test.ts` | 12 | SQL, boşluk ve kimlik kuralları, dil bağlamı, tag literal'leri |
| `tests/unit/content-read-server.test.ts` | 4 | Sunucu bağlantısı (mock'lu) ve "hiçbir çalışan modül import etmiyor" bekçisi |
| `tests/integration/content-read-pg.test.ts` | 11 | İzole PostgreSQL. `CONTENT_READ_PG_URL` yoksa **atlanır**; normal suite hiçbir DB'ye bağlanmaz |

---

## 2. Mimari

```
content-read.server.ts   (server-only: pg pool + unstable_cache + React cache + settings)
        │
        ▼
content-read-core.ts     createContentReadService({ repository, getLocaleContext, cache, onError })
   │            │                     │
   ▼            ▼                     ▼
content-repository.ts   content-locale-context.ts   content-cache-policy.ts
   │
   ▼
content-sql.ts ──► content-registry.ts (14 varlık, Faz 1)  ◄── content-resolve.ts (saf çözümleme)
```

### Okuma sırası

Sıra: istenen dil → `settings.public_default_locale` → diğer aktif diller (`site_locales` sırası). Bunu Faz 1'deki `contentFallbackChain` üretir.

- **Tekrar yok:** Aynı dil zincire iki kez girmez.
- **Pasif dil yok:** Pasif dil zincirde yer almaz. Veritabanında satırı olsa bile değeri kullanılmaz.
- **TR özel durumu yok:** TR de EN/DE gibi yalnız bir çeviri satırıdır. Ana tablo kolonları okunmaz.
- **Çoklu dil kapalıysa:** Mevcut `getRootLocale` kuralı geçerli olur, yani yalnız TR aktiftir.
- **İstenen dil pasifse:** İçerik ana dilden gelir, `isFallback=true` ve `slug=null` döner.

### Alan bazında çözümleme

- Her alan için zincirdeki ilk **dolu** değer seçilir. Kaynağı `sourceLocale[alan]` alanına yazılır.
- **Boş sayılan değerler:**
  - NULL;
  - yalnız boşluktan oluşan metin;
  - jsonb'de `null`, `[]`, `{}` ve `""`.

  Bu kural eski `resolveTranslatedField` (`trim() !== ""`), `site_popup.stats` (boş dizi → yedek) ve `page.sections` davranışlarıyla aynıdır.
- Dolu metin kırpılmadan döner (eskisiyle aynı).
- Hiçbir aktif dilde dolu olmayan alanın değeri `null` olur ve alan `missing` listesine girer.
- `isFallback` yalnız **istenen dilden hiçbir alan gelmediğinde** `true` olur. Karar 5 (noindex) bununla uygulanır. Kısmi yedek, örneğin yalnız `seo_description` eksikse, `fallbackFields` alanında raporlanır ve noindex sebebi sayılmaz.
- **Slug** yalnız istenen dilin satırından gelir, yedeğe düşmez (başka dilin slug'ı yanlış URL üretir). Yoksa `null` döner ve karar 8'deki teknik anahtar kullanılır.
- **Teknik alanlar:** `id`, parent FK, `locale`, `created_at` ve `updated_at` hiçbir zaman `values` içine girmez. SQL yalnız registry alanlarını ve `slug`'ı seçer.

### Kimlikler

- Dönüş `Map`'i, çağıranın verdiği kimlik **olduğu gibi** anahtar alınarak kurulur (büyük harfli UUID dahil).
- uuid ve smallint kimlikler doğrulanır. Geçersiz kimlik DB'ye gitmez, böylece tek bir bozuk kimlik bütün batch'i `22P02` hatasıyla düşürmez.
- Tekrarlı kimlikler tek kez sorgulanır.
- `getContent(id)` aslında `getContentMany([id])` çağrısıdır.

### `null` dönüşü

`getContent` yalnız şu durumda `null` döner: kaydın **hiçbir aktif dilde** satırı yoktur. Örneğin TR pasifken satırı yalnız TR'de olan kayıt bu durumdadır. Çağıranın 404 mü gösterileceğine yoksa teknik içeriğe mi düşüleceğine karar vermesi gerekir (Faz 4 kararı, bkz. §7).

### Hata davranışı

- DB hatası cache'e **yazılmaz**, çünkü adaptör throw eden sonucu saklamaz.
- Public API `null` veya boş `Map` döner ve hatayı `console.error` ile loglar. Bu, eski katmanların "sayfa çökmez" davranışıyla aynıdır.
- `getCoverage` ise bilinçli olarak **throw eder**: eksik bir sayım, ana dil preflight'ında "%100 dolu" sanılmamalı.

### Ek fonksiyonlar

| Fonksiyon | Davranış |
|---|---|
| `getAllLocales` | Admin için bütün dillerin ham değerleri ve slug (pasif diller dahil, cache yok) |
| `findIdBySlug` | Dil bazlı slug → kimlik. Yalnız aktif dilde ve 102 formatında. Yedek yok; partial unique index kullanır |
| `getCoverageReport` | 14 varlık × diller doluluk raporu (ana dil değişimi preflight'ı için) |

---

## 3. 14 içerik türünün durumu

Bütün türler registry üzerinden okunur. Tablo, alan ve FK tanımları Faz 1 `content-registry.ts` ile aynıdır. "Kalıcı cache" sütunu §5'teki politikayı gösterir.

| # | Varlık | Çeviri tablosu → ana tablo (FK) | Çevrilebilir alanlar | Slug | Kalıcı cache (tag) | Eksik çeviri |
|---|---|---|---|---|---|---|
| 1 | villa | villa_translations → villa (villa_id) | description, badge, seo_title, seo_description | ✔ villa | ✔ villas, locale-slugs | Alan bazında zincir; slug yalnız istenen dil |
| 2 | villa_type | villa_type_translations → villa_types (type_id) | name | ✔ villaType | ✔ taxonomy, locale-slugs | aynı |
| 3 | villa_feature | villa_feature_translations → villa_features (feature_id) | name | – | istek içi | zincir |
| 4 | rule_item | rule_item_translations → rule_items (rule_id) | title | – | istek içi | zincir |
| 5 | price_include_item | price_include_item_translations → price_include_items (include_id) | title | – | istek içi | zincir |
| 6 | blog_post | blog_post_translations → blog_posts (blog_post_id) | title, body, excerpt, seo_title, seo_description | ✔ blog | istek içi | zincir; slug yalnız istenen dil |
| 7 | page | page_translations → pages (page_id) | title, body, excerpt, seo_title, seo_description, sections (jsonb) | ✔ page | istek içi | zincir; `sections` boş dizi → yedek |
| 8 | faq | faq_translations → faqs (faq_id) | question, answer | – | ✔ faqs | zincir |
| 9 | menu | menu_translations → menu (menu_id) | name | – | ✔ menu | zincir |
| 10 | payment_method | payment_method_translations → payment_methods (payment_method_id) | name | – | istek içi | zincir (voucher TR kalır, karar 7) |
| 11 | settings | settings_translations → settings (settings_id) | footer_copyright, default_meta_title, default_meta_description, hero_title, hero_subtitle, hero_badge_text, hero_primary_cta_text, hero_secondary_cta_text, business_hours | – (tek satır) | ✔ settings | zincir |
| 12 | site_popup | site_popup_translations → site_popup (popup_id **smallint**) | title, description, highlight_text, stats (jsonb), button_text, button_url | – (tek satır) | ✔ site-popup | zincir; `stats` boş dizi → yedek |
| 13 | homepage_collection | homepage_collection_translations → homepage_collections (collection_id) | custom_title | – | ✔ homepage | zincir (karar 6) |
| 14 | discount_collection | discount_collection_translations → discount_collections (collection_id) | custom_title | – | ✔ discount | zincir (karar 6) |

**Locale kodları:** Bütün tablolarda `tr`, `en` ve `de` vardır (105 sonrası CHECK). Repository her çağrıda üç dili **tek sorguda** okur; aktif/pasif filtresi çözümleyicide uygulanır.

**İzole PG'de 14 türün hepsi doğrulandı:**

- eski ↔ yeni karşılaştırma;
- `getCoverage` sonucunun elle yapılan SQL sayımıyla birebir eşitliği;
- slug çözümleme (slugKind'li türler).

---

## 4. Eski ↔ yeni okuma karşılaştırması

### Yöntem

`content-legacy-compare.ts` eski okuma kuralını birebir simüle eder:

- **TR:** daima ana tablo kolonu.
- **EN/DE:** çeviri satırı doluysa o, değilse ana tablo değeri. Ana dil ve aktif/pasif durumu yok sayılır.
- **Slug:** TR için ana tablo slug'ı, EN/DE için çeviri slug'ı.

Test, 14 türün **bütün** kayıtlarını TR, EN ve DE için hem eski kuralla hem yeni servisle okur ve farkları sınıflandırır.

### Ortam

- İzole PostgreSQL 16, tek kullanımlık `f3` DB'si (Faz 2'deki `m106`'nın kopyası).
- Migration 082–107 uygulanmış, `content_mirror_mode()='base'`.
- Faz 2 tohum verisi ile ek olarak 2 kenar durum villası ve 1.000 toplu villa (yarısının EN çevirisi var). Toplam 1.006 villa.

### Fark sınıfları

| Sınıf | Anlamı | Değerlendirme |
|---|---|---|
| `mirror-drift` | TR satırı ana kolondan farklı | **0, bütün senaryolarda.** 107 backfill ve ayna doğru çalışıyor |
| `other` | Açıklanamayan fark | **0, bütün senaryolarda** |
| `empty-normalization` | Eski `""` döndürüyordu, yeni `null` | Tasarım gereği. Görüntüde fark yok (ikisi de boş) |
| `fills-gap` | Eski boş gösteriyordu, yeni başka bir aktif dilden dolduruyor | Tasarım gereği (karar 4). Eskiden boş görünen alan artık dolu |
| `fallback-order` | İkisi de dolu ama farklı dilden | Yalnız ana dil TR **değilken** oluşur. Tasarım gereği: eksik alan önce ana dilden gelir |
| `passive-or-missing-tr` | Eski TR ana kolonunu gösteriyordu, yeni göstermiyor (TR pasif) | Tasarım gereği: pasif dil yedek değildir |
| `slug` | Slug farkı | TR'de yalnız 102 formatına uymayan ana slug (`Villa_Kotu`): 107 tr satırına NULL yazdı → teknik anahtar (karar 8). TR pasifken TR slug'ı hiç kullanılmaz |

### Sonuç (senaryo × fark sayısı)

| Senaryo | empty-normalization | fills-gap | fallback-order | passive-or-missing-tr | slug | mirror-drift / other |
|---|---|---|---|---|---|---|
| Ana dil TR, hepsi aktif | 6 | 6 | **0** | 0 | 1 | 0 |
| Ana dil EN, hepsi aktif | 6 | 6 | 506 | 0 | 1 | 0 |
| Ana dil DE, hepsi aktif | 6 | 6 | 0 | 0 | 1 | 0 |
| Ana dil EN, TR pasif | 6 | 6 | 1.013 | 1.563 | 1.009 | 0 |

### Okuma

- **Ana dil TR (bugünkü canlı durum):** Eskiden dolu gösterilen **hiçbir alan farklı bir değere dönmüyor.** Test bunu ayrıca assert ediyor. Farklar yalnız şunlar:
  - boşken artık dolan 6 alan;
  - 6 `""`→`null` normalizasyonu;
  - 1 format dışı TR slug.
- **Ana dil EN:** 506 farkın 501'i, DE çevirisi olmayan villalarda eksik açıklamanın artık TR yerine **EN'den** gelmesidir. Bu karar 4'ün doğrudan sonucudur.
- **Ana dil DE:** Fark ana dil TR ile aynıdır. Test verisinde DE çevirisi olmayan kayıtlarda EN de yoktur.
- **TR pasif:** Farkların hepsi "pasif dil yedek değildir" kuralından gelir. Canlıda TR pasif değil; bu senaryo yalnız kuralın doğrulaması için çalıştırıldı.

---

## 5. Performans ve cache

### Sorgu sayısı (N+1 yok)

- Bir `getContentMany` çağrısı, varlık başına **⌈N/500⌉ sorgu** atar. Sorgu kayıt başına değildir ve her dil yalnız bir kez okunur.
- İzole PG'de 14 tür × 3 dil × 4 senaryoda her çağrının sorgu sayısı assert edildi. Villa (1.006 kayıt) → 3 sorgu, diğerleri → 1 sorgu.
- `EXPLAIN` çıktısı:
  - `villa_id = ANY(...) AND locale = ANY(...)` → `villa_translations_villa_id_locale_key` (Bitmap Index Scan);
  - slug araması → `villa_translations_locale_slug_key` (Index Scan).

### Ölçüm (izole PG, yerel)

| İşlem | Süre |
|---|---|
| 1.000 villa, EN, tek çağrı (2 sorgu) | 11–18 ms |
| 40 eşzamanlı okuma (25'er kayıt, 3 dil karışık, pool max 8) | 89–118 ms toplam |

### Kalıcı cache (`unstable_cache`)

- **Anahtar:** `content:v1 | op | varlık | istenen dil | zincir | ana dil | aktif diller | kimlikler`.
  - Kimlikler sıralanır.
  - 8'den fazla kimlik varsa anahtara sayı ve 53-bit hash yazılır.
- **Ana dil değişimi:**
  - Ana dil ve aktif dil kümesi anahtarın parçası olduğundan değişiklikten sonra eski dilin sonucu **eşleşmez**.
  - Ayrıca her sonuç `settings` tag'ini taşır. Faz 4'teki `invalidatePublicRoutingCaches()` bu tag'i düşürdüğü için eski girdiler de silinir.
- **Tag'ler:**
  - Her sonuç `content` ve `content:<varlık>` tag'lerini taşır.
  - Ek olarak eski yazma yollarının **zaten** revalidate ettiği tag'ler eklenir: `villas`, `taxonomy`, `menu`, `faqs`, `homepage`, `discount`, `site-popup`, `locale-slugs`. Böylece eski admin kaydı da bu cache'i düşürür.
- **Eski yazma yolunda tag'i olmayan 6 tür** (blog, sayfa, kural, fiyata dahil, özellik, ödeme yöntemi) kalıcı cache'e **alınmaz**. Bunlarda yalnız istek içi tekilleştirme yapılır, böylece bayat içerik riski oluşmaz.
- **JSON uyumu:** Cache'e JSON-serileştirilebilir `Record` yazılır (`unstable_cache` `Map` saklayamaz). Dışarıya her zaman yeni bir `Map` verilir.
- **Uyumluluk:** Mevcut cache sistemi değişmedi. Yeni tag'ler mevcut `revalidateTag(tag, {expire:0})` deseniyle düşürülebilir.

### İstek içi ve eşzamanlı okuma

- React `cache()` ile aynı render'daki aynı argümanlar tek okuma yapar.
- Aynı anahtar için uçuştaki istek paylaşılır (thundering herd yok): 20 paralel istek → 1 DB okuması.
- Farklı dil veya bağlamlar paralelde karışmaz. Ana dil değişimi sırasında başlamış bir okuma, başladığı bağlamla tutarlı kalır (test edildi).

---

## 6. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| Yeni birim testleri | **50/50 başarılı** (core 34, sql/resolve 12, server 4) |
| İzole PG entegrasyonu (`CONTENT_READ_PG_URL` ile, PG 16) | **11/11 başarılı** |
| Tam paket (8 parça) | **260 dosya, 4.931 test: 4.909 başarılı, 22 atlanan, 0 başarısız** |
| TypeScript (`tsc --noEmit`) | Kaynak kodda **0 hata**. Sayılan 61 hatanın hepsi kullanıcı reposundaki eski `.next/types` dosyalarından (Faz 3–4'ten beri aynı; `.next`'e dokunulmadı) |
| ESLint (tüm repo) | **0 hata.** 194 uyarının hepsi daha önceden var (admin ekranları vb.); yeni dosyalarda 0 uyarı. *(Faz 3.1 düzeltmesi: bu satır ilk yazımda yanlışlıkla "0 uyarı" diyordu.)* |
| Production build (izole kopya, `next build --webpack`) | **Başarılı.** Derleme 31,5 sn, 49/49 statik sayfa. Build sırasındaki `DATABASE_URL tanımlı değil` logları beklenen davranıştır: izole kopyada DB yok, önceki fazlarla aynı |

**Tam paketteki sayılar:**

- Faz 2 sonunda 4.870 test vardı; 61 yeni test eklendi (50 birim, 11 entegrasyon).
- 22 atlanan testin 11'i önceden atlanan testlerdir. Diğer 11'i, normal pakette DB URL'si olmadığı için atlanan entegrasyon testleridir.
- Mevcut testlerin hiçbirinin beklentisi değişmedi.

### Kapsanan senaryolar

- **Dil bazında okuma:** TR, EN ve DE istekleri ayrı ayrı.
- **Ana dil yedeği:** Ana dil TR, EN ve DE iken zincir.
- **Değer ve dil kuralları:**
  - eksik çeviri;
  - pasif dil (EN pasif, TR pasif);
  - NULL, boş string ve yalnız boşluk;
  - jsonb `[]` ve `{}`;
  - dolu metnin kırpılmaması;
  - teknik alanların dışarıda kalması.
- **Slug:**
  - dil bazlı slug;
  - pasif dilde ve format dışı slug'da sorgu atılmaması;
  - slug'sız türler.
- **Çoklu kayıt ve kimlikler:**
  - tek sorgu;
  - kimliklerin korunması (büyük harfli UUID);
  - tekrarlı ve geçersiz kimlik;
  - smallint kimlik (`"01"` = `"1"`).
- **Cache izolasyonu:**
  - dil, ana dil ve aktif dil kümesi anahtarda;
  - doğru tag'ler;
  - hatanın cache'lenmemesi;
  - kalıcı cache'e alınmayan türler.
- **Eski ↔ yeni karşılaştırma:** 14 tür × 3 dil × 4 senaryo.
- **Eşzamanlı okuma:** paylaşılan uçuştaki istek, dil karışmaması, ana dil değişimi sırasında tutarlılık.
- **Faz 3 sınırı:** `app/` ve `lib/` içinde yeni servisi import eden dosya yok (bekçi testi).

---

## 7. Bilinen sorunlar ve riskler

1. **Sayfa gövdesi farkı (canlıda doğrulanmalı).** Eski sayfa okuması gövdeyi `page.body ?? page.content` ifadesiyle alır. Yeni servis yalnız `page_translations.body` alanını okur; ayna da yalnız `pages.body`'yi kopyalar. Canlıda `body` NULL, `content` dolu bir sayfa varsa TR gövdesi yeni serviste boş görünür. Faz 4 öncesinde salt okunur bir sorguyla kontrol edilmeli: `SELECT count(*) FROM pages WHERE body IS NULL AND content IS NOT NULL`.
2. **Eski çeviri yazmalarının tag'leri doğrulanmadı.** Bugünkü EN/DE yazma yolları (`*-translation.service.ts`) her durumda yukarıdaki eski tag'leri revalidate ediyor mu, tek tek denetlenmedi. Yeni servisi bugün hiçbir modül kullanmadığı için risk yok. Faz 4'te yazmalar merkezi servise geçerken `content:<varlık>` revalidate edilmeli. Ondan önce bir modül yeni okumaya taşınırsa o modülün yazma yolu kontrol edilmeli.
3. **Aktif dilde satır yoksa `null` döner.** Kaydın hiçbir aktif dilde satırı yoksa servis `null` döner. Eski katman bu durumda TR ana kolonunu gösterirdi. Bu, pasif dil kuralının doğal sonucu. Çağıranın davranışı (404, teknik ad veya noindex) Faz 4'te modül bazında belirlenmeli.
4. **Translations modunda TR satırı oluşmaz** (Faz 2'den biliniyor). Mod `translations`'a geçerse eski koddan yapılan ana tablo INSERT'i tr satırı oluşturmaz ve yeni servis o kaydı TR'de göremez. Mod değişimi, admin yeni yazma servisine geçmeden yapılmamalı (Faz 5 / migration 108).
5. **Format dışı TR slug'ları teknik anahtara düşer.** 102 formatına uymayan TR ana slug'ları için tr satırında `slug=NULL` vardır. Bu kayıtlar için yeni servis `slug=null` döner; çağıranın teknik anahtara düşmesi gerekir (karar 8). Canlıda bu kayıtların sayısı Faz 0.1 Q-sorgularıyla görülecek.
6. **Doluluk sayımı soft-delete ayırt etmez.** `getCoverage.total`, ana tablodaki **bütün** satırları sayar (soft-delete edilmiş villalar dahil), aktif ve silinmiş ayrımı yapmaz. Preflight'ta "yalnız yayındaki kayıtlar" gerekirse Faz 4'te varlık bazlı filtre eklenmeli.
7. **Doğrulama yalnız minimal şemada yapıldı.** Entegrasyon testi, minimal ana tablo şemalarıyla izole PG 16'da çalıştı. Canlı şemalar (Faz 0.1 Q1–Q12) hâlâ bekliyor. Migration 106 bu şemaları çalışma anında doğruluyor, ancak okuma servisi canlı veriyle hiç denenmedi.
8. **Kalıcı cache kapsamı dar.** Blog, sayfa, kural, fiyata dahil, özellik ve ödeme yöntemi şimdilik yalnız istek içi cache kullanır. Bu bilinçli bir güvenlik tercihi; performans etkisi Faz 4'te modül taşınırken ölçülmeli.

---

## 8. Faz 4 giriş koşulları

1. **Canlı ön kontroller:** Faz 0.1 Q1–Q12 salt okunur sorgu sonuçları ve §7-1'deki `pages.content` kontrolü alınmış olmalı.
2. **Migrations:** 105, 106 ve 107, ayrı onayla ve önce staging/kopya veritabanında olmak üzere canlıya uygulanmış olmalı. `content_mirror_mode()='base'` doğrulanmalı. 107 doğrulama NOTICE'larında her ana kayıt için bir tr satırı ve 0 fark görülmeli.
3. **Canlı kopyada karşılaştırma:** Canlı kopyaya karşı entegrasyon testi çalıştırılmalı (`CONTENT_READ_PG_URL=… npx vitest run tests/integration/content-read-pg.test.ts`). Ana dil TR senaryosunda `mirror-drift`, `other` ve `fallback-order` sayılarının **0** olması şart.
4. **Yazma servisi:** Faz 4 yazma servisi (`ContentWriteService.saveContent`) her kayıttan sonra `content:<varlık>` ile ilgili eski tag'leri revalidate etmeli. Ana dil değişimi zaten `settings` tag'ini düşürüyor.
5. **Modül bazında kararlar:**
   - `null` dönüşünde 404, teknik ad veya noindex davranışı;
   - `isFallback` ile noindex bağlantısı (karar 5);
   - `slug=null` için teknik anahtar (karar 8).
6. **Ana dil değişimi preflight'ı:** `getCoverageReport()` sonucu admin ekranında gösterilecek biçimde tasarlanmalı. Soft-delete filtresi (§7-6) bu sırada karara bağlanmalı.
7. **Kademeli geçiş:** Modüller tek tek ve bayrakla geçirilmeli. Her geçişte o modül için eski ↔ yeni karşılaştırma tekrar çalıştırılmalı. Rezervasyon, fiyat, ödeme ve voucher kapsam dışında kalır (karar 7).

---

*Faz 3 tamamlandı. Faz 4'e geçilmedi; commit, push ve deploy yapılmadı.*
