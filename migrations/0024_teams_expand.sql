-- Команда как объект.
--
-- Корневая причина того, что скоуп доступа нельзя выразить в SQL: команды
-- не существует. people.team — свободный текст, users.team_label — тоже
-- свободный текст, принадлежность выражена самоссылкой users.lead_user_id,
-- а обход иерархии сделан рекурсией в JS. Отсюда и полное чтение базы на
-- каждый запрос: отфильтровать в SQL нечего.
--
-- Expand-шаг: таблица появляется, обе стороны получают nullable team_id,
-- существующие связи переносятся. Старые поля остаются и продолжают
-- писаться, пока код не переедет целиком.
--
-- Backfill сознательно консервативен: команда заводится только там, где
-- есть лид. Человек без учётной записи team_id не получает — угадывать
-- принадлежность по совпадению строки people.team значит тихо слепить
-- вместе «Платформа» и «платформа».

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  lead_user_id text references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Лид владеет одной командой. Ограничение частичное, потому что команда
-- без лида (лид уволился) — законное состояние.
create unique index teams_lead_user_id_idx on teams(lead_user_id) where lead_user_id is not null;

create trigger teams_set_updated_at before update on teams
  for each row execute function set_updated_at();

alter table users  add column team_id uuid references teams(id) on delete set null;
alter table people add column team_id uuid references teams(id) on delete set null;

create index users_team_id_idx on users(team_id);
create index people_team_id_idx on people(team_id);

-- Команда на каждого, кто кем-то руководит: явных лидов и platform_admin.
-- Имя берём из team_label, а если он пуст — из имени самого лида, чтобы
-- в интерфейсе не появилось безымянных команд.
insert into teams (name, lead_user_id)
select coalesce(nullif(u.team_label, ''), u.name), u.id
from users u
where u.role in ('lead', 'platform_admin');

-- Лид состоит в собственной команде.
update users u set team_id = t.id
from teams t
where t.lead_user_id = u.id;

-- Подчинённые — в команде своего лида.
update users u set team_id = t.id
from teams t
where t.lead_user_id = u.lead_user_id
  and u.team_id is null;

-- Люди наследуют команду через связанную учётную запись.
update people p set team_id = u.team_id
from users u
where u.person_id = p.id
  and u.team_id is not null;

-- Down Migration
alter table people drop column team_id;
alter table users  drop column team_id;
drop table teams;
