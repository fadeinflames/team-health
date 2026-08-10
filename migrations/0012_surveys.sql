-- Опросы и ответы на них.
--
-- respondent_hash — способ дедуплицировать анонимные ответы, не зная автора:
-- sha256(surveyId:userId:SURVEY_RESPONSE_SECRET). Частичные уникальные
-- индексы разводят два режима: именованный ответ уникален по person_id,
-- анонимный — по хешу.

-- Up Migration
create table surveys (
  id                      text primary key,
  title                   text not null,
  description             text not null default '',
  anonymous               boolean not null default false,
  status                  text not null check (status in ('active', 'closed')),
  questions_json          jsonb not null,
  is_demo_seed            boolean not null default false,
  is_template             boolean not null default false,
  owner_user_id           text references users(id) on delete set null,
  anonymous_min_responses integer not null default 3,
  created_at              timestamptz not null default now()
);

create table survey_responses (
  id              text primary key,
  survey_id       text not null references surveys(id) on delete cascade,
  person_id       text references people(id) on delete set null,
  respondent_hash text,
  answers_json    jsonb not null,
  submitted_at    timestamptz not null default now()
);

create index survey_responses_survey_id_idx on survey_responses(survey_id);
create index survey_responses_person_id_idx on survey_responses(person_id);
create unique index survey_responses_unique_per_person
  on survey_responses(survey_id, person_id)
  where person_id is not null;
create unique index survey_responses_unique_per_hash
  on survey_responses(survey_id, respondent_hash)
  where respondent_hash is not null;

-- Down Migration
drop table survey_responses;
drop table surveys;
