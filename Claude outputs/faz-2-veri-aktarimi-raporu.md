# Faz 2 Raporu — Simetrik Çoklu Dil Veri Aktarımı ve Ayna Mekanizması (Seçenek D)

**Tarih:** 2026-11-04 · **Taban:** `main` @ `8afb11a` + Faz 1 (commit edilmemiş)

**Durum:**
- Faz 2 tamamlandı. Migration 106 ve 107 hazırlandı; **yalnız izole PostgreSQL 16**'da test edildi.
- Canlı veritabanına ve sunucuya bağlanılmadı, production migration çalıştırılmadı.
- Commit, push ve deploy yapılmadı. Admin, public, rezervasyon, fiyat ve ödeme koduna dokunulmadı.
- Faz 3'e geçilmedi.

---

## 1. Değişen ve eklenen dosyalar

| Dosya | Durum |
|---|---|
| `db/migrations/106_content_mirror.sql` | **yeni**: ayna, guard bağlantıları, slug geçmişi düzeltmesi |
| `db/migrations/107_backfill_tr_translations.sql` | **yeni**: TR içeriklerinin aktarımı |
| `tests/unit/symmetric-content-mirror-migrations.test.ts` | **yeni**: 19 test |
| `Claude outputs/faz-2-veri-aktarimi-raporu.md` | **yeni**: bu rapor |

- Faz 1 dosyaları (105, `lib/i18n/content/*`, `symmetric-content-registry.test.ts`) **değişmedi**.
- Mevcut takip edilen dosyalarda değişiklik yok: `git diff` boş.

**Faz 0 planına göre sıra değişikliği:** Faz 0'da 106 "backfill", 107 "ayna" olarak numaralanmıştı. Burada **ayna önce (106), aktarım sonra (107)** kuruldu. Böylece aktarım ile canlı admin yazmaları arasında aynasız bir pencere kalmıyor: 107'den önce yapılan her ana tablo yazması zaten `tr` satırını oluşturuyor; 107 bunları "aynı" sayıp koruyor.

---

## 2. Migration 106: ayna mekanizması

**Tek transaction ve idempotent:** `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`. Yalnız `content_mirror_mode() = 'base'` iken uygulanır. Mod fonksiyonuna **dokunmaz**.

### 2.1 Şema doğrulaması

Ana tablo şeması depoda olmadığı için kontrol **çalışma anında** canlı şemaya karşı yapılır. Her içerik varlığı için:
- ana tablo ve çeviri tablosu var mı, ana tabloda `id` var mı;
- kayıttaki her çevrilebilir kolon (+ slug) **iki tabloda da var** mı;
- tipler uyumlu mu: `text`/`varchar` ↔ `text`/`varchar`, `jsonb` ↔ `jsonb`.

Biri bile sağlanmazsa `RAISE EXCEPTION`; hiçbir trigger oluşmaz. Ana tablodaki **NOT NULL** çevrilebilir kolonlar burada tespit edilip ters yöndeki aynaya parametre olarak verilir.

Bu, Faz 0.1'in Q1–Q2 sorgularını **zorunlu olmaktan çıkarmaz** ama yanlış bir şemaya karşı migration'ın sessizce kurulmasını engeller.

### 2.2 Ayna fonksiyonları (yön DB'den, aynı anda tek yön)

| Fonksiyon | Trigger | Etkin olduğu mod | Davranış |
|---|---|---|---|
| `trg_content_mirror_base_to_tr()` | `<ana>_content_mirror_to_tr`: AFTER INSERT OR UPDATE OF <alanlar>[, slug], ana tabloda | **base** | Ana kolonları `locale='tr'` satırına upsert eder. Aynalanan kolon değişmemişse yazmaz. Slug'lı varlıkta `tr.slug` = ana slug; 102 formatına uymuyorsa veya başka kaydın tr slug'ıyla çakışıyorsa **NULL** (URL teknik anahtardan aynen çözülür) |
| `trg_content_mirror_tr_to_base()` | `<çeviri>_content_mirror_to_base`: AFTER INSERT OR UPDATE `WHEN (NEW.locale='tr')`, çeviri tablosunda | **translations** | TR satırını ana kolonlara yazar. **Slug aynalanmaz** (ana slug = sabit teknik anahtar). NOT NULL ana kolonda boş TR değeri ana değeri korur |

