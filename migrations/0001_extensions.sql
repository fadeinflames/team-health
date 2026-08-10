-- Расширения. Отдельным первым файлом, чтобы всё остальное могло на них
-- рассчитывать. pgcrypto нужен под gen_random_uuid() в новых таблицах;
-- на PostgreSQL 13+ функция есть и в ядре, но явное расширение снимает
-- зависимость от версии сервера.

-- Up Migration
create extension if not exists pgcrypto;

-- Down Migration
drop extension if exists pgcrypto;
