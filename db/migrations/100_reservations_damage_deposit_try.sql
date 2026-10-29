/* ===============================================================
   🔎 MIGRATION 100 — reservations.damage_deposit_try (NUMERIC)
   ===============================================================
   SORUN:
     Migration 099 ile depozito villanın kendi para biriminde (EUR/USD/
     GBP) tanımlanabilir oldu. Rezervasyonda TRY karşılığı `convertPrice`
     ile 2 haneli (kuruşlu) hesaplanır — ör. 200 EUR × 55,5241 =
     11104,82 TL. Bu değer eski `reservations.damage_deposit` kolonuna
     yazılıyordu; kolon canlıda INTEGER olduğu için INSERT
     "invalid input syntax for type integer" (22P02) ile reddediliyordu.

   ÇÖZÜM — temizlik ücreti ile AYNI veri modeli:
     temizlik : original_cleaning_fee + original_cleaning_currency
                + cleaning_fee_try (kuruşlu TRY)
     depozito : original_damage_deposit + original_damage_deposit_currency
                (099) + damage_deposit_try (BU migration, numeric)
     Kuruşlu TRY karşılığı yuvarlanmadan damage_deposit_try'a yazılır;
     yuvarlama yalnız gösterimde yapılır.

   EKLENEN KOLON:
     reservations.damage_deposit_try numeric NULL

   DEĞİŞMEYEN:
     reservations.damage_deposit (INTEGER) — tipi ve mevcut değerleri
     DEĞİŞMEZ. TRY depozitoda eskisi gibi tutar yazılır; yabancı para
     biriminde 0 yazılır (TL cinsinden girilmiş depozito yoktur).
     Depozito toplam / ön ödeme / kalan ödemeye dahil DEĞİLDİR.

   GERİYE DÖNÜK UYUMLULUK:
     Yalnız kolon EKLENİR; backfill / UPDATE / DELETE YOK. Eski
     kayıtlarda damage_deposit_try NULL → uygulama damage_deposit'i TRY
     tutarı olarak okur (eski davranış).

   DEPLOY SIRASI:
     Bu migration kod deploy'undan ÖNCE uygulanmalıdır — yeni kod her
     rezervasyon INSERT'inde damage_deposit_try yazar.

   IDEMPOTENT: ADD COLUMN IF NOT EXISTS.

   ROLLBACK (gerekirse):
     ALTER TABLE reservations DROP COLUMN IF EXISTS damage_deposit_try;
   =============================================================== */

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS damage_deposit_try numeric NULL;

/* ===============================================================
   DOĞRULAMA (manuel, salt okunur):
     SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_name = 'reservations'
        AND column_name IN ('damage_deposit', 'damage_deposit_try',
                            'original_damage_deposit',
                            'original_damage_deposit_currency',
                            'cleaning_fee_try', 'original_cleaning_fee');
   =============================================================== */
