-- Ограничения длины текстовых полей.
--
-- Приложение уже режет эти поля через .slice(), но инвариант, который живёт
-- только в JS, не инвариант: любая запись мимо приложения (импорт, CLI,
-- будущий второй сервис) кладёт в базу что угодно.
--
-- Отступление от плана: там был `varchar(N)`, здесь check-констрейнты.
-- Причина операционная. `alter column type varchar(N)` — сужающее
-- преобразование, оно переписывает таблицу целиком под ACCESS EXCLUSIVE.
-- check даёт ровно тот же инвариант и добавляется без переписывания.
--
-- Констрейнты добавляются как NOT VALID: они действуют на всё, что пишется
-- с этого момента, но не проверяют существующие строки. Так миграция не
-- может упасть на чужих данных. Валидация — отдельным файлом, после того
-- как на конкретной базе проверено, что нарушителей нет:
--
--   select 'cards.title' as f, count(*) from cards where length(title) > 160
--   union all select 'cards.body', count(*) from cards where length(body) > 1000
--   union all select 'actions.title', count(*) from actions where length(title) > 180
--   union all select 'actions.due', count(*) from actions where length(due) > 80
--   union all select 'goals.title', count(*) from goals where length(title) > 200
--   union all select 'goals.description', count(*) from goals where length(description) > 1500
--   union all select 'goals.horizon', count(*) from goals where length(horizon) > 32
--   union all select 'lprs.title', count(*) from lprs where length(title) > 200
--   union all select 'lprs.focus', count(*) from lprs where length(focus) > 2000
--   union all select 'users.name', count(*) from users where length(name) > 120
--   union all select 'users.team_label', count(*) from users where length(team_label) > 120
--   union all select 'people.growth_narrative', count(*) from people where length(growth_narrative) > 8000
--   union all select 'people.performance_narrative', count(*) from people where length(performance_narrative) > 8000
--   union all select 'manager_notes.body', count(*) from manager_notes where length(body) > 4000
--   union all select 'meeting_log.summary', count(*) from meeting_log where length(summary) > 4000
--   union all select 'meeting_drafts.body', count(*) from meeting_drafts where length(body) > 12000;

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table cards add constraint cards_title_length check (length(title) <= 160) not valid;
alter table cards add constraint cards_body_length check (length(body) <= 1000) not valid;

alter table actions add constraint actions_title_length check (length(title) <= 180) not valid;
alter table actions add constraint actions_due_length check (length(due) <= 80) not valid;
alter table actions add constraint actions_due_label_length check (length(due_label) <= 80) not valid;

alter table goals add constraint goals_title_length check (length(title) <= 200) not valid;
alter table goals add constraint goals_description_length check (length(description) <= 1500) not valid;
alter table goals add constraint goals_horizon_length check (length(horizon) <= 32) not valid;

alter table lprs add constraint lprs_title_length check (length(title) <= 200) not valid;
alter table lprs add constraint lprs_focus_length check (length(focus) <= 2000) not valid;

alter table users add constraint users_name_length check (length(name) <= 120) not valid;
alter table users add constraint users_team_label_length check (length(team_label) <= 120) not valid;

alter table people add constraint people_growth_narrative_length check (length(growth_narrative) <= 8000) not valid;
alter table people add constraint people_performance_narrative_length check (length(performance_narrative) <= 8000) not valid;

alter table manager_notes add constraint manager_notes_body_length check (length(body) <= 4000) not valid;
alter table meeting_log add constraint meeting_log_summary_length check (length(summary) <= 4000) not valid;
alter table meeting_drafts add constraint meeting_drafts_body_length check (length(body) <= 12000) not valid;

-- Down Migration
alter table meeting_drafts drop constraint meeting_drafts_body_length;
alter table meeting_log drop constraint meeting_log_summary_length;
alter table manager_notes drop constraint manager_notes_body_length;
alter table people drop constraint people_performance_narrative_length;
alter table people drop constraint people_growth_narrative_length;
alter table users drop constraint users_team_label_length;
alter table users drop constraint users_name_length;
alter table lprs drop constraint lprs_focus_length;
alter table lprs drop constraint lprs_title_length;
alter table goals drop constraint goals_horizon_length;
alter table goals drop constraint goals_description_length;
alter table goals drop constraint goals_title_length;
alter table actions drop constraint actions_due_label_length;
alter table actions drop constraint actions_due_length;
alter table actions drop constraint actions_title_length;
alter table cards drop constraint cards_body_length;
alter table cards drop constraint cards_title_length;
