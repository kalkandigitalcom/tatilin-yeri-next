# Tatilinyeri Next — Yapay Zekâ ile Akıllı Filtreleme: Revize Mimari Analizi

**Tarih:** 6 Kasım 2026
**Tür:** Salt okunur analiz. Kod, SQL, migration, DB, commit, push ve deploy **yok**.
**İncelenen kaynak:** `main` @ `6d09529`. Cihazdaki repo ile aynı commit; çalışma ağacında yalnız izlenmeyen rapor dosyaları ve `db/migrations/_drafts/` var. Önceki rapor: `Claude outputs/yapay-zeka-villa-arama-analizi.md`.

**İşaretler:**

- **[D]** Koddan doğrulandı (dosya:satır verildi).
- **[T]** Tahmin: canlı veri, çalışma zamanı ya da harici bilgiye bağlı.
- **[Ö]** Öneri.

---

## Kısa cevap

**Evet, mümkün.** "Yapay Zekâ ile Ara", Tarihle Ara'ya dokunmadan eklenebilir ve aynı `/arama` URL parametreleriyle çalışabilir.

- `buildHeroSearchParams` saf bir fonksiyon [D]. Sunucu ya da tarayıcıdan çağrılabiliyor.
- `/arama` gelen bütün token'ları kendi tarafında yeniden doğruluyor (`resolveTokens`) [D].
- Böylece yapay zekâ yalnız bu fonksiyona **girdi üretir.** URL'yi, sonuçları, fiyatı ve müsaitliği bugünkü kod üretir.

**Minimum değişiklik gereken mevcut dosyalar** (hepsi eklemeli) [Ö]:

1. `app/components/ui/Hero.tsx`: 1 import + `:438` satırındaki tek render satırı.
2. `lib/i18n/dictionaries/{types,tr,en,de}.ts`: yeni `home.search.ai.*` anahtarları.
3. `lib/rate-limit.ts`: yeni `ai_search` grubu ve isteğe bağlı fail-closed seçeneği. Mevcut grupların davranışı aynen kalır.
4. `package.json` / `package-lock.json`: `zod` production bağımlılığı olur.
5. `.env.example`: `AI_SEARCH_*` anahtarları.

**Dokunulmayacak dosyalar:**

- `HeroSearchPanel.tsx`, `build-search-params.ts`, `format-date.ts`;
- `AramaPageBody.tsx`, `FilterSidebar.tsx`;
- `villa.repository.server.ts`, fiyat motoru, müsaitlik, rezervasyon, `VillaCard`.

Ayrıntı §9'da.

---

## Önceki rapora göre düzeltmeler ve netleşen kararlar

| # | Önceki rapor | Revize | Dayanak |
|---|---|---|---|
| 1 | Dil yolları `/en/search`, `/de/suche` | **Önceki rapor doğruydu** (bu satır 6 Kasım uygulama turunda düzeltildi). `localeHref('/arama?…')` EN/DE'de `/en/search`, `/de/suche` üretir; query aynen kalır. | [D] `lib/i18n/routing/route-registry.ts` (`search → arama / search / suche`); `tests/unit/ai-search-url.test.ts` |
| 2 | URL sunucuda üretilip döndürülür | URL **tarayıcıda, kullanıcı onayından sonra** `buildHeroSearchParams` ile üretilir. Kullanıcı bir kriteri silerse URL yeniden hesaplanabilmeli. | [Ö] §6.4 |
| 3 | Anlaşılan kriterler 600–800 ms gösterilip otomatik yönlendirilir | Kesin karar: **onay adımı var.** "Bu kriterlerle ara" butonu. | Ürün kararı |
| 4 | zod ya da elle yazılmış doğrulayıcı | Kesin karar: **zod.** Bugün yalnız geliştirme bağımlılığı olarak, dolaylı (`zod@4.4.3`, `"dev": true`) var. Production bağımlılığı olarak eklenmeli. | [D] `package-lock.json:12400-12404` |
| 5 | "`.env.example` yok" | **Yanlış.** Dosya cihazdaki repoda var; bulut kopyası `.env*` hariç tutularak alınmıştı. | — |
| 6 | Aşama 4: yeni filtreler (havuz, yatak odası, mesafe) | **Kapsam dışı.** Desteklenmeyen kriterler yalnız kullanıcıya bildirilir. | Ürün kararı |
| 7 | Aşama 5: `/arama`'ya minimum konaklama | **Kapsam dışı.** Yalnız teknik not (§12.3). | Ürün kararı |

---

## 1. Kesinleşen ürün davranışı

| # | Davranış | Durum |
|---|---|---|
| 1.1 | Hero'da iki seçenek var: **Tarihle Ara** (varsayılan, bugünkü panel, değişmez) ve **Yapay Zekâ ile Ara** (yeni). | [Ö] |
| 1.2 | İkisi de **aynı `/arama` sayfasına**, aynı parametre adlarıyla gider: `villa-turleri`, `bolgeler`, `start`, `end`, `guests`, `flexible`, `ozellikler`. | [D] parametre sözleşmesi `build-search-params.ts:13-19` |
| 1.3 | Yapay zekânın tek görevi: serbest metni bu parametrelerin **geçerli değerlerine** çevirmek. Villa, fiyat, müsaitlik ya da sonuç üretmez; DB'ye erişmez. | [Ö] |
| 1.4 | Akış: metin → anlaşılan kriterler kartı (Tarih, Kişi, Bölge, Villa türü, Özellikler) + filtrelenemeyen istekler → kullanıcı **onaylar** → `buildHeroSearchParams` → `router.push(localeHref('/arama?…'))`. Bu son iki adım bugünkü `handleSearch` ile aynı. | [D] `HeroSearchPanel.tsx:229-243` |
| 1.5 | Desteklenmeyen kriter **sessizce düşürülmez.** Kartta ve dil sözlüğünden gelen sabit bir metinle gösterilir. | [Ö] |
| 1.6 | Özellik kapalıysa (`AI_SEARCH_ENABLED` yok ya da `false`) Hero, bugünkü DOM ile birebir aynı render edilir; sekme de görünmez. | [Ö] |

**Örnek (kullanıcının cümlesi):**

> "12-18 Haziran 2027 arasında Kalkan veya Fethiye'de 2 kişilik muhafazakâr villa arıyorum."

| Alan | Değer | Kaynak |
|---|---|---|
| Giriş / çıkış | 2027-06-12 / 2027-06-18 | Kural (TR ay adı + aralık) |
| Kişi | 2 | Kural ("2 kişilik") |
| Bölgeler | Kalkan, Fethiye | Kural (kesme işaretinden sonraki ek atılır, ad sözlükte bulunur) |
| Villa türü | Muhafazakâr villalar | Kural; DB'deki tip adına bağlı [T] |
| LLM | **Çağrılmaz.** Kalan kelimeler ("arasında, veya, villa, arıyorum") dolgu kelimesi. | [Ö] |

**Üretilecek URL** [D: parametre sırası `build-search-params.ts:67-89`; slug değerleri canlı veriye bağlı, T]:

```
/arama?villa-turleri=<villa_types.slug>&bolgeler=kalkan%2Cfethiye&start=2027-06-12&end=2027-06-18&guests=2
```

`URLSearchParams.toString()` virgülü `%2C` olarak kodlar. `/arama` bunu çözer. Bugünkü Hero URL'leri de aynı biçimde [D].

---

## 2. Mevcut Hero bileşenlerinin analizi

### 2.1 Yapı [D]

| Katman | Dosya | Tür | Not |
|---|---|---|---|
| Ana sayfa gövdesi | `app/components/home/HomePageBody.tsx:1` | server | `import Hero` |
| Hero kabuğu | `app/components/ui/Hero.tsx` (447 satır) | server (`"use client"` yok) | `:11` `import HeroSearchPanel`; `:438` `<HeroSearchPanel locale={locale} />`; `:443` datepicker portal hedefi |
| Arama paneli | `app/components/ui/hero/_components/HeroSearchPanel.tsx` (702 satır) | `"use client"` | Ayrıntı aşağıda |
| URL üretimi | `_helpers/build-search-params.ts:52-92` | saf | Hem sunucu hem tarayıcıdan çağrılabilir; testlerde doğrudan import ediliyor (`tests/unit/villa-feature-filter.test.tsx:653-688`) |
| Tarih biçimi | `_helpers/format-date.ts:14-19` | saf | `Date` → `YYYY-MM-DD`, **yerel saat dilimine göre** |
| Seçenek yükleme | `hero-filters.action.ts`, `hero-features.action.ts` | server action | Tipler, bölgeler, özellikler |
| Tipler | `FilterOption {id, name, slug?, filter_group_name?}` | — | `_types/hero.ts:32-39` |

