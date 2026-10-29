/* ===============================================================
   🔎 MIGRATION 099 — Depozito para birimi
   ===============================================================
   HEDEF:
     Hasar depozitosu (villa.deposit) artık temizlik ücreti ve havuz
     ısıtma ücreti gibi TEK TUTAR + PARA BİRİMİ ile tanımlanabilir.

   EKLENEN KOLONLAR:
     villa.deposit_currency            text NULL DEFAULT 'TRY'
       → villa.deposit tutarının para birimi (TRY/USD/EUR/GBP).
         Uygulama NULL / tanımsız değeri TRY kabul eder.
     reservations.original_damage_deposit          numeric NULL
       → Rezervasyon anındaki depozito tutarı, villanın kendi para
         biriminde (snapshot).
     reservations.original_damage_deposit_currency text NULL
       → original_damage_deposit'in para birimi.

   SEMANTİK (DEĞİŞMEYEN):
     reservations.damage_deposit → TRY karşılığı olarak kalır (TRY
     depozitoda tutarın kendisi). Eski okuyucular ₺ göstermeye devam
     edebilir. Depozito toplam / ön ödeme / kalan ödeme hesaplarına
     HİÇBİR ŞEKİLDE dahil değildir.

   GERİYE DÖNÜK UYUMLULUK:
     - Yalnız kolon EKLENİR; mevcut kolon / satır DEĞİŞTİRİLMEZ veya
       SİLİNMEZ. Backfill / UPDATE YOK.
     - Mevcut villalar deposit_currency='TRY' (DEFAULT) okur → davranış
       aynı. Eski rezervasyonlarda original_* NULL → uygulama TRY kabul
       eder.

   DEPLOY SIRASI:
     Bu migration, kodu deploy etmeden ÖNCE uygulanmalıdır (yeni kod
     bu kolonları açık SELECT listelerinde okur).

   IDEMPOTENT:
     ADD COLUMN IF NOT EXISTS → tekrar çalıştırmada no-op.

   ROLLBACK (gerekirse):
     ALTER TABLE villa DROP COLUMN IF EXISTS deposit_currency;
     ALTER TABLE reservations DROP COLUMN IF EXISTS original_damage_deposit;
     ALTER TABLE reservations DROP COLUMN IF EXISTS original_damage_deposit_currency;
   =============================================================== */

ALTER TABLE villa
  ADD COLUMN IF NOT EXISTS deposit_currency text DEFAULT 'TRY';

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS original_damage_deposit numeric NULL,
  ADD COLUMN IF NOT EXISTS original_damage_deposit_currency text NULL;

/* ===============================================================
   DOĞRULAMA (manuel):
     SELECT id, deposit, deposit_currency FROM villa LIMIT 5;
     SELECT id, damage_deposit, original_damage_deposit,
            original_damage_deposit_currency
       FROM reservations ORDER BY created_at DESC LIMIT 5;
   =============================================================== */
