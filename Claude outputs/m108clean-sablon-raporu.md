# `m108clean` Temiz 108 Test Şablonu

**Tarih:** 4 Kasım 2026
**Sonuç:** Kalıcı test şablonu `m108clean` oluşturuldu ve doğrulandı. İçeriği: **`m106` verisi + migration 108 sonrası şema ve fonksiyonlar**. Şablon yalnız izole PostgreSQL ortamında; üzerinde hiçbir test çalıştırılmadı.

---

## 1. Ortam

- Yerel izole PostgreSQL 16.15, aynı kapsayıcıda.
- `listen_addresses = localhost`.
- Canlı veya staging bağlantısı yok.
- Canlı DB, staging DB, sunucu ve Coolify'a erişilmedi.
- Commit, push ve deploy yapılmadı.

---

## 2. Kaynakların ön doğrulaması

İşlemden önce iki kaynak DB'nin bilinen temiz durumda olduğu doğrulandı.

**Belirleyici parmak izleri** (PG 16'nın rastgele `\restrict` satırları hariç). Bunlar önceki raporlarda kaydedilenlerle **aynı**:

| DB | Şema md5 | Veri md5 | 108 fonksiyonu | Ayna modu |
|---|---|---|---|---|
| `m106` | `497e4d7fa0d9bae8` | `b530b0521a4568ca` | yok | `base` |
| `f6b` | `577c9109478f6b90` | `5193f62b49a38826` | var | `base` |

**Ek kontroller:**

- **Veri sayaçları:** İki kaynakta da `pg_stat_database` sayaçları `tup_inserted = tup_updated = tup_deleted = 0`.
- **Bağlantı:** Kaynaklara aktif bağlantı yoktu.

**Neden bu iki kaynak (final kapanış raporu §3.3):**

- **Fonksiyonların kaynağı:** 108 taslağı yalnız fonksiyon tanımlıyor; veri değiştiren ifade yok.
- **Şema farkı:** `f6b` ile `m106` şemaları arasındaki tek fark 108'in üç fonksiyonu: `content_language_slugs_separated()`, `trg_content_mirror_base_to_tr()` ve `trg_content_tr_guard()`.
- **Verinin kaynağı:** `f6b`'nin verisi önceki test koşularıyla kirlendiği için veri `m106`'dan alındı.

---

## 3. Oluşturma işlemi

**Migration çalıştırılmadı.** `m106` ve `f6b` yalnız `TEMPLATE` kaynağı ve `pg_dump` okuma kaynağı olarak kullanıldı; ikisine de yazılmadı.

```sql
-- 1) Şema + 108 fonksiyonları: f6b'nin kopyası
CREATE DATABASE m108clean TEMPLATE f6b;

-- 2) Kopyadaki test verisinin temizlenmesi (yalnız m108clean'de; public şemadaki 33 tablo)
TRUNCATE <33 tablo> RESTART IDENTITY CASCADE;

-- 3) m106 verisinin yüklenmesi (tetikleyiciler yükleme sırasında kapalı; ayna ikinci kez çalışmasın)
--    pg_dump -a --disable-triggers m106  |  psql m108clean
```

- **Yükleme sonucu:** `exit 0`, hata satırı 0.
- **Ara dosya:** Kullanılan geçici veri dökümü işlemden sonra silindi.

---

## 4. Doğrulama

| Kontrol | Beklenen | Sonuç |
|---|---|---|
| Şema md5 | = `f6b` (`577c9109478f6b90`) | `577c9109478f6b90` ✅ |
| Veri md5 | = `m106` (`b530b0521a4568ca`) | `b530b0521a4568ca` ✅ |
| `content_language_slugs_separated()` | var, `true` | var, `true` ✅ |
| `content_mirror_mode()` | `base` | `base` ✅ |
| İçerik tetikleyicileri | 56 (`m106`/`f6b` ile aynı) | 56 ✅ |
| Devre dışı tetikleyici | 0 (yükleme sonrası hepsi etkin) | 0 ✅ |
| `public` fonksiyon sayısı | 49 (= `f6b`; `m106`'da 48, +1 = 108 yetenek fonksiyonu) | 49 ✅ |
| Satır sayıları (15 içerik/routing tablosu) | `m106` ile aynı | 15/15 aynı ✅ |
| Her villa ve sayfa için TR satırı (107 garantisi) | eksik 0 | 0 ✅ |
| Ayna tutarlılığı (TR satırı = ana kolon) | `m106` ile aynı | 1 kayıt farklı; aynı kayıt `m106`'da da farklı ✅ |

**Karşılaştırılan 15 tablo:**

- `villa`, `villa_translations`
- `blog_posts`, `blog_post_translations`
- `pages`, `page_translations`
- `villa_types`, `villa_type_translations`
- `settings`, `settings_translations`
- `site_popup`, `site_popup_translations`
- `payment_methods`, `payment_method_translations`
- `url_redirects`

**Ayna tutarlılığındaki tek fark:**

- Kayıt, tohum verisindeki kasıtlı test kaydı `Villa_Kotu`.
- Teknik anahtar 102 slug biçimine uymuyor, bu yüzden TR satırının slug'ı NULL.
- Aynı durum `m106`'da da var; şablon oluşturmadan kaynaklanmıyor.

**Kaynaklar sonrası:**

- `m106` ve `f6b`'nin `pg_stat_database` sayaçları hâlâ `0 / 0 / 0`.
- Parmak izleri değişmedi.
- `m108clean`'deki 50 insert ve 464 update sayacı, yalnız yükleme işleminden geliyor.

---

## 5. Kullanım

`m108clean` **yalnız şablon** olarak bırakıldı: üzerinde test çalıştırılmadı ve aktif bağlantı yok.

Bundan sonraki 108 sonrası izole testler, her koşuda bu şablondan **yeni tek kullanımlık kopya** açarak çalıştırılmalı:

```sql
CREATE DATABASE <test_kopyasi> TEMPLATE m108clean;
-- test sonunda: DROP DATABASE <test_kopyasi>;
```

108 öncesi testler için kaynak şablon eskisi gibi `m106`.

**İzole ortamda kalan DB'ler:**

- **Şablonlar:** `m101`, `m103`, `m105`, `m106`, `f6b`, `m108clean`.
- **Sistem DB'leri:** `postgres`, `template0`, `template1`.

**Not:** `f6b` artık yalnız `m108clean`'in tarihsel kaynağı. Yeni testlerde kaynak olarak `m108clean` kullanılmalı. İsterseniz `f6b` ileride ayrı onayla emekliye ayrılabilir; bu turda dokunulmadı.
