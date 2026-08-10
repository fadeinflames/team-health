-- Дежурная нагрузка по неделям: сигнал выгорания рядом с пульсом.

-- Up Migration
create table oncall_load (
  person_id              text not null references people(id) on delete cascade,
  week_start             date not null,
  pages_total            integer not null default 0,
  after_hours_pages      integer not null default 0,
  incidents_led          integer not null default 0,
  sleep_disrupted_nights integer not null default 0,
  primary key (person_id, week_start)
);

create index oncall_load_week_idx on oncall_load(week_start desc);

-- Down Migration
drop table oncall_load;
