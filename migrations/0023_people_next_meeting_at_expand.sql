-- people.next_meeting — строка вида «10 мая, 11:30». По ней нельзя ни
-- отсортировать список, ни спросить «у кого встреча на этой неделе»,
-- ни поставить напоминание.
--
-- Expand-шаг: рядом появляется next_meeting_at типа timestamptz. Backfill
-- не делаем сознательно — разобрать «10 мая, 11:30» без года и часового
-- пояса можно только гаданием, а тихо угаданная дата хуже пустой. Колонка
-- заполняется по мере того, как встречи переназначают через интерфейс.
--
-- next_meeting остаётся как отображаемая подпись: она пишется людьми и
-- иногда содержит не дату, а договорённость («после отпуска»).

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table people add column next_meeting_at timestamptz;

create index people_next_meeting_at_idx on people(next_meeting_at)
  where archived_at is null and next_meeting_at is not null;

-- Down Migration
drop index people_next_meeting_at_idx;
alter table people drop column next_meeting_at;
