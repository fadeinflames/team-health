-- goals.due_date хранит дату строкой. Expand-шаг: рядом появляется
-- due_at типа date, заполненный из существующих значений.
--
-- sanitizeGoal уже пропускает через себя только пустую строку или ISO-дату
-- (isValidISODate), поэтому проверка формата в backfill — страховка от
-- строк, попавших в базу до появления этой проверки, а не основной путь.
--
-- Contract (удаление due_date) делается отдельной миграцией в следующем
-- релизе, когда ни одна работающая реплика её больше не читает. Между
-- «код перестал читать колонку» и «колонку удалили» должен пройти хотя бы
-- один цикл бэкапа: это и есть встроенное окно отката.

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table goals add column due_at date;

update goals
set due_at = due_date::date
where due_date ~ '^\d{4}-\d{2}-\d{2}$';

-- Down Migration
alter table goals drop column due_at;