**`HeroSearchPanel`'in çalışması** [D]:

- **State** (`:116-145`): `categories`, `regions`, `guests` (varsayılan 2), `startDate`, `endDate`, `flexible` (boolean), `features`, seçenek listeleri.
- **Mount** (`:150-190`): `loadHeroFilters(locale)` ve `loadHeroFeatures(locale)` paralel çağrılır. Bölge listesi **yalnız grup kökleri** (`name === filter_group_name`).
- **Kişi** seçimi: 1–10 arası `select` (`:367-379`).
- **Gönderim** (`:229-243`):

  ```ts
  const query = buildHeroSearchParams({ categories, regions, startDate, endDate, guests,
    categoryOptions, regionOptions, flexible: flexible ? 3 : 0, features });
  router.push(localeHref(`/arama?${query}`, locale));
  ```

- **Kök eleman:** `<div className="relative mt-12 md:mt-16 hero-panel-in">` (`:261`). Panel `flex flex-col md:flex-row` (`:278-291`); mobilde alanlar alt alta.

### 2.2 İki seçenekli tasarım: en az müdahale [Ö]

**Önerilen: "çocuk olarak geçirilen panel" deseni.**

```tsx
// Hero.tsx — yalnız :438 satırı değişir (özellik kapalıyken bugünkü satır aynen)
{aiSearchEnabled
  ? <HeroSearchModes locale={locale}><HeroSearchPanel locale={locale} /></HeroSearchModes>
  : <HeroSearchPanel locale={locale} />}
```

- `HeroSearchModes` (yeni, `"use client"`) yalnız sekme çubuğunu ve AI panelini yönetir. `HeroSearchPanel`'i **children** olarak alır; içeriğini bilmez, prop vermez.
- Sekme değişince Tarihle Ara paneli **unmount edilmez**, `hidden` ile gizlenir:
  - kullanıcının seçimleri korunur;
  - mount'taki filtre yüklemesi bugünkü gibi bir kez çalışır;
  - datepicker portalı (`Hero.tsx:443`) etkilenmez.
- AI paneli, sekme ilk kez açılırken (ya da sekmenin üstüne gelinince / odaklanınca) `import()` ile yüklenir. Bu, projede `VillaCard.tsx:55-75` için seçilmiş desen: `next/dynamic` / Suspense yerine niyete bağlı `import()` [D]. Ana sayfa JS'i bu nedenle büyümez [T].
- `aiSearchEnabled`, Hero (server) içinde `process.env.AI_SEARCH_ENABLED === "true"` ile okunur. Anahtar istemciye gitmez.

**Boşluk sorunu** [D/Ö]:

- `HeroSearchPanel`'in kök elemanı `mt-12 md:mt-16` taşıyor. Sekme çubuğu üstüne konursa panelle arasında büyük bir boşluk kalır.
- Panel dosyasına dokunmadan çözüm: sarmalayıcıda Tailwind v4 (`package.json:78` [D]) seçicisi kullanılır, ör. `[&>.hero-panel-in]:mt-3`. Sekme çubuğu `mt-12 md:mt-16`'yı devralır.
- Seçicinin `.mt-12`'ye baskın gelmesi [T]. Görsel kontrolle doğrulanmalı.

**Neden `HeroSearchPanel`'e prop eklenmiyor:**

- Kesin kural: Tarihle Ara değişmeyecek.
- AI sonucunu Tarihle Ara alanlarına "doldurmak" ilk akla gelen yol, ama paneli kontrollü hale getirmeyi (dışarıdan değer alma) gerektirir. Bu, panel state'ine ve testlere dokunmak demek.
- Bu yüzden AI kendi **kriter kartını** gösterir (§8). Kart, aynı alan adlarını kullanır ve aynı URL'yi üretir.

### 2.3 Geriye dönük uyumluluk [D/Ö]

| Konu | Durum |
|---|---|
| Bayrak kapalı | `Hero.tsx`'in ürettiği ağaç bugünküyle aynı. Mevcut testler (`homepage-p0-i18n`, `villa-feature-filter` H bölümü) aynen geçmeli [Ö]. |
| Bayrak açık, Tarihle Ara sekmesi | Panel aynı bileşen, aynı state, aynı `handleSearch`. Tek fark üstündeki sekme çubuğu ve azalan üst boşluk. |
| `/arama` | Değişmez. AI'dan gelen URL, Hero'nun üretebileceği URL'lerin alt kümesi. |
| TR karakter sızıntısı testi | `tests/unit/public-tr-leak-forensic.test.ts` ana sayfadan import zinciriyle ulaşılan `app/components/**` dosyalarında **Türkçe karakter** arıyor [D] (`:74-122`, `:231`). Bu yüzden yeni Hero/AI bileşenlerinde Türkçe metin ya da ay adı **olmamalı**: metinler sözlükten, TR ay adları ve eş anlamlılar `lib/ai-search/` altında (sunucu) [Ö]. |

### 2.4 Mobil [D/Ö]

- **Bugün** [D]:
  - panel mobilde dikey;
  - dropdown'lar `max-w-[calc(100vw-2.5rem)]`;
  - Hero yüksekliği `min-h-[60svh] lg:min-h-[78svh]` (önceki incelemede doğrulandı).
- **Öneri:** AI paneli Tarihle Ara panelinden daha kısa: tek giriş + buton + chip'ler. Mobilde Hero yüksekliğini artırmaz [T]. Ayrıntı §8.

---

## 3. Mevcut filtre ve URL parametrelerinin tam listesi

Kaynak: `app/components/search/AramaPageBody.tsx` [D], `lib/pagination.ts` [D], `lib/db/villa.repository.server.ts:565-637` [D].

| Filtre | URL parametresi (canonical) | Eski eş adı | DB alanı / ilişki | Geçerli değer | Canonical token | Eşleşme | Hero yazıyor mu? |
|---|---|---|---|---|---|---|---|
| Villa türü | `villa-turleri` | `categories` | `villa_type_relations(villa_id, type_id)` → `villa_types` | `villa_types.slug` ya da UUID; bilinmeyen token **düşer** (`:346-370`) | `slug \|\| id` | **AND**: villa seçilen tiplerin **hepsine** sahip olmalı (`:400-493`) | Evet |
| Bölge | `bolgeler` | `regions` | `villa.location_id` → `villa_locations(id, name, slug, filter_group_name, show_in_filter)` | `villa_locations.slug` ya da UUID; bilinmeyen düşer | `slug \|\| id` | **OR** (`location_id IN`). Grup kökü seçilirse gruptaki **tüm** lokasyonlar eklenir, `show_in_filter=false` olanlar dahil (`:586-617`) | Evet; yalnız grup kökleri |
| Giriş tarihi | `start` | — | `get_blocked_villa_ids` RPC + fiyat kapsamı | `YYYY-MM-DD` (yalnız regex) | aynen | `start` ve `end` geçerli **ve** `start < end` ise tarihli arama; değilse tarihsiz (`:289-293`) | Evet |
| Çıkış tarihi | `end` | — | aynı | aynı | aynen | aynı | Evet |
| Kişi | `guests` | — | `villa.guests >= N` | Tamsayı; 0, boş ya da geçersiz = filtre yok (`:275`) | aynen | `.gte` | Evet; 1–10, varsayılan 2 |
| Esnek tarih | `flexible` | — | Bloklu villalar ±N günlük pencerelerde yeniden denenir | 0–3 arasına sıkıştırılır (`:989-994`); yalnız tarih aralığı varken etkin | `3` | Ana sonuçların **sonuna** eklenen ek sonuçlar | Evet; işaretliyse `3` |
| Özellikler | `ozellikler` | yok | `villa_feature_relations(villa_id, feature_id)` → `villa_features(id, name)` | **Yalnız UUID**; slug kolonu yok; tekrar edenler tekilleştirilir (`:388-397`) | UUID | **AND** | Evet ("Gelişmiş") |
| Sıralama | `sort` | — | JS | `smart` (varsayılan) · `price-asc` · `price-desc` · `capacity-asc` · `capacity-desc` (`lib/pagination.ts:124-132`) | aynen | — | **Hayır** |
| Sayfa | `page` | — | JS | 1'den başlar | — | — | Hayır |
| Sayfa boyutu | `pageSize` | — | JS | 12 · 30 · 50 · 100 (`lib/pagination.ts:21-22`) | — | — | Hayır |

