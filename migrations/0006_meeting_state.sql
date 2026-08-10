-- Состояние подготовки к встрече: четыре таблицы 1:1 с people.
--
-- Осознанное отступление от правила «один файл — одно изменение». Это единая
-- структура с одинаковым ключом person_id, которая и меняться будет целиком:
-- в Этапе 6 pulse превращается во view поверх pulse_history, и трогать эти
-- четыре таблицы придётся вместе.

-- Up Migration
create table pulse (
  person_id text primary key references people(id) on delete cascade,
  energy    integer not null check (energy between 1 and 10),
  load      integer not null check (load between 1 and 10),
  clarity   integer not null check (clarity between 1 and 10),
  trust     integer not null check (trust between 1 and 10)
);

create table prep (
  person_id       text primary key references people(id) on delete cascade,
  employee_agenda boolean not null default false,
  manager_agenda  boolean not null default false,
  pulse           boolean not null default false,
  last_actions    boolean not null default false,
  growth          boolean not null default false,
  commitments     boolean not null default false
);

create table notes (
  person_id text primary key references people(id) on delete cascade,
  body      text not null default ''
);

create table meeting_drafts (
  person_id  text primary key references people(id) on delete cascade,
  body       text not null default '',
  updated_at timestamptz not null default now()
);

-- Down Migration
drop table meeting_drafts;
drop table notes;
drop table prep;
drop table pulse;
