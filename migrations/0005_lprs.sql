-- Личные планы развития. На них ссылаются cards и goals, поэтому идут раньше.

-- Up Migration
create table lprs (
  id         text primary key,
  person_id  text not null references people(id) on delete cascade,
  title      text not null,
  focus      text not null default '',
  status     text not null check (status in ('active', 'paused', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lprs_person_id_idx on lprs(person_id);
create index lprs_status_idx on lprs(status);

-- Down Migration
drop table lprs;
