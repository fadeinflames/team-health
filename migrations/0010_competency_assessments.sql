-- Оценки компетенций. Сами компетенции, кейсы и рекомендации лежат в jsonb:
-- структура задаётся приложением и меняется чаще, чем схема.

-- Up Migration
create table competency_assessments (
  id                   text primary key,
  person_id            text not null references people(id) on delete cascade,
  title                text not null,
  role_context         text not null default '',
  source               text not null check (source in ('case-ai', 'manual', 'review')),
  status               text not null check (status in ('draft', 'validated')),
  scale_max            integer not null default 5,
  average_score        numeric(3,1) not null default 0,
  min_score            numeric(3,1) not null default 0,
  grade                text not null check (grade in ('junior', 'middle', 'senior', 'lead-ready')),
  competencies_json    jsonb not null default '[]'::jsonb,
  cases_json           jsonb not null default '[]'::jsonb,
  recommendations_json jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  validated_at         timestamptz
);

create index competency_assessments_person_idx on competency_assessments(person_id);
create index competency_assessments_created_idx on competency_assessments(created_at desc);

-- Down Migration
drop table competency_assessments;
