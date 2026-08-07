-- Переносим в базу списки, которые до сих пор жили только в JS
-- (meetingTypes и mentorshipModes в server.js).
--
-- Перед раскаткой на живую базу обязательно проверить, что за её пределами
-- ничего не лежит:
--
--   select distinct meeting_type from people;
--   select distinct mentorship_mode from people;
--
-- Значение вне списка уронит validate. Лучше узнать это заранее, чем в
-- середине выката.

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table people add constraint people_meeting_type_check
  check (meeting_type in ('regular', 'career', 'performance', 'post-incident', 'first-1on1', 'skip-level')) not valid;
alter table people validate constraint people_meeting_type_check;

alter table people add constraint people_mentorship_mode_check
  check (mentorship_mode in ('mentor', 'coach', 'sponsor')) not valid;
alter table people validate constraint people_mentorship_mode_check;

-- Down Migration
alter table people drop constraint people_mentorship_mode_check;
alter table people drop constraint people_meeting_type_check;
