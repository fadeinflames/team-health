-- updated_at на всех изменяемых таблицах плюс общий триггер.
--
-- Нужно под оптимистичную блокировку: клиент присылает updated_at, который
-- он читал, апдейт идёт с `where id = $1 and updated_at = $2`, ноль
-- затронутых строк означает, что кто-то успел раньше. Без этого потеря
-- обновлений остаётся вопросом времени даже после перехода на точечные
-- запросы: два пользователя, редактирующие одну карточку, всё так же
-- затирают друг друга.
--
-- Триггер, а не ответственность вызывающего кода: обновление, забывшее
-- тронуть updated_at, ломает блокировку молча и в ту сторону, где ошибка
-- не видна.
--
-- add column с default now() — метаданные, а не переписывание таблицы:
-- now() стабильна, и PostgreSQL 11+ вычисляет её один раз на весь alter.

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

alter table people                 add column updated_at timestamptz not null default now();
alter table users                  add column updated_at timestamptz not null default now();
alter table goals                  add column updated_at timestamptz not null default now();
alter table competency_assessments add column updated_at timestamptz not null default now();
alter table surveys                add column updated_at timestamptz not null default now();
alter table notes                  add column updated_at timestamptz not null default now();
alter table prep                   add column updated_at timestamptz not null default now();
alter table pulse                  add column updated_at timestamptz not null default now();

create trigger people_set_updated_at                 before update on people                 for each row execute function set_updated_at();
create trigger users_set_updated_at                  before update on users                  for each row execute function set_updated_at();
create trigger goals_set_updated_at                  before update on goals                  for each row execute function set_updated_at();
create trigger competency_assessments_set_updated_at before update on competency_assessments for each row execute function set_updated_at();
create trigger surveys_set_updated_at                before update on surveys                for each row execute function set_updated_at();
create trigger notes_set_updated_at                  before update on notes                  for each row execute function set_updated_at();
create trigger prep_set_updated_at                   before update on prep                   for each row execute function set_updated_at();
create trigger pulse_set_updated_at                  before update on pulse                  for each row execute function set_updated_at();
create trigger cards_set_updated_at                  before update on cards                  for each row execute function set_updated_at();
create trigger actions_set_updated_at                before update on actions                for each row execute function set_updated_at();
create trigger lprs_set_updated_at                   before update on lprs                   for each row execute function set_updated_at();
create trigger meeting_drafts_set_updated_at         before update on meeting_drafts         for each row execute function set_updated_at();

-- Down Migration
drop trigger meeting_drafts_set_updated_at on meeting_drafts;
drop trigger lprs_set_updated_at on lprs;
drop trigger actions_set_updated_at on actions;
drop trigger cards_set_updated_at on cards;
drop trigger pulse_set_updated_at on pulse;
drop trigger prep_set_updated_at on prep;
drop trigger notes_set_updated_at on notes;
drop trigger surveys_set_updated_at on surveys;
drop trigger competency_assessments_set_updated_at on competency_assessments;
drop trigger goals_set_updated_at on goals;
drop trigger users_set_updated_at on users;
drop trigger people_set_updated_at on people;

alter table pulse                  drop column updated_at;
alter table prep                   drop column updated_at;
alter table notes                  drop column updated_at;
alter table surveys                drop column updated_at;
alter table competency_assessments drop column updated_at;
alter table goals                  drop column updated_at;
alter table users                  drop column updated_at;
alter table people                 drop column updated_at;

drop function set_updated_at();
