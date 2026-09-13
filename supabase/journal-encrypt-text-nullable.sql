-- Journal: permite texto vacío en notas cifradas.
-- Pegar en el editor SQL y ejecutar una vez. Depende de haber corrido ya
-- journal.sql, journal_key.sql y journal-encrypt-columns.sql.
--
-- Una nota cifrada guarda su contenido en `ciphertext`, no en `text` — `text`
-- se manda en `null` para que el texto en claro nunca llegue a Supabase. El
-- check original exigía texto no vacío siempre; se sustituye por uno que lo
-- exige solo cuando la nota NO está cifrada, y exige ciphertext+iv cuando sí.

begin;

alter table public.journal_entries
  drop constraint journal_entries_text_check;

-- Si el nombre no coincide (Postgres a veces lo numera distinto), búscalo con:
--
-- select conname from pg_constraint
-- where conrelid = 'public.journal_entries'::regclass and contype = 'c';

alter table public.journal_entries
  alter column text drop not null,
  add constraint journal_entries_text_or_cipher_check check (
    (not encrypted and char_length(trim(text)) > 0)
    or
    (encrypted and ciphertext is not null and iv is not null)
  );

commit;
