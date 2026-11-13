# Eklentiler → Kiraligim

Merkezi Kiraligim takviminden villa doluluklarını alır. Doluluklar mevcut
harici takvim altyapısıyla (`external_calendar_sources` /
`external_calendar_events`) yazılır; böylece arama, müsaitlik, rezervasyon
doğrulaması, 031/097 çakışma tetikleyicileri ve kısa boşluklar Kiraligim
dolulukları için de **değişiklik olmadan** çalışır. `reservations` ve
`manual_reservations` tablolarına Kiraligim verisi yazılmaz.

## Dosyalar

| Yol | Ne |
| --- | --- |
| `lib/plugins/registry.ts` | Eklenti listesi (Eklentiler sayfası) |
| `lib/plugins/kiraligim/core/*` | Siteden bağımsız çekirdek: API istemcisi, aralık matematiği, webhook imzası, tipler |
| `lib/plugins/kiraligim/config.server.ts` | Ortam değişkenleri (değerler istemciye gitmez) |
| `lib/plugins/kiraligim/crypto.server.ts` | Webhook secret için AES-256-GCM |
| `lib/plugins/kiraligim/store.server.ts` | Veritabanı (yalnız `source_type='kiraligim'` kaynaklarına yazar) |
| `lib/plugins/kiraligim/sync.server.ts` | Bağlama, snapshot, hesap akışı, durum yönetimi |
| `lib/plugins/kiraligim/webhook.server.ts` | Webhook kaydı ve alıcı |
| `lib/plugins/kiraligim/guard.server.ts` | iCal admin uçlarında Kiraligim kayıtlarını koruma |
| `app/(admin)/maki-admin/eklentiler/**` | Admin ekranları (izin: `plugins`) |
| `app/api/integrations/kiraligim/webhook` | Public webhook alıcısı (yalnız imza) |
| `app/api/cron/kiraligim-sync` | Zamanlanmış senkron (CRON_SECRET) |
| `db/migrations/109_kiraligim_plugin.sql` | Eklenti tabloları + `plugins` izni |

## Ortam değişkenleri (Coolify → Environment, yalnız sunucu)

| Değişken | Değer |
| --- | --- |
| `KIRALIGIM_API_BASE` | `https://app.kiraligim.com` (boşsa bu varsayılan kullanılır) |
| `KIRALIGIM_API_KEY` | Kiraligim Super Admin'in bu site için oluşturduğu `kg_live_…` anahtarı |
| `KIRALIGIM_ENCRYPTION_KEY` | `openssl rand -base64 32` — webhook secret'ını DB'de şifreler |

`NEXT_PUBLIC_` öneki **kullanılmaz**. Panel yalnız "tanımlı / tanımsız /
geçersiz" gösterir. `KIRALIGIM_ENCRYPTION_KEY` değişirse kayıtlı webhook
secret'ı çözülemez: Eklentiler → Kiraligim → "Sırrı yenile".

## Kurulum sırası

1. Migration: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f db/migrations/109_kiraligim_plugin.sql`
2. Ortam değişkenleri → Redeploy.
3. Eklentiler → Kiraligim → "Bağlantıyı test et".
4. "Kiraligim villalarını getir" → her Kiraligim villasını yerel villayla eşleştir → "Bağla"
   (ilk snapshot otomatik alınır).
5. "Webhook'u etkinleştir".
6. Coolify Scheduled Task (yedek yol, webhook kaçırılsa bile):
   `*/5 * * * *` → `curl -fsS --max-time 120 -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/kiraligim-sync`

## Davranış

- **Snapshot:** villanın Kiraligim dolulukları bütünüyle yeniden kurulur
  (`external_uid = kiraligim:<başlangıç>:<bitiş>`).
- **Değişiklikler:** hesap geneli akış (`/calendar-changes`); sayfa + cursor aynı
  transaction'da yazılır, kesinti sonrası yeniden uygulama sonucu değiştirmez.
  Aynı anda tek senkron (advisory lock). Webhook yalnız tetikleyicidir.
- **410 cursor süresi doldu:** yeni cursor + bütün güncel bağlantılar için snapshot.
- **Duraklatıldı (villa/işletme Kiraligim'de pasif):** doluluklar korunur;
  yeniden etkinleşince tam pencere değişikliği uygulanır.
- **Bağlantı kesildi / izin kaldırıldı:** o villanın Kiraligim dolulukları kalkar,
  kaynak pasif olur. Kiraligim'deki kayıtlar değişmez.
- **Elle değişiklik yok:** iCal ekranlarında Kiraligim kayıtları için pasifleştir,
  aktifleştir, senkronize et, kalıcı temizle, kaynak aç/kapa ve URL değiştirme
  kapalıdır (sunucuda 409). Normal iCal kayıtlarının davranışı değişmedi.
- **iCal senkronu:** cron listesi `source_type = 'kiraligim'` kaynaklarını
  hariç tutar; diğer bütün kaynaklar için davranış aynıdır.
- **Uyarılar (otomatik işlem yok):** aynı villa Kiraligim iCal adresiyle de
  besleniyorsa "çift besleme"; Kiraligim doluluğu yerel rezervasyon veya manuel
  blokla çakışıyorsa "çakışmalar". Not: bekleyen bir rezervasyon, Kiraligim'de
  dolu görünen tarihlerde onaylanamaz (031 tetikleyicisi; iCal ile aynı).

## Geri alma

`109_kiraligim_plugin.sql` başındaki komutlar (Kiraligim kaynakları silinir →
doluluklar takvimden kalkar; eklenti tabloları ve `plugins` izni kaldırılır).
Önce Scheduled Task'ı kapatın ve webhook'u silin.

## Testler

- Birim: `npx vitest run tests/unit/kiraligim`
- PostgreSQL (geçici veritabanı kurar/siler; yalnız yerel/test sunucusu):
  `KIRALIGIM_PG_ADMIN_URL=postgres://postgres:…@127.0.0.1:5432/postgres npx vitest run tests/integration/kiraligim-plugin-pg.test.ts`
