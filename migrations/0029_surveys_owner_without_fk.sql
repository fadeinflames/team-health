-- Владелец опроса перестаёт быть внешним ключом.
--
-- Раньше surveys.owner_user_id ссылался на users(id) с on delete set null:
-- когда лида удаляли, база сама обнуляла владельца, и его опросы становились
-- «опросами без владельца», то есть доступными всей организации
-- (surveyAudiencePersonIds). Приватные результаты опроса лида после его ухода
-- открывались всем лидам и участникам. Приложение теперь различает «опрос без
-- владельца» (создан платформенным админом, owner_user_id null) и «опрос
-- удалённого владельца» (id задан, учётки нет): второй виден и управляется
-- только platform_admin. Различие возможно, только пока id остаётся в строке
-- после удаления пользователя, поэтому внешний ключ снимается. Так же устроен
-- audit_log: ссылка по значению, без ограничения.
--
-- Колонка и данные не меняются, переписывания таблицы нет.

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table surveys drop constraint surveys_owner_user_id_fkey;

-- Down Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Без этого возврат ограничения упал бы на опросах удалённых владельцев. Они
-- снова становятся опросами без владельца: это ровно то состояние, которое
-- было до миграции (и именно то, от чего она защищала).
update surveys set owner_user_id = null
  where owner_user_id is not null
    and not exists (select 1 from users u where u.id = surveys.owner_user_id);

alter table surveys
  add constraint surveys_owner_user_id_fkey foreign key (owner_user_id) references users(id) on delete set null;
