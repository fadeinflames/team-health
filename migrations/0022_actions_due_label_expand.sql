-- actions.due — это не дата, а подпись («к следующему 1:1», «до пятницы»).
-- Рядом уже лежит due_date типа date, и одинаковые имена постоянно путают:
-- в одном месте фильтруют по due_date, в другом показывают due.
--
-- Expand-шаг: появляется due_label с тем же содержимым. Код начинает писать
-- в обе колонки и читать новую. Удаление due — отдельной миграцией в
-- следующем релизе.

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table actions add column due_label text not null default '';

update actions set due_label = due;

-- Down Migration
alter table actions drop column due_label;
