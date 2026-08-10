-- Версионирование секрета анонимности опросов.
--
-- respondent_hash = sha256(surveyId:userId:SURVEY_RESPONSE_SECRET). Пока
-- версии нет, смена секрета ломает дедупликацию молча: тот же человек
-- получает новый хеш и может ответить второй раз, а старые ответы
-- перестают с чем-либо сопоставляться.
--
-- С версией смена секрета становится наблюдаемой: старые ответы остаются в
-- своём поколении, новые пишутся в новом, повторная отправка внутри
-- поколения по-прежнему обновляет предыдущий ответ. Текущая версия лежит в
-- app_meta['survey_secret_version'].

-- Up Migration
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table survey_responses add column secret_version integer not null default 1;

drop index survey_responses_unique_per_hash;
create unique index survey_responses_unique_per_hash
  on survey_responses(survey_id, respondent_hash, secret_version)
  where respondent_hash is not null;

-- Down Migration
drop index survey_responses_unique_per_hash;
create unique index survey_responses_unique_per_hash
  on survey_responses(survey_id, respondent_hash)
  where respondent_hash is not null;

alter table survey_responses drop column secret_version;
