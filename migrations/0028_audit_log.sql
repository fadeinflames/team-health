-- Журнал аудита: кто, что и над чем сделал.
--
-- Пишется напрямую из server.js отдельным запросом, а не через снимок
-- рабочего пространства (syncWorkspace его не знает и строк не удаляет).
--
-- Внешних ключей нет намеренно: запись «пользователь X удалён» обязана
-- пережить X, а actor_username дублирует имя на момент события, потому что
-- по actor_user_id к тому времени строки в users уже может не быть. По той
-- же причине target_id — просто текст: цель события (человек, опрос, заметка)
-- тоже может быть удалена.
--
-- В details лежат только метаданные события (роль до и после, режим
-- удаления и т.п.). Тексты заметок и пароли туда не попадают — это правило
-- кода, а не базы, поэтому ограничения на содержимое здесь нет.
--
-- Длины ограничены check-констрейнтами, как в 0025: таблица новая и пустая,
-- поэтому они сразу валидны, без not valid. details не ограничивается по
-- размеру; его объём держит код, который пишет журнал.
--
-- Индекс по at desc обслуживает единственный запрос чтения: последние N
-- записей. Постраничность идёт по id (before=<id>), он и так первичный ключ.

-- Up Migration
create table audit_log (
  id             bigserial primary key,
  at             timestamptz not null default now(),
  actor_user_id  text,
  actor_username text,
  action         text not null,
  target_type    text,
  target_id      text,
  details        jsonb not null default '{}'::jsonb,
  constraint audit_log_action_length check (length(action) <= 80),
  constraint audit_log_target_type_length check (length(target_type) <= 40),
  constraint audit_log_target_id_length check (length(target_id) <= 200),
  constraint audit_log_actor_username_length check (length(actor_username) <= 120)
);

create index audit_log_at_idx on audit_log(at desc);

-- Down Migration
-- Теряет весь журнал; на проде откат схемы — только из бэкапа.
drop table audit_log;
