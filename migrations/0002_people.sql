-- Люди — корневая таблица, на неё ссылается почти всё остальное.
--
-- Порядок колонок повторяет то, как схема росла в rc0.1: сначала колонки из
-- исходного create table, затем добавленные через alter add column. Менять
-- порядок нельзя — baseline обязан побайтово совпасть с уже существующими
-- базами, см. migrations/README.md.

-- Up Migration
create table people (
  id                    text primary key,
  name                  text not null,
  meeting_name          text not null,
  role                  text not null,
  team                  text not null,
  initials              text not null,
  next_meeting          text not null,
  cadence               text not null,
  manager_focus         text not null,
  last_summary          text not null,
  trend                 text not null,
  meeting_type          text not null default 'regular',
  mentorship_mode       text not null default 'coach',
  growth_narrative      text not null default '',
  performance_narrative text not null default '',
  archived_at           timestamptz
);

-- Down Migration
drop table people;
