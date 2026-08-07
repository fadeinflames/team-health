-- Убираем легаси-роль 'admin'.
--
-- В rc0.1 роль называлась 'admin', потом появилась 'platform_admin', и
-- publicUser() стал переводить одно в другое на каждом чтении. То есть база
-- хранила значение, которое приложение считало устаревшим. Чиним в базе,
-- нормализацию из кода убираем.
--
-- Данные и DDL в одном файле сознательно: constraint нельзя сузить раньше,
-- чем строки приведены к новому набору значений, а users — таблица на
-- десятки строк, разносить их по релизам не за чем.
--
-- not valid + отдельный validate — привычка с больших таблиц: так проверка
-- всех строк не держит ACCESS EXCLUSIVE. Здесь выигрыша нет, но шаблон
-- правильный, и копировать в следующую миграцию будут его.

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

update users set role = 'platform_admin' where role = 'admin';

alter table users drop constraint users_role_check;
alter table users add constraint users_role_check
  check (role in ('platform_admin', 'lead', 'employee')) not valid;
alter table users validate constraint users_role_check;

-- Down Migration
set local lock_timeout = '3s';

alter table users drop constraint users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'platform_admin', 'lead', 'employee'));
-- Обратно в 'admin' не переводим: какая из строк была легаси, а какая
-- изначально platform_admin, после up неразличимо. Это и есть причина,
-- по которой down не считается средством восстановления.