**Önemli ayrıntılar** [D]:

- **Aynı anahtar iki kez gelirse yalnız ilki okunur** (`firstString`, `:221-225`).
- **Tarihin takvimde geçerli olduğu kontrol edilmez.** `isValidYmd` yalnız biçime bakar: `lib/availability.validator.ts:44-48` ("Calendar validity doğrulanmaz"). `2027-02-30` geçer. AI doğrulayıcısı gerçek takvim kontrolü yapmalı [Ö].
- **Çok dilli tip slug'ları `/arama`'da çalışmaz.**
  - `/arama`, tip token'ını `getCachedVillaTypes()` listesinin `villa_types.slug` alanıyla eşler (`AramaPageBody.tsx:315-318, 369`; `lib/cache.helpers.ts:1288-1320`).
  - Migration 102'nin eklediği `villa_type_translations.slug` (dil bazlı landing slug'ı) **bu çözümlemede yok** [D: `resolveTokens` yalnız `options.slug`'a bakar].
  - Bu yüzden AI her dilde **teknik `villa_types.slug`**'ı üretmeli. EN/DE adlar yalnız eşleme için eş anlamlı olarak kullanılır.
- **Bölgeler çevrilmez.**
  - "Phase 10I kararı": bölge adları özel isim, her dilde canonical [D] (`hero-filters.action.ts:124-125`; `api/public/taxonomies/route.ts` başlık yorumu).
- **Hero ile `/arama` aynı tablo setini kullanır** [D]:
  - Tipler: Hero `villaTypeRepository.findAllForPublicTaxonomy()` (`id, name, slug`, `sort_order`); `/arama` `getCachedVillaTypes()` (`findAllBySortOrder`, 1 saat önbellekli, `taxonomy` etiketiyle).
  - Lokasyonlar: Hero `menuRepository.findAllVillaLocations()`; `/arama` `getCachedVillaLocations()`.

**Desteklenmeyen kriterler** (§4.4) [D]:

- `AramaPageBody.tsx` ve `findSearchResults` içinde şu sözcüklerin hiçbiri filtre olarak geçmiyor: `pool_type`, `child_pool`, `indoor_pool`, `villa_distances`, `distance`, `pet`, `evcil`, `minPrice`, `maxPrice`, `budget`, `minimum_stay`, `min_stay`. Grep sonucu: 0.
- `bedrooms` yalnız kart **gösterimi** için okunuyor (`:703, 756, 911, 1511, 1625`), filtre değil.

---

## 4. Yapay zekâ → filtre eşleştirme tablosu

### 4.1 Sözlük ("izin verilen değerler") [Ö]

Sunucu her istekte (bellekte kısa süre önbellekli) **kapalı bir sözlük** kurar. Kaynaklar mevcut fonksiyonlar; yeni sorgu katmanı yazılmaz:

| Sözlük | Kaynak (mevcut) | Anahtar | Etiketler / eş anlamlılar |
|---|---|---|---|
| Bölgeler | `getCachedVillaLocations()` [D] (tam liste, alt bölgeler dahil) | `slug \|\| id` | Canonical ad + normalize hâli + elle eş anlamlılar (`Kas`/`Kaş`, `Kalkan's`…) |
| Villa türleri | `getCachedVillaTypes()` [D] + `getVillaTypeNamesByLocale()` [D] (en/de) | `slug \|\| id` | TR adı + EN/DE çeviri adları + elle eş anlamlılar |
| Özellikler | `villaFeatureRepository.findAllForPublicTaxonomy()` + `getVillaFeatureNamesByLocale()` [D] (`hero-features.action.ts` ile aynı) | UUID | TR + EN/DE adlar + eş anlamlılar |

**Sözlük sürümü:** anahtar listesinin hash'i. Önbellek anahtarına girer, böylece admin bir tip eklediğinde eski sonuç dönmez [Ö].

### 4.2 Alan bazında eşleme

| AI çıktısı (zod) | Doğrulama | Kullanıcı kartı | `buildHeroSearchParams` girdisi | URL |
|---|---|---|---|---|
| `start`, `end` (`YYYY-MM-DD` \| null) | Gerçek takvim günü; `start ≥ bugün` (Europe/Istanbul, `todayIstanbulYmd` [D] `lib/date-format.ts:250`); `end > start`; ≤ 60 gece; ≤ 24 ay ileri [Ö]. Yalnız biri varsa ikisi de atılır. | "12 Haz – 18 Haz 2027" (`buildHeroDateLabel` deseni) | `startDate: parseLocalDate(start)`, `endDate: parseLocalDate(end)`. `parseLocalDate` yerel `Date` üretir [D] `lib/date-format.ts:67`; `formatHeroDate` aynı değeri geri yazar | `start`, `end` |
| `guests` (int \| null) | 1–50 [Ö]. "2 yetişkin 2 çocuk" → 4 (sistem toplam kişi kullanıyor [D]; bebek politikası [T]) | "4 kişi" | `guests: guests ?? 0`. 0 olduğunda URL'ye yazılmaz [D] `:84` | `guests` |
| `regionKeys` (string[], enum) | Sözlükte olmayan atılır; tekilleştirilir | "Kalkan · Fethiye" | `regions: ids`, `regionOptions: sözlük` | `bolgeler` (OR) |
| `typeKeys` (string[], enum) | Sözlükte olmayan atılır. Birden fazlaysa **AND uyarısı** (§4.3) | "Muhafazakâr villalar" | `categories: ids`, `categoryOptions: sözlük` | `villa-turleri` (AND) |
| `featureIds` (string[], enum) | Sözlükte olmayan atılır | "Jakuzi" (varsa) | `features: ids` | `ozellikler` (AND) |
| `flexible` (bool) | Yalnız tarih varken anlamlı | "±3 gün esnek" | `flexible: flexible ? 3 : 0`. Hero ile aynı değer [D] `:237` | `flexible=3` |
| `unsupported` (enum[]) | Sabit kod listesi | Bilgi kutusu (§4.4) | — | — |
| `clarify` (enum \| null) | `type_or`, `dates_partial`, `nothing` | Tek takip sorusu (§8) | — | — |

**Gidiş-dönüş tutarlılığı** [D/Ö]:

- AI'ın döndürdüğü `id`'ler, `buildHeroSearchParams`'a sözlükteki `{id, slug}` listesiyle verilir. Fonksiyon `slug || id`'yi yazar.
- `/arama` aynı tablonun aynı alanıyla geri çözer.
- Eşleme bu yüzden kayıpsız. Testle kilitlenmeli (§11).

### 4.3 Belirsizlik ve çoklu değer kuralları [Ö]

| Durum | Davranış |
|---|---|
| "Kalkan **veya** Fethiye" / "Kalkan ve Fethiye" | İkisi de bölge listesine girer. `/arama`'da bölgeler OR, yani istenen sonuç [D]. |
| Bölge adı hem grup kökünde hem alt bölgede geçiyor | **Grup kökü** tercih edilir. Hero da yalnız kökleri gösteriyor ve kök genişlemesi alt bölgeleri zaten kapsıyor [D]. |
| Alt bölge adı ("İslamlar" gibi) | Doğrudan o lokasyon. `/arama` alt bölge slug'ını da kabul ediyor [D]. |
| Sözlükte olmayan yer ("Bodrum", "Antalya merkez") | **En yakın bölgeye eşlenmez.** Kartta "Bu bölge listemizde yok: Bodrum" gösterilir ve bölgesiz arama önerilir. |
| Birden fazla tip, "**ve**" ile ("muhafazakâr ve deniz manzaralı") | İkisi de gönderilir (AND). Kartta "Her iki özelliğe sahip villalar" ipucu. |
| Birden fazla tip, "**veya**" ile ("muhafazakâr veya balayı") | `/arama` tiplerde OR **yapamıyor** [D]. İkisini birden göndermek sonucu daraltır. `clarify: type_or` → "Hangisiyle arayalım?" chip'leri; tek seçim yapılır. |
| Tip ya da özellik adı belirsiz ("lüks", "güzel", "romantik") | Sözlükte karşılığı varsa (ör. "Balayı" tipi) LLM eşler; yoksa `unsupported: other`. **Tahmini eşleme yapılmaz.** |
| Gece sayısı var, tarih yok ("Ağustosta 5 gece") | Tarih uydurulmaz. `clarify: dates_partial` → "Tarih seçmek için Tarihle Ara'ya geçin" + tarihsiz arama seçeneği. |
| Yıl yok ("12-18 Haziran") | Bugünden (İstanbul) sonraki ilk uygun tarih. Kartta yıl açıkça gösterilir. |
| Geçmiş tarih ya da `end ≤ start` | Tarih atılır; uyarı gösterilir. |
| Kişi sayısı yok | `guests` boş bırakılır. Hero'daki varsayılan 2 **uygulanmaz**; kartta "Kişi: belirtilmedi". |

### 4.4 Desteklenmeyen kriterler: kontrol sonucu

| Kriter | `/arama`'da filtrelenebiliyor mu? | Dayanak | Kullanıcıya ne söylenir [Ö] |
|---|---|---|---|
| **Denize yakınlık** | **Hayır.** `villa_distances(title text, distance text)` serbest metin; aramada kullanılmıyor | [D] grep 0; önceki şema incelemesi | "Denize mesafeye göre filtreleyemiyoruz. Mesafeler villa sayfasında yazıyor." |
| **Evcil hayvan** | **Hayır.** Kolon ya da parametre yok; muhtemelen kural metni | [D] grep 0; [T] kural metni | "Evcil hayvan kabulüne göre filtreleyemiyoruz. Villa kurallarına bakın ya da bize sorun." |
| **Havuz tipi** (özel/ortak, korunaklı, kapalı, çocuk) | **Hayır.** `pool_type`, `pool_sheltered`, `indoor_pool`, `child_pool` kolonları var ama aramada yok | [D] grep 0 | "Havuz tipine göre filtreleyemiyoruz." |
| **Yatak odası sayısı** | **Hayır.** `bedrooms` yalnız kartta gösteriliyor | [D] `AramaPageBody.tsx:1511` | "Yatak odası sayısına göre filtreleyemiyoruz; kişi sayısıyla aradık." |
| **Bütçe** | **Hayır.** Fiyat aralığı parametresi yok. `sort=price-asc` var ama Hero onu yazmıyor | [D] `lib/pagination.ts:124-132`; `build-search-params.ts` | "Fiyat aralığına göre filtreleyemiyoruz. Sonuç sayfasında fiyata göre sıralayabilirsiniz." |

**İstisna** [T/Ö]:

- Canlı veride bu ihtiyaçlardan birine karşılık gelen bir **villa tipi ya da özellik kaydı** olabilir (ör. "Denize Sıfır Villalar" tipi, "Jakuzi" özelliği). Bu durumda eşleme **mevcut filtreyle** yapılır; yeni filtre sayılmaz.
- Hangilerinin var olduğu Aşama 0 envanteriyle (§10) belirlenir.
- "Muhafazakâr" ile "korunaklı havuz" arasında bir eş anlamlılık kurulup kurulmayacağı **iş kararıdır.** LLM'e bırakılmaz.

**Gösterim** [Ö]:

- `unsupported` kodlarının metinleri sözlükten gelir. Liste kartta gri bir kutuda durur.
- Arama **diğer kriterlerle** yapılır.
- Kutunun altında "Aradığınızı bulamadınız mı? **Biz bulalım** →" bağlantısı bulunur (`/teklif-al`, route mevcut [D]).

---

## 5. TR/EN/DE dil uyumluluğu

| Konu | Durum ve öneri |
|---|---|
| Arayüz dili | Hero `locale` prop'u alıyor ve panele geçiriyor [D] (`Hero.tsx:134-145`, `:438`). AI paneli de aynı `locale` ile `getDictionary(locale).home.search.ai` metinlerini kullanır [Ö]. |
| Girdi dili | Bağımsız. EN sayfasında Türkçe yazan kullanıcı da aynı canonical değerleri alır; arayüz sayfa dilinde kalır [Ö]. |
| Bölge adları | Çevrilmez [D]. Normalize: `normalizeSearchText` (TR katlama + NFKD + küçük harf) [D] `lib/search.ts:44-54`. Ek temizlik [Ö]: kesme işaretinden sonrasını atma ("Fethiye'de", "Kalkan's"); EN iyelik eki; kesme işaretsiz TR ekleri için **bilinen ad önek eşleşmesi** ("kalkanda" → "kalkan"). |
| Villa türü adları | TR canonical ad + `villa_type_translations` EN/DE adları [D]. Faz 0–6 sonrasında TR adı da çeviri tablosunda; eşlemede ikisi de kullanılır [T]. Kullanıcıya gösterilen etiket `resolveTaxonomyName(name, nameByLocale, locale)` [D]. |
| Özellik adları | Aynı desen (`getVillaFeatureNamesByLocale`) [D]. |
| Tarih: TR | "12-18 Haziran 2027", "12 Haziran'dan 18 Haziran'a", "12.06.2027–18.06.2027", "12/06/2027" (gün/ay) |
| Tarih: EN | "June 12–18, 2027", "12–18 June", "Jun 12 to Jun 18". "06/12/2027" belirsiz → yalnız gün > 12 ise yorumlanır; değilse ay adı istenir |
| Tarih: DE | "12.–18. Juni 2027", "vom 12. bis 18. Juni", "12.06.–18.06.2027" |
| Göreli tarih | "gelecek hafta sonu", "next weekend", "nächstes Wochenende" → kurallar çözemezse LLM'e **bugünün İstanbul tarihi** verilir. Sonuç yine doğrulanır. |
| Sayılar | 1–12 arası sayı kelimeleri üç dilde (iki/two/zwei…) + rakam. "für 4 Personen", "for 4 guests", "4 kişilik", "4 kişi". |
| Dil kontrolü | İstekteki `locale` `SUPPORTED_LOCALES`'ta [D] (`lib/i18n/config.ts:31`) ve kamuya açık olmalı. Mevcut kapı: `public-locale-gate.server.ts` [D]; değilse ana dile düşer [Ö]. |
| URL | `localeHref('/arama?…', locale)` → `/arama`, `/en/search`, `/de/suche`. Parametre adları her dilde Türkçe [D]. |
| LLM metni | Kullanıcıya **hiç gösterilmez**. Bütün mesajlar sözlükten; etiketler DB adlarından. Pasif dil sızıntısı ya da yanlış çeviri riski yok [Ö]. |

---

## 6. Önerilen API ve servis mimarisi

### 6.1 Veri akışı

```
[Hero · Yapay Zekâ ile Ara]  q (≤300 karakter), locale, website (honeypot), elapsedMs
        │ POST /api/public/ai-search
        ▼
[1] Koruma: gövde ≤ 4 KB · zod(request) · honeypot / time-trap (contact deseni [D])
            · rate limit "ai_search" (fail-closed) · locale kapısı
        ▼
[2] Sözlük: bölgeler / tipler / özellikler (mevcut fonksiyonlar, bellek önbelleği) + hash
        ▼
[3] Sonuç önbelleği (Redis): ai:v1:<locale>:<bugün>:<sözlükHash>:<sha256(norm(q))> → varsa [6]
        ▼
[4] Kural tabanlı ayrıştırıcı (saf): tarih · kişi · bölge · birebir tip/özellik · esnek
      → kalan anlamlı metin yoksa LLM ATLANIR
        ▼
[5] LLM (gerekirse; günlük bütçe izin veriyorsa):
      output_config.format = json_schema (enum'lar sözlükten), araç yok, DB yok
        ▼
[6] zod(LLM çıktısı) + iş kuralları: tarih/kişi aralığı, sözlük üyeliği,
      kural sonucuyla çelişkide kural kazanır (tarih/kişi)
        ▼
Yanıt: { status, criteria, options, unsupported, clarify, source }
        ▼
[Tarayıcı] Kriter kartı → kullanıcı onayı → buildHeroSearchParams(...) → router.push(localeHref('/arama?…'))
        ▼
[/arama] bugünkü hat (değişmez)
```

### 6.2 Uç nokta [Ö]

`app/api/public/ai-search/route.ts`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, yanıt `Cache-Control: no-store`.

**Route handler mı, server action mı:** Route handler. `applyRateLimit(req, group)` bir `Request` istiyor [D] (`lib/rate-limit.ts:218-221`). Projede server action'lar için rate limit yok.

**İstek (zod):**

```ts
z.object({
  q: z.string().trim().min(3).max(300),
  locale: z.enum(["tr", "en", "de"]),
  website: z.string().max(0).optional(),        // honeypot
  elapsedMs: z.number().int().nonnegative().optional(),
  clarifyAnswer: z.object({ kind: z.literal("type_or"), key: z.string() }).optional(),
}).strict()
```

**Yanıt:**

```ts
{
  ok: true,
  status: "ready" | "needs_input" | "not_understood",
  criteria: {
    start: string | null, end: string | null, guests: number | null, flexible: boolean,
    regionIds: string[], typeIds: string[], featureIds: string[]
  },
  options: {             // buildHeroSearchParams'a aynen verilecek FilterOption[] listeleri
    regions: { id: string; slug: string | null; name: string }[],  // yalnız seçilenler
    types:   { id: string; slug: string | null; name: string }[],  // name = locale'e göre
    features:{ id: string; name: string }[]
  },
  unsupported: ("near_sea" | "pets" | "pool_type" | "bedrooms" | "budget" | "unknown_region" | "other")[],
  unknownRegions?: string[],   // yalnız kullanıcının yazdığı ad; kart için
  clarify: null | { kind: "type_or"; choices: { key: string; name: string }[] }
                | { kind: "dates_partial" } | { kind: "nothing" },
  source: "rules" | "llm" | "cache"
}
// Hata: { ok: false, reason: "rate_limited" | "disabled" | "invalid" | "unavailable" }
```

### 6.3 Modüller

| Dosya (yeni) | Görev | Not |
|---|---|---|
| `lib/ai-search/schema.ts` | zod şemaları: istek, LLM çıktısı, yanıt | saf |
| `lib/ai-search/vocabulary.server.ts` | Sözlük kurulumu, hash, eş anlamlılar | `import "server-only"`; bellek önbelleği 5–10 dk |
| `lib/ai-search/synonyms.ts` | TR/EN/DE ay adları, sayı kelimeleri, dolgu kelimeleri, bölge eş anlamlıları | saf. `lib/` altında olduğu için TR karakter testine girmez [D] |
| `lib/ai-search/rules.ts` | Deterministik ayrıştırıcı | saf; en çok test edilen parça |
| `lib/ai-search/prompt.ts` | Sistem prompt'u (sabit) + sözlük bölümü | saf |
| `lib/ai-search/llm.server.ts` | Sağlayıcı çağrısı: `fetch`, AbortController 6 sn, en çok 1 retry (yalnız 429/5xx), env yoksa `disabled` | `import "server-only"`. SDK gerekmez; düz `fetch` yeterli [Ö] |
| `lib/ai-search/budget.server.ts` | Günlük global sayaç (Redis `INCR` + `EXPIRE`) | Eşik aşılırsa yalnız kurallar çalışır |
| `lib/ai-search/resolve.ts` | Kurallar + LLM birleştirme, doğrulama, `unsupported` / `clarify` kararı | saf |
| `app/api/public/ai-search/route.ts` | Koruma → sözlük → önbellek → kurallar → LLM → doğrulama → yanıt | — |

### 6.4 Sonuç → URL: tek yol [D/Ö]

**URL'yi tarayıcı üretir** (`HeroAiSearch.tsx`, onay butonu):

```ts
import { buildHeroSearchParams } from "../_helpers/build-search-params";   // MEVCUT, değişmez
import { parseLocalDate } from "@/lib/date-format";                        // MEVCUT
import { localeHref } from "@/lib/i18n/locale-href";                       // MEVCUT

const qs = buildHeroSearchParams({
  categories: c.typeIds,       regions: c.regionIds,
  startDate: c.start ? parseLocalDate(c.start) : null,
  endDate:   c.end   ? parseLocalDate(c.end)   : null,
  guests: c.guests ?? 0,
  categoryOptions: res.options.types, regionOptions: res.options.regions,
  flexible: c.flexible ? 3 : 0,
  features: c.featureIds,
});
router.push(localeHref(`/arama?${qs}`, locale));
```

**Neden bu yol:**

- `HeroSearchPanel.handleSearch`'in (`:229-243`) iki satırının birebir eşi. İkinci bir URL kurucu, slug tablosu ya da parametre adı listesi yazılmaz.
- Kullanıcı kartta bir kriteri silerse URL anında yeniden hesaplanır; sunucuya tekrar gidilmez.
- Sunucu tarafında aynı fonksiyon yalnız **testlerde** çağrılır: gidiş-dönüş testleri (§11).

### 6.5 Sağlayıcı ve model: yeniden değerlendirme

| Seçenek | Değerlendirme |
|---|---|
| **Claude Haiku 5.5** (öneri) | Sınıflandırma ve JSON çıkarma için yeterli [T]. Fiyat: $0,10 girdi / $0,50 çıktı (1M token); cache okuma $0,01 [D: resmi fiyat sayfası, önceki raporda alındı]. Yapılandırılmış çıktı: `output_config.format` (`type: "json_schema"`). Dokümantasyona göre "her modelde" kullanılabilir; beta başlığı gerekmiyor [D: platform.claude.com structured outputs sayfası]. |
| Claude Haiku 4.5 | Yaklaşık 10 kat pahalı ($1 / $5). Ek fayda beklenmiyor [T]. |
| Başka sağlayıcı | Yalnız `llm.server.ts` değişir. `AI_SEARCH_PROVIDER` ile soyutlanabilir; ilk sürümde tek sağlayıcı yeterli [Ö]. |

**JSON Schema sınırları** [D: aynı doküman]:

- `enum` destekleniyor.
- Nesnelerde `additionalProperties: false` zorunlu.
- `maxItems`, `minimum`, `maximum`, `maxLength` desteklenmiyor.
- Enum değerleri büyük/küçük harfi değişmiş dönebilir.

Bu yüzden:

1. Sözlük anahtarları `enum` olarak verilir.
2. Sayı ve uzunluk sınırları **zod**'da uygulanır.
3. Anahtarlar sunucuda küçük harfe çevrilip sözlükte yeniden aranır.

**Çağrı parametreleri:**

- `temperature: 0`, `max_tokens ≈ 300`;
- araç (tool) yok;
- sistem prompt'u ve sözlük **önde** (prompt cache), kullanıcı metni **sonda**.

**Prompt cache:** Haiku sınıfında en düşük önbelleklenebilir uzunluk eşiği olabilir [T]. Sözlük kısa kalırsa cache devreye girmeyebilir; maliyete etkisi zaten küçük.

---

## 7. Güvenlik, maliyet ve rate limit

### 7.1 Güvenlik [Ö]

| Risk | Önlem |
|---|---|
| API anahtarının sızması | `AI_SEARCH_API_KEY` yalnız sunucuda. `NEXT_PUBLIC_` öneki yok; `llm.server.ts` içinde `import "server-only"`. Anahtar Hero'ya ya da istemciye hiç gitmez. |
| Prompt injection ("talimatları unut, fiyatları yaz") | LLM'in aracı ve DB erişimi yok. Çıktı yalnız enum + tarih/sayı şeması; serbest metin kullanıcıya gösterilmez. En kötü sonuç: yanlış filtre; kullanıcı kartta görüp düzeltebilir. |
| Halüsinasyon | Villa, fiyat ve müsaitlik `/arama`'dan gelir. Sözlükte olmayan anahtar zod / sözlük kontrolünde atılır. |
| Kişisel veri | Metin e-posta ya da telefon içerebilir. LLM'e gönderilmeden önce maskeleme (regex). Ham sorgu **loglanmaz**; yalnız sayaçlar ve `unsupported` kodları. Sağlayıcıya veri aktarımı için hukuki teyit önerilir; bu bir hukuki değerlendirme değildir. |
| Bot ve maliyet saldırısı | Honeypot + time-trap (`app/api/public/contact/route.ts:14-54` deseni [D]); gövde ve `q` sınırı; rate limit; günlük bütçe; sağlayıcı panelinde aylık harcama limiti. |
| IP taklidi | `resolveClientIp`, `x-forwarded-for`'un **ilk** elemanını alıyor [D] (`lib/rate-limit.ts:191-205`). Traefik başlığı istemcinin gönderdiği değerin önüne ekliyorsa taklit edilebilir [T]. AI için de geçerli; düzeltme ayrı ve küçük bir iş (mevcut grupları da etkiler). Kısa vadede günlük global bütçe asıl korumadır. |
| CSP | LLM çağrısı sunucuda; `connect-src` değişmez [D: önceki inceleme]. |

### 7.2 Rate limit [D/Ö]

**Bugün** [D]:

- `GROUP_CONFIG` tablosu, Upstash sliding window, `prefix: rl:<grup>`.
- **Redis yoksa ya da hata verirse istek geçer** (fail-open): `:223-225`, `:252-257`.

**Öneri** (yalnız ekleme; mevcut gruplar etkilenmez):

| Grup | Limit | Davranış |
|---|---|---|
| `ai_search` | 10 istek / 10 dk / IP | 429 → istemcide "Biraz sonra tekrar deneyin" + Tarihle Ara |
| `ai_search_day` | 50 istek / 24 saat / IP | aynı |
| Global günlük bütçe (`budget.server.ts`) | Ör. 3 000 LLM çağrısı/gün; env ile ayarlanır | Aşılınca LLM kapanır, **kural tabanlı ayrıştırma çalışmaya devam eder** |

**Fail-closed:** `applyRateLimit(req, group, { failClosed: true })` biçiminde isteğe bağlı üçüncü parametre. Varsayılan değeri bugünkü davranış. AI için Redis yoksa `503 unavailable` döner ve istemci Tarihle Ara'ya yönlendirir.

### 7.3 Maliyet [T]

**Varsayımlar:**

- sözlük + prompt ≈ 3 000–5 000 girdi token'ı (bölge, tip, özellik sayısına bağlı);
- çıktı ≈ 150–250 token;
- Haiku 5.5 fiyatları.

| Senaryo | Sorgu başına | Ayda 10 000 AI araması | Ayda 100 000 |
|---|---|---|---|
| Her sorgu LLM'e gider | ≈ $0,0004–0,0006 | ≈ $4–6 | ≈ $40–60 |
| %40 kural kısa yolu + %20 önbellek | ≈ $0,0002 ortalama | ≈ $2–3 | ≈ $20–30 |
| Haiku 4.5 ile (karşılaştırma) | ≈ $0,004–0,006 | ≈ $40–60 | ≈ $400–600 |

**Gereksiz çağrıyı önleme:**

- gönderim yalnız buton ya da Enter ile; yazarken çağrı yok;
- çift tıklama kilidi;
- aynı metin aynı oturumda tekrar gönderilirse istemci önbelleği;
- < 3 ya da > 300 karakter reddedilir;
- kural kısa yolu;
- Redis sonuç önbelleği (24 saat; anahtarda bugünün tarihi ve sözlük hash'i var).

---

## 8. Kullanıcı deneyimi ve mobil tasarım [Ö]

### 8.1 Masaüstü

1. Hero başlığı ve metinleri aynen kalır.
2. Arama alanının üstünde **sekme çubuğu:** `[ Tarihle Ara ]  [ ✦ Yapay Zekâ ile Ara ]`. Varsayılan Tarihle Ara.
   - Seçim `sessionStorage`'da tutulabilir; erişilemezse varsayılana düşülür.
3. **Tarihle Ara:** bugünkü panel, değişiklik yok.
4. **Yapay Zekâ ile Ara**, boş durum:
   - tek satır yuvarlatılmış giriş (yer tutucu: "Örn. 12–18 Haziran'da Kalkan'da 2 kişilik muhafazakâr villa");
   - sağda turuncu→mavi **Villa Bul** butonu. Hero CTA'sıyla aynı stil; yeni bir tasarım dili eklenmez.
   - altında "Şunu deneyebilirsiniz:" + 3 örnek chip. Tıklanınca giriş alanına yazılır ve gönderilir. Chip metinleri dil başına sözlükten gelir.
   - en altta "Aradığınızı bulamadınız mı? **Biz bulalım** →" (`/teklif-al`).
5. **Yükleniyor:**
   - buton "Anlıyorum…" + spinner, giriş kilitli;
   - `aria-live="polite"`;
   - 6 sn zaman aşımında hata durumuna geçilir.
6. **Kriter kartı** (`status: ready`) — "Şöyle anladık":

   ```
   Tarih      12 Haz 2027 – 18 Haz 2027  (6 gece)        ✕
   Kişi       2 kişi                                     ✕
   Bölge      Kalkan · Fethiye                           ✕ (chip başına)
   Villa türü Muhafazakâr villalar                       ✕
   ───────────────────────────────────────────────
   ⓘ Şunlara göre filtreleyemiyoruz: denize yakınlık, bütçe
   [ Bu kriterlerle ara → ]        Metni düzenle
   ```

   - Her chip kaldırılabilir; URL tarayıcıda yeniden hesaplanır.
   - **Bu kriterlerle ara** → `buildHeroSearchParams` → `/arama`.
   - Değer düzenleme (tarih seçici, kişi seçici) ilk sürümde **yok.** "Metni düzenle" ya da "Tarihle Ara'ya geç" yeterli. Böylece kart küçük kalır ve yeni bir tarih bileşeni gerekmez.
7. **Takip sorusu** (`needs_input`), en fazla bir kez:
   - `type_or`: "Hangisiyle arayalım?" [Muhafazakâr] [Balayı]. Seçim sunucuya `clarifyAnswer` olarak gider; **LLM tekrar çağrılmaz**, önbellekteki sonuç güncellenir.
   - `dates_partial`: "Tarih vermediniz. Tarihsiz arayalım mı, yoksa Tarihle Ara'da tarih mi seçersiniz?"
8. **Anlaşılmadı** (`not_understood`): kısa mesaj + 3 örnek chip + "Tarihle Ara'ya geç".
9. **Hata / kapalı / limit:** "Yapay zekâ araması şu an kullanılamıyor" + Tarihle Ara'ya geçiş. `role="alert"`.

### 8.2 Mobil

- Sekmeler tam genişlikte, iki eşit buton; dokunma hedefi ≥ 44 px.
- Giriş, en çok 3 satıra büyüyen `textarea`; Enter gönderir, Shift+Enter yeni satır.
- **Villa Bul** butonu girişin **altında**, tam genişlikte.
- Örnek chip'ler yatay kaydırmalı tek satır.
- Kriter kartı alt alta; kaldırma (✕) düğmeleri büyük.
- Klavye açıkken buton görünür kalmalı: `scrollIntoView({block:"nearest"})`. Bugünkü `MobileKbSafeInput` yaklaşımıyla aynı fikir [T].
- Hero yüksekliği (`60svh`) değişmez. Kart Hero'dan uzarsa Hero doğal olarak uzar; içerik taşmaz.
- Panel arka planı Tarihle Ara paneliyle aynı cam efekt (`bg-white/30 backdrop-blur-xl`). Koyu Hero görseli üzerinde okunabilirlik korunur.

### 8.3 Erişilebilirlik

- Sekmeler için `role="tablist"`, `tab` (`aria-selected`, `aria-controls`), `tabpanel`; ok tuşlarıyla gezinme.
- Girişte `aria-describedby` → örnekler; kart başlığı `h3`.

---

## 9. Değişecek dosyaların listesi

### 9.1 Değişecek mevcut dosyalar (minimum, eklemeli)

| Dosya | Değişiklik | Kapsam |
|---|---|---|
| `app/components/ui/Hero.tsx` | `HeroSearchModes` import'u; `:438`'deki tek satır bayrağa bağlı sarmalayıcı (§2.2) | ~5 satır |
| `lib/i18n/dictionaries/types.ts` | `home.search.ai: {...}` tip bloğu | eklemeli |
| `lib/i18n/dictionaries/tr.ts`, `en.ts`, `de.ts` | Sekme adları, yer tutucu, örnek chip'ler, buton, yükleme, kart etiketleri, `unsupported.*` metinleri, takip soruları, hata metinleri | eklemeli |
| `lib/rate-limit.ts` | `RateLimitGroup` birleşimine `ai_search` ve `ai_search_day`; `GROUP_CONFIG` satırları; `applyRateLimit`'e isteğe bağlı `{ failClosed }`; bütçe sayacı için Redis istemcisini dışa açmak (ya da küçük bir `lib/redis.server.ts`) | eklemeli; mevcut çağrılar aynı |
| `package.json` (+ lock) | `zod` → `dependencies` (lock'taki 4.x ile uyumlu) | 1 satır |
| `.env.example` | `AI_SEARCH_ENABLED`, `AI_SEARCH_API_KEY`, `AI_SEARCH_MODEL`, `AI_SEARCH_DAILY_LLM_LIMIT` | eklemeli |

### 9.2 Yeni dosyalar

- **Arayüz:**
  - `app/components/ui/hero/_components/HeroSearchModes.tsx` (`"use client"`; sekmeler + lazy AI paneli);
  - `app/components/ui/hero/_components/HeroAiSearch.tsx` (`"use client"`; giriş, kart, onay; `buildHeroSearchParams` çağrısı).
- **Uç nokta:** `app/api/public/ai-search/route.ts`.
- **Mantık:** `lib/ai-search/{schema.ts, vocabulary.server.ts, synonyms.ts, rules.ts, prompt.ts, llm.server.ts, budget.server.ts, resolve.ts}`.
- **Testler** (§11):
  - `tests/unit/ai-search-rules.test.ts`
  - `tests/unit/ai-search-schema.test.ts`
  - `tests/unit/ai-search-resolve.test.ts`
  - `tests/unit/ai-search-route.test.ts`
  - `tests/unit/ai-search-url-roundtrip.test.ts`
  - `tests/unit/hero-search-modes.test.tsx`

### 9.3 Dokunulmayacak dosyalar (kesin)

- **Hero:** `HeroSearchPanel.tsx`, `_helpers/build-search-params.ts`, `_helpers/format-date.ts`, `_helpers/date-label.ts`, `hero-filters.action.ts`, `hero-features.action.ts`.
- **Arama:** `AramaPageBody.tsx`, `app/(public)/[lang]/(site)/arama/*`, `app/(public)/arama/FilterSidebar.tsx`, `lib/pagination.ts`.
- **Veri ve iş mantığı:** `lib/db/*.repository*.ts`, `lib/cache.helpers.ts` (yalnız okunur), `lib/price.engine.ts`, `lib/availability.helper.ts`, `lib/stay-rules.helper.ts`, rezervasyon servisleri.
- **Kart:** `VillaCard.tsx`.
- **Altyapı:** migration'lar, `lib/i18n/locale-href.ts`, `lib/search.ts`.

---

## 10. Aşamalı uygulama planı [Ö]

| Aşama | Kapsam | Çıkış ölçütü | Kullanıcıya etkisi |
|---|---|---|---|
| **0 — Veri envanteri** (salt okunur; ekip SSH ile çalıştırır) | Aşağıdaki sorgular | Gerçek sözlük; hangi "desteklenmeyen" isteğin bir tip ya da özellikle karşılanabildiği; eş anlamlı listesi | Yok |
| **1 — Saf mantık** | `schema.ts`, `synonyms.ts`, `rules.ts`, `resolve.ts`, `prompt.ts` + tablo testleri (≥ 120 örnek, üç dil) | Testler yeşil; `tsc` / `eslint` temiz | Yok (kod bağlı değil) |
| **2 — Uç nokta (bayrak kapalı)** | `vocabulary.server.ts`, `llm.server.ts`, `budget.server.ts`, route, rate limit eklemeleri, `zod` bağımlılığı, `.env.example` | Route testleri: 429, fail-closed, bütçe, zaman aşımı, injection, boyut | Yok (`AI_SEARCH_ENABLED=false`) |
| **3 — Arayüz (bayrak kapalı)** | `HeroSearchModes`, `HeroAiSearch`, sözlük anahtarları, `Hero.tsx` satırı | Bayrak kapalıyken Hero DOM'u aynı; mevcut testler aynen yeşil; TR karakter testi yeşil | Yok |
| **4 — Staging / iç test** | Bayrak açık; ~50 gerçek cümle; mobil cihaz kontrolü; maliyet ve gecikme ölçümü | Doğruluk ve gecikme kabul edilirse | Yalnız staging |
| **5 — Yayın** | Prod'da bayrak açılır; sağlayıcı harcama limiti; günlük bütçe; log sayaçları izlenir | 1–2 hafta izleme | Yeni sekme görünür |

**Aşama 0 sorguları** (salt okunur; bu çalışmada **çalıştırılmadı**):

```sql
SELECT name, slug FROM villa_types ORDER BY sort_order, name;
SELECT t.locale, t.name FROM villa_type_translations t ORDER BY 1, 2;
SELECT name FROM villa_features ORDER BY 1;
SELECT name, slug, filter_group_name, show_in_filter FROM villa_locations ORDER BY filter_group_name, name;
SELECT count(*) FILTER (WHERE slug IS NULL) AS slugsuz_bolge FROM villa_locations;
SELECT count(*) FILTER (WHERE slug IS NULL) AS slugsuz_tip FROM villa_types;
```

**Geri dönüş:** `AI_SEARCH_ENABLED=false` + yeniden başlatma. Hero bugünkü hâline döner. DB değişikliği olmadığı için başka geri alma gerekmez.

---

## 11. Test senaryoları

### 11.1 Kural ayrıştırıcı (tablo testi, saf)

| # | Girdi | Beklenen |
|---|---|---|
| R1 | "12-18 Haziran 2027 arasında Kalkan veya Fethiye'de 2 kişilik muhafazakâr villa arıyorum." | start 2027-06-12, end 2027-06-18, guests 2, regions [kalkan, fethiye], types [muhafazakar*], LLM yok |
| R2 | "June 12–18, 2027 in Kalkan for 4 guests" | Tarih + guests 4 + Kalkan |
| R3 | "12.–18. Juni 2027, Kaş, 6 Personen" | Tarih + guests 6 + Kaş |
| R4 | "5 Ağustos'tan 10 Ağustos'a" (yıl yok, bugün 2026-11-06) | 2027-08-05 / 2027-08-10 |
| R5 | "2 yetişkin 2 çocuk" | guests 4 |
| R6 | "Ağustosta 5 gece" | Tarih yok; `clarify: dates_partial` |
| R7 | "30 Şubat 2027" | Tarih atılır (takvim kontrolü) |
| R8 | "18-12 Haziran" (ters) | Tarih atılır + uyarı |
| R9 | "Bodrum'da villa" | `unknownRegions: [Bodrum]`, bölge yok |
| R10 | "muhafazakâr veya balayı" | `clarify: type_or` |
| R11 | "denize yakın, evcil hayvan kabul eden, 3 yatak odalı, 5000 TL altı" | `unsupported`: near_sea, pets, bedrooms, budget (sözlükte karşılığı yoksa) |
| R12 | "kalkanda" (kesme işaretsiz ek) | Kalkan |
| R13 | "esnek tarihli" + tarih | flexible true |
| R14 | "06/12/2027" EN sayfası | Belirsiz → tarih atılır |

### 11.2 Şema ve doğrulama

- Sözlükte olmayan anahtar atılır.
- Büyük harfli enum (`"KALKAN"`) normalize edilir.
- `guests: 0`, `-3`, `500` → null ya da reddedilir.
- `additionalProperties` içeren LLM çıktısı reddedilir; kural sonucu kullanılır.

### 11.3 URL gidiş-dönüş (kritik)

Senaryo:

1. AI kriterleri → `buildHeroSearchParams` (gerçek fonksiyon) → query string.
2. Bu string, `/arama`'nın parse kurallarıyla (`firstString`, `split(",")`, `resolveTokens`, `isValidYmd`, `Number(guests)`, flexible clamp) geri çözülür.
3. Aynı id kümeleri ve tarihler elde edilmeli.

Kenar durumları:

- slug'ı `NULL` olan bölge ya da tip → UUID token;
- alt bölge slug'ı;
- 0 kişi → `guests` yok;
- özellik UUID'leri;
- dil önekli yol (`/en/search?...`).

### 11.4 Uç nokta

- 429 (`ai_search`);
- Redis yok → 503 (fail-closed), **mevcut gruplar etkilenmez**;
- günlük bütçe doldu → `source: rules`;
- LLM zaman aşımı ya da 5xx → kural sonucu ya da `unavailable`;
- honeypot dolu → sessiz `not_understood`;
- gövde > 4 KB → 413/400;
- e-posta ve telefon maskelendi (LLM'e giden gövde mock'la kontrol edilir);
- `AI_SEARCH_API_KEY` yanıtta ya da logda yok;
- pasif `locale` → ana dil.

### 11.5 Arayüz ve regresyon

- **Bayrak kapalı:** Hero render ağacında `HeroSearchModes` yok; `HeroSearchPanel` bugünkü konumda.
- **Bayrak açık:**
  - sekme değişince Tarihle Ara state'i korunuyor (`hidden`, unmount yok);
  - AI paneli ilk tıklamadan önce yüklenmiyor.
- **Kart:** chip kaldırınca URL yeniden hesaplanıyor; onay → `router.push` doğru `localeHref` ile.
- **Mevcut testler aynen yeşil:**
  - `homepage-p0-i18n.test.tsx`;
  - `villa-feature-filter.test.tsx` H bölümü (`buildHeroSearchParams`);
  - `public-tr-leak-forensic.test.ts` (yeni bileşenlerde TR karakter yok).
- **Mobil (manuel):** iPhone SE / 390 px / Android; klavye açıkken buton görünür; Hero taşma yok.

---

## 12. Riskler ve mevcut sistemin korunması

### 12.1 Riskler

| Risk | Olasılık | Etki | Önlem |
|---|---|---|---|
| Tip AND semantiği ile "veya" isteği çakışıyor | Orta | Gereksiz 0 sonuç | `clarify: type_or` (§4.3) |
| Canlıda tip ya da özellik adları beklenenden farklı | Orta [T] | Düşük eşleme oranı | Aşama 0 envanteri + eş anlamlı listesi |
| AI'ın önerdiği tarihli villa rezervasyonda min. konaklama nedeniyle reddediliyor | Orta | Kullanıcı hayal kırıklığı | §12.3; bilgilendirme metni |
| `.mt-12` ezme seçicisinin çalışmaması | Düşük [T] | Görsel boşluk | Aşama 3'te görsel kontrol |
| IP taklidi ile limit aşımı | Düşük–orta [T] | Maliyet | Global günlük bütçe + sağlayıcı aylık limiti |
| LLM gecikmesi | Orta | Yavaş hissiyat | Kural kısa yolu, önbellek, 6 sn zaman aşımı, yükleme durumu |
| Sözlük önbelleğinin bayatlaması (admin yeni özellik ekler) | Düşük | Yeni özellik birkaç dakika tanınmaz | 5–10 dk TTL; `/arama` geçersiz token'ı zaten atıyor [D] |
| KVKK ve sağlayıcıya veri aktarımı | — | Hukuki | Maskeleme, ham sorgu logu yok, hukuki teyit |

### 12.2 Mevcut sistemin korunması: kontrol listesi

| Korunacak | Nasıl güvence altına alınıyor |
|---|---|
| Tarihle Ara bileşeni ve mantığı | Dosya değişmiyor; children olarak sarılıyor; bayrak kapalıyken birebir aynı satır |
| `buildHeroSearchParams` | Değişmiyor; yalnız yeni bir çağıranı oluyor |
| `/arama` sonuç sayfası, parametreleri, parse'ı | Değişmiyor; AI yalnız mevcut parametreleri mevcut biçimde üretiyor |
| Repository / villa sorguları | Değişmiyor; AI DB'ye yalnız mevcut taksonomi okuma fonksiyonlarıyla, sözlük için dokunuyor |
| Fiyat, müsaitlik, rezervasyon | Değişmiyor; `/arama` ve rezervasyon akışı aynen |
| Villa kartları | Değişmiyor |
| Rate limit'in mevcut grupları | Yeni seçenek isteğe bağlı; varsayılan bugünkü fail-open |
| Geri dönüş | Tek env bayrağı |

### 12.3 Teknik not: minimum konaklama süresi

| Kontrol yeri | Minimum konaklamayı uyguluyor mu? | Dayanak |
|---|---|---|
| `/arama` | **Hayır.** `minimum_stay` / `min_stay` geçmiyor | [D] `AramaPageBody.tsx`, `findSearchResults` |
| Villa sayfası rezervasyon motoru | Evet | [D] `app/components/villa/booking/useBookingEngine.ts` |
| Sunucu rezervasyon doğrulaması | Evet; orphan-gap kuralı dahil | [D] `app/services/reservation/_helpers/stay-verify.ts`, `lib/stay-rules.helper.ts` |

- **Sonuç:** Tarihle Ara'da da bugün aynı durum var. "3 gecelik" bir aramada, minimum 5 gece isteyen villa listelenebilir; rezervasyon adımında reddedilir. AI bu davranışı **değiştirmez ve kötüleştirmez.** Yalnız göreli tarih kolaylaştığı için kısa aramalar artabilir [T].
- **Bu çalışmadaki tutum:** arama motorunun davranışı değiştirilmez.
- **Yalnız bilgilendirme önerisi:** AI kriter kartında, gece sayısı kısa olduğunda (ör. < 5) sözlükten bir not: "Bazı villalarda minimum konaklama süresi vardır; uygunluk rezervasyon adımında kesinleşir."
- **İleride** `/arama`'ya kural eklenmesi ayrı bir ürün kararı. Manuel ve AI aramasını birlikte etkiler.

---

## Karar gerektiren noktalar

1. **Model:** Claude Haiku 5.5 öneriliyor; env ile değiştirilebilir.
2. **"Muhafazakâr" eş anlamlıları:** "korunaklı havuz", "conservative", "halal" gibi ifadelerin bu tipe eşlenip eşlenmeyeceği bir iş kararı.
3. **Limitler:** 10 / 10 dk / IP; 50 / gün / IP; global 3 000 LLM çağrısı / gün. Değerler onaylanmalı.
4. **Sorgu kaydı:** ilk sürümde yalnız sayaçlar ve `unsupported` kodları. Ham metin saklanmayacak; onay gerekiyor.
5. **Aşama 0 envanter sorgularının** canlıda ekip tarafından çalıştırılması.

---

**İşlem beyanı:**

- Kod, SQL, migration, DB, commit, push ve deploy **yok**.
- İnceleme, `6d09529` commit'inin bulut sandbox'ındaki salt okunur kopyası üzerinde yapıldı. Cihazdaki repoda yalnız `git log` / `git status` salt okunur çalıştırıldı (`--no-optional-locks`).
- Repoya yazılan tek dosya bu rapor (`Claude outputs/yapay-zeka-villa-arama-revize-mimari-analizi.md`, izlenmeyen yeni dosya).

**Kaynaklar:**

- [Claude API fiyatları](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