**Bayrak disiplini:** Ayna yazmadan önce `app.content_mirror = 'on'` (transaction-local) açar, yazdıktan sonra **önceki değerine geri döndürür**. Aynı transaction'daki sonraki ayna dışı yazma guard'dan kaçamaz (test B7).

### 2.3 Guard'lar

| Guard | Bağlantı | Kural |
|---|---|---|
| `trg_content_tr_guard()` (105, **106'da yeniden tanımlandı**) | 14 çeviri tablosu, BEFORE INSERT/UPDATE/DELETE | `base` modunda tr satırına yalnız ayna yazar. **Yeni:** ana kaydı yaşayan tr satırının tek başına silinmesi **her iki modda** engellenir (ayna kopyası bayatlamasın; içerik boşaltılmak isteniyorsa alanlar güncellenir). Cascade silme serbest. EN/DE etkilenmez |
| `trg_content_base_guard()` (105) | **106'da 14 ana tabloya bağlandı**: BEFORE UPDATE OF <çevrilebilir kolonlar> | `translations` modunda ana kolonlara ayna dışı yazmayı reddeder. `base` modunda etkisiz |

### 2.4 Döngü, kilit ve deadlock analizi

**Döngü yok:**
- `base` modunda: ana yazma → `to_tr` aynası tr satırını yazar → tr tablosundaki `to_base` aynası mod `base` olduğu için hiçbir şey yapmaz.
- `translations` modunda: tersi geçerli.
- Ayrıca bayrak yeniden girişi işaretler (test C1d).

**Kilit sırası sabit:**
- `base`: ana satır → tr satırı.
- `translations`: tr satırı → ana satır.

Aynı anda tek mod geçerli olduğundan iki yazar zıt sırayla kilit almaz. Yanlış yoldaki yazar guard'da reddedilir. BEFORE trigger satır kilidini aldıktan sonra çalıştığı için yanlış yoldaki yazar önce bekler, sonra hata alır; elinde ikinci bir kilit olmadığından döngü oluşmaz (test K2, K5).

**Uygulama düzeyi deadlock:** İki ayrı kaydın zıt sırayla güncellenmesi (K4) aynadan bağımsız olarak deadlock üretir; PostgreSQL bunu tespit edip birini iptal eder. Ayna yeni bir kilit sırası eklemediği için bu davranış değişmedi ve tutarlılık bozulmadı (K4 sonrası 0 fark).

### 2.5 Slug geçmişi (103) düzeltmesi

`trg_record_slug_history()` yeniden tanımlandı (imza ve trigger'lar aynı):
1. **Yetim kayıt düzeltmesi:** Çeviri satırı, ana kaydı silinirken (cascade) siliniyorsa geçmiş **yazılmaz**.
   - Faz 1'de tespit edilen sorun: silinen içeriğe işaret eden `url_redirects` kaydı.
   - Ana kayıt yaşarken tek başına silinen EN/DE satırı için geçmiş **eskisi gibi** yazılır (D2).
2. **Ayna çift kaydı:** Ayna bayrağı açıkken çeviri tablosundaki slug olayları geçmişi yazmaz/silmez.
   - Ayna slug'ı ana tablodan kopyalıyor; geçmişi ana tablonun kendi trigger'ı yönetiyor.
   - Sonuç: taban slug değişiminde tek `tr` kaydı (B3); backfill `url_redirects`'e hiç dokunmuyor (§6 md5).
3. Diğer davranış **aynı**: EN slug değişim geçmişi ve yeniden kullanımda temizleme (D1).

**Mevcut kayıtlar:** Mevcut `url_redirects` kayıtlarına **dokunulmadı**. Canlıda daha önce oluşmuş yetim kayıtlar zararsız (`REDIRECTS_SQL` yalnız yayındaki içeriğe join yapar). İstenirse ayrı onayla şu sorgu çalıştırılabilir; önce SELECT ile sayılmalı:

```sql
-- Önce say:
SELECT entity_kind, count(*) FROM url_redirects r WHERE NOT EXISTS (
  SELECT 1 FROM villa WHERE id = r.entity_id AND r.entity_kind='villa' UNION ALL
  SELECT 1 FROM villa_types WHERE id = r.entity_id AND r.entity_kind='villaType' UNION ALL
  SELECT 1 FROM blog_posts WHERE id = r.entity_id AND r.entity_kind='blog' UNION ALL
  SELECT 1 FROM pages WHERE id = r.entity_id AND r.entity_kind='page') GROUP BY 1;
```

---

## 3. Migration 107: TR içeriklerinin aktarımı

### 3.1 Algoritma

Tek transaction; herhangi bir adım güvenli değilse `RAISE EXCEPTION` → **hiçbir satır yazılmaz**.
1. **Ön koşul:** 106 uygulanmış ve mod `base`.
2. **Preflight** (14 varlığın her biri için):
   - **(a)** Mevcut `locale='tr'` satırı ana kayıttan **farklıysa** (herhangi bir alan veya slug) → **DUR**. Aynıysa korunur, **üzerine yazılmaz**.
   - **(b)** Slug'lı varlıklarda, 102 formatına uyan taban slug'lar içinde **tekrar** → **DUR**.
   - **(c)** Taban slug başka bir kaydın mevcut tr slug'ıyla **çakışıyor** → **DUR**. Taban slug'lar benzersiz olduğundan bu durum pratikte (a) tarafından önce yakalanır; ikinci savunma hattı.
3. **Aktarım** (`app.content_mirror` bayrağıyla):
   `INSERT INTO <çeviri> (<fk>, 'tr', <alanlar>[, slug]) SELECT … FROM <ana> ON CONFLICT (<fk>, locale) DO NOTHING`
   - Boş (NULL / `''`) değerler olduğu gibi kopyalanır.
   - Slug 102 formatına uymuyorsa NULL.
   - `villa_translations.title` (atıl) NULL kalır.
4. **Doğrulama:** Her ana kayıt için tam bir tr satırı var ve bütün alanlar (slug dahil) eşit; değilse **DUR**.
5. **NOTICE:** varlık başına ana / eklenen / önceden var olan sayıları.

**Tekrar çalıştırma:** 0 satır eklenir, doğrulama yine geçer (P5).
**Dokunmadıkları:** ana tablolar, EN/DE satırları, `url_redirects`. Migration metninde UPDATE, DELETE, DROP ya da `url_redirects` yok; testle doğrulanıyor.

### 3.2 Canlıda uygulanmadan önce

Faz 0.1 Q7–Q10 (mevcut tr satırları, slug formatı, tekrar, çakışma) çalıştırılırsa 107'nin duracağı durumlar önceden görülür. 107 aynı kontrolleri kendisi de yapıyor; uygulamak yine güvenli.

---

## 4. Test sonuçları (izole PostgreSQL 16)

### 4.1 Kurulum

- Minimal ana tablolar oluşturuldu.
- Depodaki **gerçek** migration'lar uygulandı: 082 → 104, 012, 062, 105, sonra **106 ve 107**.

**Örnek veri:**
- 4 villa: normal, NULL/boş alanlı, 102'ye uymayan slug `Villa_Kotu`, soft-deleted.
- EN/DE çevirileri (slug'lı ve slug'sız).
- 2 villa tipi (biri slug'sız), özellik, kural, fiyata dahil, blog, sayfa (`sections` jsonb), SSS, menü, ödeme yöntemi.
- Ayarlar, popup (`stats` jsonb + EN çevirisi), iki koleksiyon (biri NULL `custom_title`).
- Geçerli slug geçmişi (2 `url_redirects` kaydı).

### 4.2 Senaryolar

| # | Senaryo | Sonuç |
|---|---|---|
| A1 | TR satırları ana kayıtla birebir (villa, pages+sections, popup+stats) | ✅ 0 fark |
| A2 | Geçerli slug kopyalandı; `Villa_Kotu` ve NULL slug → `tr.slug` NULL; boş alanlar korundu | ✅ |
| A3 | Atıl `villa_translations.title` tr satırında NULL | ✅ |
| B1 | **Eski servis** ana kolona yazar → tr satırı aynı transaction'da güncellenir | ✅ |
| B2 | EN/DE satırları değişmedi | ✅ |
| B3 | Taban slug değişimi: tr.slug izler; `url_redirects`'e **tek** tr kaydı | ✅ |
| B4 | Yeni ana kayıt (INSERT) → tr satırı oluşur | ✅ |
| B5 | Aynalanmayan kolon (title) güncellemesi tr satırına yazmaz (`updated_at` sabit) | ✅ |
| B6 | Doğrudan tr yazımı (base) → guard hatası | ✅ |
| B7 | Ayna sonrası aynı transaction'da doğrudan tr yazımı → guard hatası (bayrak geri yüklendi) | ✅ |
| B8 | Yaşayan kaydın tr satırı silinemez | ✅ |
| B9 | EN çevirisi güncelleme serbest; ayarlar (tekil) aynalanıyor | ✅ |
| B10 | **Ana kayıt silme**: bütün çeviriler cascade; **yetim `url_redirects` yok** | ✅ 0 / 0 |
| B11 | jsonb (`stats`) aynası | ✅ |
| C1a | **Yeni sistem** (translations modu, simülasyon): tr satırı yazılır → ana kolon güncellenir, slug aynalanmaz | ✅ |
| C1b | NOT NULL ana kolon (`blog_posts.title`): boş TR değer ana değeri korur | ✅ |
| C1c | Translations modunda eski servis ana kolona yazarsa → guard hatası | ✅ |
| C1d | Döngü yok (ana tablo aynası bu modda etkisiz) | ✅ |
| C1e | Teknik anahtar (ana slug) değişimi serbest, tr.slug'a aynalanmaz | ✅ |
| C1f | Translations modunda da tr satırı tek başına silinemez | ✅ |
| C1g | Ayarlar ve `custom_title` tr → ana | ✅ |
| C2 | Simülasyon rollback'i sonrası mod `base`, veri eski hali | ✅ |
| D1 | EN slug geçmişi (ayna dışı) yazılıyor ve yeniden kullanımda temizleniyor | ✅ |
| D2 | Ana kayıt yaşarken silinen EN satırı için geçmiş yazılıyor (eski davranış) | ✅ |
| P1 | **Mevcut tr satırı farklı** → 107 DURDU, hiçbir satır yazılmadı | ✅ |
| P2 | **Mevcut tr satırı aynı** → korundu (aynı satır kimliği), üzerine yazılmadı | ✅ |
| P3 | **Taban slug tekrarı** (villa_types) → 107 DURDU, 0 satır | ✅ |
| P4 | **Slug çakışması** (başka kaydın tr slug'ı) → 107 DURDU | ✅ (a ile yakalandı, §3.1) |
| P5 | **107 tekrar çalıştırma** → 0 eklendi, doğrulama geçti; 106 tekrar → hata yok | ✅ |
| K1 | **Eşzamanlı**: iki eski servis aynı villayı yazar → serileşir, son yazan kazanır, ana = tr | ✅ `B \| B` |
| K2 | **Eşzamanlı**: ana kolon yazılırken başka oturum doğrudan tr yazmayı dener → kilidi bekler, sonra guard hatası; tutarlı | ✅ `C \| C` |
| K3 | **Eşzamanlı**: ana kolon + EN çevirisi (farklı satırlar) → beklemez (56 ms) | ✅ |
| K4 | Zıt sırayla iki villa (uygulama düzeyi) → PostgreSQL deadlock'u tespit etti; ayna kaynaklı değil, sonrasında 0 tutarsızlık | ✅ |
| K5 | **Eşzamanlı (translations)**: iki yeni servis aynı tr satırını yazar → serileşir; araya giren eski servis → guard hatası; ana = tr | ✅ `T-B \| T-B` |
| R1 | **Rollback 107** → snapshot ön durumla **birebir** | ✅ |
| R2 | **Rollback 106** (+ 103 ve 105 dosyalarını yeniden çalıştırma) → trigger ve fonksiyonlar kalktı; 103 ve 105 fonksiyonları eski tanımında; veri ön durumla **birebir** | ✅ |
| R3 | **Yeniden uygulama** 106 + 107 → 107 sonrası durumla birebir | ✅ |

### 4.3 Uygulama tarafı

| Kontrol | Sonuç |
|---|---|
| Yeni testler (`symmetric-content-mirror-migrations.test.ts`) | 19/19 |
| Tam paket | **256 dosya, 4.870 test: 4.859 başarılı, 11 atlanan, 0 başarısız** (Faz 1: 4.840 + 19) |
| Atlanan 11 test | Faz 1 öncesinden beri aynı 11 test (1 + 10, iki dosyada); bu fazla ilgisi yok |
| TypeScript (kaynak) | 0 hata |
| ESLint | 0 hata, 194 uyarı (değişmedi) |
| Production build | ✅ başarılı (izole kopya; TypeScript adımı dahil) |

---

## 5. Veri bütünlüğü karşılaştırmaları

Aynı DB örneğinde 107 öncesi ve sonrası snapshot alındı. Ölçülenler:
- 14 ana tablonun bütün satırlarının `to_jsonb` md5'i;
- EN/DE satırlarının md5'i + sayısı;
- `url_redirects` md5'i + sayısı;
- tr satır sayıları.

| Ölçüm | Önce | Sonra |
|---|---|---|
| 14 ana tablo md5 | – | **aynı** (14/14) |
| EN/DE satırları (villa 3, type 1, feature 1, blog 1, popup 1) | – | **aynı** md5 ve sayı |
| `url_redirects` | md5 `1b80…04d7`, 2 kayıt | **aynı** |
| tr satırları (villa / type / blog / page / settings / popup / homepage / faq) | 0/0/0/0/0/0/0/0 | 4/2/1/1/1/1/1/1 |
| tr ↔ ana alan farkı | – | **0** (107'nin kendi doğrulaması + A1) |

Rollback sonrası snapshot ön durumla **satır satır aynı** (R1, R2).

---

## 6. Rollback planı

**Sıra önemli: önce 107, sonra 106.** 106'nın slug geçmişi düzeltmesi aktifken tr satırları silinirse `url_redirects`'e kayıt yazılmaz.

**Rollback 107** — yalnız ana kayıtla **birebir aynı** tr satırlarını siler; farklılaşmış bir tr satırı varsa (ör. translations modunda düzenlenmiş) silinmez ve sayısı NOTICE'te görünür:

```sql
BEGIN;
DO $$
DECLARE r record; v_cmp text; v_n bigint;
BEGIN
  PERFORM set_config('app.content_mirror', 'on', true);
  FOR r IN SELECT * FROM (VALUES
    ('villa_translations','villa','villa_id','description,badge,seo_title,seo_description'),
    ('villa_type_translations','villa_types','type_id','name'),
    ('villa_feature_translations','villa_features','feature_id','name'),
    ('rule_item_translations','rule_items','rule_id','title'),
    ('price_include_item_translations','price_include_items','include_id','title'),
    ('blog_post_translations','blog_posts','blog_post_id','title,body,excerpt,seo_title,seo_description'),
    ('page_translations','pages','page_id','title,body,excerpt,seo_title,seo_description,sections'),
    ('faq_translations','faqs','faq_id','question,answer'),
    ('menu_translations','menu','menu_id','name'),
    ('payment_method_translations','payment_methods','payment_method_id','name'),
    ('settings_translations','settings','settings_id','footer_copyright,default_meta_title,default_meta_description,hero_title,hero_subtitle,hero_badge_text,hero_primary_cta_text,hero_secondary_cta_text,business_hours'),
    ('site_popup_translations','site_popup','popup_id','title,description,highlight_text,stats,button_text,button_url'),
    ('homepage_collection_translations','homepage_collections','collection_id','custom_title'),
    ('discount_collection_translations','discount_collections','collection_id','custom_title')
  ) AS t(tr_table, base_table, fk, fields) LOOP
    SELECT string_agg(format('t.%1$I IS NOT DISTINCT FROM b.%1$I', x), ' AND ') INTO v_cmp
      FROM unnest(string_to_array(r.fields, ',')) x;
    EXECUTE format('DELETE FROM public.%I t USING public.%I b WHERE t.locale = ''tr'' AND b.id = t.%I AND %s',
                   r.tr_table, r.base_table, r.fk, v_cmp);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'Rollback 107: % → % tr satırı silindi', r.tr_table, v_n;
  END LOOP;
END $$;
COMMIT;
```

**Rollback 106** — önce şu betik çalışır, ardından `103_url_redirects.sql` ve `105_symmetric_content_foundation.sql` **yeniden çalıştırılır**. İkisi de idempotent; slug geçmişi ve TR guard fonksiyonlarını önceki tanımlarına döndürür; mod fonksiyonu korunur.

```sql
BEGIN;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tgrelid::regclass AS tbl, tgname FROM pg_trigger
            WHERE NOT tgisinternal AND (tgname LIKE '%\_content\_mirror\_to\_tr' ESCAPE '\'
                                         OR tgname LIKE '%\_content\_mirror\_to\_base' ESCAPE '\'
                                         OR tgname LIKE '%\_content\_base\_guard' ESCAPE '\') LOOP
    EXECUTE format('DROP TRIGGER %I ON %s', r.tgname, r.tbl);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.trg_content_mirror_base_to_tr();
DROP FUNCTION IF EXISTS public.trg_content_mirror_tr_to_base();
COMMIT;
```

Her iki betik de izole PG'de test edildi (R1–R3).

**Kod:** Yeni test dosyasının silinmesi yeterli; çalışan kod değişmedi.

---

## 7. Canlı ortama uygulama notları (ayrı onayla, bu fazda YAPILMADI)

1. **Sıra:** 105 → 106 → 107. Session pooler veya doğrudan bağlantı; öncesinde yedek / PITR.
2. **Öncesi:** Faz 0.1 Q1–Q12, özellikle Q7–Q10.
3. **Sonrası:** 107'nin NOTICE çıktısı kaydedilmeli (varlık başına sayılar).
4. **Performans:**
   - `settings` her kaydedildiğinde artık tr satırı da upsert ediliyor (tek satır).
   - Villa kaydında aynalanan kolon değişmişse bir upsert yapılıyor.
   - Ölçülen ek yük ihmal edilebilir (K3: 56 ms, eşzamanlı bekleme dahil değil).
5. **Bilinen kısıt (Faz 5'te ele alınacak):** `translations` modunda guard ana tabloda yalnız **UPDATE**'i koruyor. Eski servisle **yeni ana kayıt oluşturma** (INSERT) o modda tr satırı üretmez. Mod değişimi (migration 108) admin yeni servise geçmeden yapılmamalı.

---

## 8. Faz 3'e geçiş kriterleri

| # | Kriter | Durum |
|---|---|---|
| 1 | 106 ve 107 izole PG'de: aktarım, preflight durdurmaları, idempotentlik, ayna (iki yön), guard'lar, eşzamanlılık, cascade, slug geçmişi, rollback + yeniden uygulama | ✅ |
| 2 | Veri bütünlüğü: ana tablolar, EN/DE ve `url_redirects` md5 aynı; tr ↔ ana 0 fark | ✅ |
| 3 | Tam paket (4.859 ✓, 0 ✗), TypeScript, ESLint, production build | ✅ |
| 4 | Faz 0.1 Q1–Q12 canlı salt okunur sorgu sonuçları (ana tablo kolonları ve NOT NULL; mevcut tr satırları; slug format, tekrar ve çakışma) | ⏳ senin tarafında |
| 5 | 105–107'nin canlıya uygulanması ve NOTICE / doğrulama çıktılarının alınması | ⏳ ayrı onay |
| 6 | Canlıda 107 sonrası doğrulama: varlık başına tr satır sayısı = ana kayıt sayısı; tr ↔ ana 0 fark (§5 sorguları) | ⏳ |
| 7 | Faz 3 (merkezi okuma servisleri) için ayrı onay | ⏳ |

Faz 3'te okuma servisleri, mod hâlâ `base` iken tr satırlarını okuyabilir: ayna sayesinde tr satırı ile ana kolon her zaman eşit. Bu, Faz 0'da tanımlanan "legacy ↔ translations aynı çıktı" testinin temelidir.

---

## İşlem beyanı

- **Yeni dosyalar:** migration 106, migration 107, `tests/unit/symmetric-content-mirror-migrations.test.ts`, bu rapor.
- **Değiştirilen mevcut dosya yok.**
- Canlı veritabanına ve sunucuya bağlanılmadı; migration'lar yalnız izole PostgreSQL 16'da çalıştırıldı; commit, push ve deploy yapılmadı.
