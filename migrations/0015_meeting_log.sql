-- Журнал проведённых встреч: из него считается регулярность 1:1.

-- Up Migration
create table meeting_log (
  id           text primary key,
  person_id    text not null references people(id) on delete cascade,
  held_at      timestamptz not null,
  meeting_type text not null default 'regular',
  summary      text not null default '',
  attended     boolean not null default true
);

create index meeting_log_person_held_idx on meeting_log(person_id, held_at desc);

-- Down Migration
drop table meeting_log;
