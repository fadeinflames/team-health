-- История пульса по дням. Текущее значение дублируется в таблице pulse —
-- расхождение разводится в Этапе 6, где pulse становится view поверх этой
-- таблицы.

-- Up Migration
create table pulse_history (
  person_id   text not null references people(id) on delete cascade,
  captured_at date not null,
  energy      integer not null check (energy between 1 and 10),
  load        integer not null check (load between 1 and 10),
  clarity     integer not null check (clarity between 1 and 10),
  trust       integer not null check (trust between 1 and 10),
  primary key (person_id, captured_at)
);

create index pulse_history_captured_at_idx on pulse_history(captured_at);

-- Down Migration
drop table pulse_history;
