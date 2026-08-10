-- Учётные записи.
--
-- users_role_check здесь сразу в том виде, к которому приводил do $$ блок из
-- rc0.1: четыре значения, включая легаси 'admin'. Легаси убирается отдельной
-- миграцией 0017 — baseline обязан повторить существующие базы как есть.
--
-- lead_user_id — ссылка на руководителя. У platform_admin она null, сотрудники
-- и лиды указывают наверх. team_label — отображаемое имя команды лида.

-- Up Migration
create table users (
  id            text primary key,
  username      text not null,
  name          text not null,
  role          text not null check (role in ('admin', 'platform_admin', 'lead', 'employee')),
  person_id     text references people(id) on delete restrict,
  salt          text not null,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  lead_user_id  text references users(id) on delete set null,
  team_label    text not null default ''
);

create unique index users_username_lower_idx on users (lower(username));
create index users_lead_user_id_idx on users(lead_user_id);

-- Down Migration
drop table users;
