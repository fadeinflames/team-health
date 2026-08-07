-- Договорённости по итогам встречи.
--
-- due хранит отображаемую строку («до пятницы»), due_date — разобранную дату.
-- Дублирование разводится в Этапе 6: due переименовывается в due_label.

-- Up Migration
create table actions (
  id         text primary key,
  person_id  text not null references people(id) on delete cascade,
  owner      text not null check (owner in ('manager', 'employee')),
  title      text not null,
  due        text not null,
  due_date   date,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index actions_person_id_idx on actions(person_id);
create index actions_done_idx on actions(done);
create index actions_due_date_idx on actions(due_date) where done = false;

-- Down Migration
drop table actions;
