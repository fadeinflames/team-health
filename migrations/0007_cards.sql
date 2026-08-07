-- Карточки повестки 1:1.

-- Up Migration
create table cards (
  id         text primary key,
  person_id  text not null references people(id) on delete cascade,
  lpr_id     text references lprs(id) on delete set null,
  source     text not null check (source in ('manager', 'employee')),
  category   text not null check (category in ('checkin', 'blocker', 'growth', 'feedback', 'decision', 'thanks')),
  priority   text not null check (priority in ('high', 'medium', 'low')),
  status     text not null check (status in ('todo', 'discussing', 'done')),
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cards_person_id_idx on cards(person_id);
create index cards_lpr_id_idx on cards(lpr_id);
create index cards_status_idx on cards(status);

-- Down Migration
drop table cards;
