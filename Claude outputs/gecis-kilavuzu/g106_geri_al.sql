-- G106 — 106 geri alma (Faz 2 §6). Ardından 103_url_redirects.sql ve 105_symmetric_content_foundation.sql YENİDEN çalıştırılır.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
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
