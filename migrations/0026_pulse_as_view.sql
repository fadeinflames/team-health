-- pulse превращается во view поверх pulse_history.
--
-- Две таблицы хранили одно и то же: pulse — текущее значение, pulse_history —
-- те же значения по дням. Синхронизировались они двумя разными путями записи
-- (snapshotPulse в JS и пара upsertMeetingPulse/upsertMeetingPulseHistory),
-- и достаточно было забыть один из них, чтобы «текущий пульс» и «последняя
-- точка графика» разъехались. Проверить такое расхождение невозможно:
-- обе цифры выглядят правдоподобно.
--
-- Текущее значение — это просто последняя точка истории, так что второй
-- таблице тут делать нечего.
--
-- Обратите внимание на ретеншн: удаление старых строк теперь обязано
-- оставлять последнюю точку каждого человека, иначе у того, кто не отмечал
-- пульс дольше срока хранения, текущее значение просто исчезнет. Это
-- сделано в коде (syncWorkspace), а не здесь, но забыть про связь нельзя.

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Страховка на случай, если таблицы всё-таки разошлись: то, чего нет в
-- истории, переносится в неё сегодняшним днём. Конфликт разрешается в
-- пользу истории — сегодняшняя строка в ней могла появиться только из
-- pulse, значит она и есть актуальная.
insert into pulse_history (person_id, captured_at, energy, load, clarity, trust)
select p.person_id, current_date, p.energy, p.load, p.clarity, p.trust
from pulse p
on conflict (person_id, captured_at) do nothing;

drop trigger pulse_set_updated_at on pulse;
drop table pulse;

create view pulse as
  select distinct on (person_id)
    person_id,
    energy,
    load,
    clarity,
    trust,
    captured_at
  from pulse_history
  order by person_id, captured_at desc;

-- Down Migration
drop view pulse;

create table pulse (
  person_id  text primary key references people(id) on delete cascade,
  energy     integer not null check (energy between 1 and 10),
  load       integer not null check (load between 1 and 10),
  clarity    integer not null check (clarity between 1 and 10),
  trust      integer not null check (trust between 1 and 10),
  updated_at timestamptz not null default now()
);

insert into pulse (person_id, energy, load, clarity, trust)
select distinct on (person_id) person_id, energy, load, clarity, trust
from pulse_history
order by person_id, captured_at desc;

create trigger pulse_set_updated_at before update on pulse
  for each row execute function set_updated_at();
