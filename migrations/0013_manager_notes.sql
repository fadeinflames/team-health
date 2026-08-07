-- Приватные заметки руководителя о человеке.

-- Up Migration
create table manager_notes (
  id         text primary key,
  person_id  text not null references people(id) on delete cascade,
  body       text not null,
  tags       text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index manager_notes_person_id_idx on manager_notes(person_id);
create index manager_notes_created_at_idx on manager_notes(created_at desc);

-- Down Migration
drop table manager_notes;
