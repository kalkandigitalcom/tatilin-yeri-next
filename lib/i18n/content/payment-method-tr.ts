/* 🌐 Faz 5 dalga 2 — ÖDEME YÖNTEMİNE ÖZEL Türkçe ad kuralı.
   Voucher ve rezervasyon e-postaları Türkçedir ve `payment_methods.name`
   (TR aynası) okur (Faz 0 kararı 7). Ana dil TR değilken oluşturulan
   yöntemin TR adı boş kalırsa voucher/e-postada "Ödeme Yöntemi" satırı
   görünmez. Bu yüzden YALNIZ ödeme yöntemlerinde TR ad zorunludur;
   genel içerik mimarisinde TR zorunlu DEĞİLDİR. */
export const PAYMENT_METHOD_TR_NAME_REQUIRED =
  "Ödeme yöntemi için Türkçe ad zorunlu (voucher ve e-postalar Türkçe gönderilir)";
