-- Цели. due_date здесь text, а не date — так сложилось в rc0.1.
-- Приводится к типу date в Этапе 6 по схеме expand → deploy → contract.

-- Up Migration
create table goals (
  id          text primary key,
  person_id   text not null references people(id) on delete cascade,
  lpr_id      text references lprs(id) on delete set null,
  title       text not null,
  description text not null default '',
  horizon     text not null default '',
  progress    integer not null check (progress between 0 and 100),
  status      text not null check (status in ('active', 'achieved', 'abandoned')),
  created_at  timestamptz not null default now(),
  due_date    text not null default ''
);

create index goals_person_id_idx on goals(person_id);
create index goals_lpr_id_idx on goals(lpr_id);
create index goals_status_idx on goals(status);

-- Down Migration
drop table goals;
