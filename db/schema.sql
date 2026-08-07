--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actions (
    id text NOT NULL,
    person_id text NOT NULL,
    owner text NOT NULL,
    title text NOT NULL,
    due text NOT NULL,
    due_date date,
    done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    due_label text DEFAULT ''::text NOT NULL,
    CONSTRAINT actions_owner_check CHECK ((owner = ANY (ARRAY['manager'::text, 'employee'::text])))
);

--
-- Name: app_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_meta (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cards (
    id text NOT NULL,
    person_id text NOT NULL,
    lpr_id text,
    source text NOT NULL,
    category text NOT NULL,
    priority text NOT NULL,
    status text NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cards_category_check CHECK ((category = ANY (ARRAY['checkin'::text, 'blocker'::text, 'growth'::text, 'feedback'::text, 'decision'::text, 'thanks'::text]))),
    CONSTRAINT cards_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT cards_source_check CHECK ((source = ANY (ARRAY['manager'::text, 'employee'::text]))),
    CONSTRAINT cards_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'discussing'::text, 'done'::text])))
);

--
-- Name: competency_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_assessments (
    id text NOT NULL,
    person_id text NOT NULL,
    title text NOT NULL,
    role_context text DEFAULT ''::text NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    scale_max integer DEFAULT 5 NOT NULL,
    average_score numeric(3,1) DEFAULT 0 NOT NULL,
    min_score numeric(3,1) DEFAULT 0 NOT NULL,
    grade text NOT NULL,
    competencies_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    cases_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    recommendations_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    validated_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT competency_assessments_grade_check CHECK ((grade = ANY (ARRAY['junior'::text, 'middle'::text, 'senior'::text, 'lead-ready'::text]))),
    CONSTRAINT competency_assessments_source_check CHECK ((source = ANY (ARRAY['case-ai'::text, 'manual'::text, 'review'::text]))),
    CONSTRAINT competency_assessments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'validated'::text])))
);

--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id text NOT NULL,
    person_id text NOT NULL,
    lpr_id text,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    horizon text DEFAULT ''::text NOT NULL,
    progress integer NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    due_date text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    due_at date,
    CONSTRAINT goals_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT goals_status_check CHECK ((status = ANY (ARRAY['active'::text, 'achieved'::text, 'abandoned'::text])))
);

--
-- Name: lprs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lprs (
    id text NOT NULL,
    person_id text NOT NULL,
    title text NOT NULL,
    focus text DEFAULT ''::text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lprs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'done'::text])))
);

--
-- Name: manager_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manager_notes (
    id text NOT NULL,
    person_id text NOT NULL,
    body text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: meeting_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_drafts (
    person_id text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: meeting_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_log (
    id text NOT NULL,
    person_id text NOT NULL,
    held_at timestamp with time zone NOT NULL,
    meeting_type text DEFAULT 'regular'::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    attended boolean DEFAULT true NOT NULL
);

--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    person_id text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: oncall_load; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oncall_load (
    person_id text NOT NULL,
    week_start date NOT NULL,
    pages_total integer DEFAULT 0 NOT NULL,
    after_hours_pages integer DEFAULT 0 NOT NULL,
    incidents_led integer DEFAULT 0 NOT NULL,
    sleep_disrupted_nights integer DEFAULT 0 NOT NULL
);

--
-- Name: people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people (
    id text NOT NULL,
    name text NOT NULL,
    meeting_name text NOT NULL,
    role text NOT NULL,
    team text NOT NULL,
    initials text NOT NULL,
    next_meeting text NOT NULL,
    cadence text NOT NULL,
    manager_focus text NOT NULL,
    last_summary text NOT NULL,
    trend text NOT NULL,
    meeting_type text DEFAULT 'regular'::text NOT NULL,
    mentorship_mode text DEFAULT 'coach'::text NOT NULL,
    growth_narrative text DEFAULT ''::text NOT NULL,
    performance_narrative text DEFAULT ''::text NOT NULL,
    archived_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    next_meeting_at timestamp with time zone,
    team_id uuid,
    CONSTRAINT people_meeting_type_check CHECK ((meeting_type = ANY (ARRAY['regular'::text, 'career'::text, 'performance'::text, 'post-incident'::text, 'first-1on1'::text, 'skip-level'::text]))),
    CONSTRAINT people_mentorship_mode_check CHECK ((mentorship_mode = ANY (ARRAY['mentor'::text, 'coach'::text, 'sponsor'::text])))
);

--
-- Name: pgmigrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pgmigrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: prep; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prep (
    person_id text NOT NULL,
    employee_agenda boolean DEFAULT false NOT NULL,
    manager_agenda boolean DEFAULT false NOT NULL,
    pulse boolean DEFAULT false NOT NULL,
    last_actions boolean DEFAULT false NOT NULL,
    growth boolean DEFAULT false NOT NULL,
    commitments boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pulse; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pulse (
    person_id text NOT NULL,
    energy integer NOT NULL,
    load integer NOT NULL,
    clarity integer NOT NULL,
    trust integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pulse_clarity_check CHECK (((clarity >= 1) AND (clarity <= 10))),
    CONSTRAINT pulse_energy_check CHECK (((energy >= 1) AND (energy <= 10))),
    CONSTRAINT pulse_load_check CHECK (((load >= 1) AND (load <= 10))),
    CONSTRAINT pulse_trust_check CHECK (((trust >= 1) AND (trust <= 10)))
);

--
-- Name: pulse_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pulse_history (
    person_id text NOT NULL,
    captured_at date NOT NULL,
    energy integer NOT NULL,
    load integer NOT NULL,
    clarity integer NOT NULL,
    trust integer NOT NULL,
    CONSTRAINT pulse_history_clarity_check CHECK (((clarity >= 1) AND (clarity <= 10))),
    CONSTRAINT pulse_history_energy_check CHECK (((energy >= 1) AND (energy <= 10))),
    CONSTRAINT pulse_history_load_check CHECK (((load >= 1) AND (load <= 10))),
    CONSTRAINT pulse_history_trust_check CHECK (((trust >= 1) AND (trust <= 10)))
);

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

--
-- Name: survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_responses (
    id text NOT NULL,
    survey_id text NOT NULL,
    person_id text,
    respondent_hash text,
    answers_json jsonb NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    secret_version integer DEFAULT 1 NOT NULL
);

--
-- Name: surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.surveys (
    id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    anonymous boolean DEFAULT false NOT NULL,
    status text NOT NULL,
    questions_json jsonb NOT NULL,
    is_demo_seed boolean DEFAULT false NOT NULL,
    is_template boolean DEFAULT false NOT NULL,
    owner_user_id text,
    anonymous_min_responses integer DEFAULT 3 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT surveys_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])))
);

--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    lead_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    username text NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    person_id text,
    salt text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_user_id text,
    team_label text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    team_id uuid,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['platform_admin'::text, 'lead'::text, 'employee'::text])))
);

--
-- Name: actions actions_due_label_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.actions
    ADD CONSTRAINT actions_due_label_length CHECK ((length(due_label) <= 80)) NOT VALID;

--
-- Name: actions actions_due_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.actions
    ADD CONSTRAINT actions_due_length CHECK ((length(due) <= 80)) NOT VALID;

--
-- Name: actions actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_pkey PRIMARY KEY (id);

--
-- Name: actions actions_title_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.actions
    ADD CONSTRAINT actions_title_length CHECK ((length(title) <= 180)) NOT VALID;

--
-- Name: app_meta app_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_meta
    ADD CONSTRAINT app_meta_pkey PRIMARY KEY (key);

--
-- Name: cards cards_body_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.cards
    ADD CONSTRAINT cards_body_length CHECK ((length(body) <= 1000)) NOT VALID;

--
-- Name: cards cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT cards_pkey PRIMARY KEY (id);

--
-- Name: cards cards_title_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.cards
    ADD CONSTRAINT cards_title_length CHECK ((length(title) <= 160)) NOT VALID;

--
-- Name: competency_assessments competency_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_assessments
    ADD CONSTRAINT competency_assessments_pkey PRIMARY KEY (id);

--
-- Name: goals goals_description_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.goals
    ADD CONSTRAINT goals_description_length CHECK ((length(description) <= 1500)) NOT VALID;

--
-- Name: goals goals_horizon_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.goals
    ADD CONSTRAINT goals_horizon_length CHECK ((length(horizon) <= 32)) NOT VALID;

--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);

--
-- Name: goals goals_title_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.goals
    ADD CONSTRAINT goals_title_length CHECK ((length(title) <= 200)) NOT VALID;

--
-- Name: lprs lprs_focus_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.lprs
    ADD CONSTRAINT lprs_focus_length CHECK ((length(focus) <= 2000)) NOT VALID;

--
-- Name: lprs lprs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lprs
    ADD CONSTRAINT lprs_pkey PRIMARY KEY (id);

--
-- Name: lprs lprs_title_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.lprs
    ADD CONSTRAINT lprs_title_length CHECK ((length(title) <= 200)) NOT VALID;

--
-- Name: manager_notes manager_notes_body_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.manager_notes
    ADD CONSTRAINT manager_notes_body_length CHECK ((length(body) <= 4000)) NOT VALID;

--
-- Name: manager_notes manager_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manager_notes
    ADD CONSTRAINT manager_notes_pkey PRIMARY KEY (id);

--
-- Name: meeting_drafts meeting_drafts_body_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.meeting_drafts
    ADD CONSTRAINT meeting_drafts_body_length CHECK ((length(body) <= 12000)) NOT VALID;

--
-- Name: meeting_drafts meeting_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_drafts
    ADD CONSTRAINT meeting_drafts_pkey PRIMARY KEY (person_id);

--
-- Name: meeting_log meeting_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_log
    ADD CONSTRAINT meeting_log_pkey PRIMARY KEY (id);

--
-- Name: meeting_log meeting_log_summary_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.meeting_log
    ADD CONSTRAINT meeting_log_summary_length CHECK ((length(summary) <= 4000)) NOT VALID;

--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (person_id);

--
-- Name: oncall_load oncall_load_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oncall_load
    ADD CONSTRAINT oncall_load_pkey PRIMARY KEY (person_id, week_start);

--
-- Name: people people_growth_narrative_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.people
    ADD CONSTRAINT people_growth_narrative_length CHECK ((length(growth_narrative) <= 8000)) NOT VALID;

--
-- Name: people people_performance_narrative_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.people
    ADD CONSTRAINT people_performance_narrative_length CHECK ((length(performance_narrative) <= 8000)) NOT VALID;

--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);

--
-- Name: prep prep_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep
    ADD CONSTRAINT prep_pkey PRIMARY KEY (person_id);

--
-- Name: pulse_history pulse_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulse_history
    ADD CONSTRAINT pulse_history_pkey PRIMARY KEY (person_id, captured_at);

--
-- Name: pulse pulse_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulse
    ADD CONSTRAINT pulse_pkey PRIMARY KEY (person_id);

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: survey_responses survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);

--
-- Name: surveys surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_pkey PRIMARY KEY (id);

--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

--
-- Name: users users_name_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.users
    ADD CONSTRAINT users_name_length CHECK ((length(name) <= 120)) NOT VALID;

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: users users_team_label_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.users
    ADD CONSTRAINT users_team_label_length CHECK ((length(team_label) <= 120)) NOT VALID;

--
-- Name: actions_done_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX actions_done_idx ON public.actions USING btree (done);

--
-- Name: actions_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX actions_due_date_idx ON public.actions USING btree (due_date) WHERE (done = false);

--
-- Name: actions_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX actions_person_id_idx ON public.actions USING btree (person_id);

--
-- Name: cards_lpr_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cards_lpr_id_idx ON public.cards USING btree (lpr_id);

--
-- Name: cards_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cards_person_id_idx ON public.cards USING btree (person_id);

--
-- Name: cards_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cards_status_idx ON public.cards USING btree (status);

--
-- Name: competency_assessments_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX competency_assessments_created_idx ON public.competency_assessments USING btree (created_at DESC);

--
-- Name: competency_assessments_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX competency_assessments_person_idx ON public.competency_assessments USING btree (person_id);

--
-- Name: goals_lpr_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_lpr_id_idx ON public.goals USING btree (lpr_id);

--
-- Name: goals_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_person_id_idx ON public.goals USING btree (person_id);

--
-- Name: goals_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_status_idx ON public.goals USING btree (status);

--
-- Name: lprs_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lprs_person_id_idx ON public.lprs USING btree (person_id);

--
-- Name: lprs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lprs_status_idx ON public.lprs USING btree (status);

--
-- Name: manager_notes_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manager_notes_created_at_idx ON public.manager_notes USING btree (created_at DESC);

--
-- Name: manager_notes_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manager_notes_person_id_idx ON public.manager_notes USING btree (person_id);

--
-- Name: meeting_log_person_held_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meeting_log_person_held_idx ON public.meeting_log USING btree (person_id, held_at DESC);

--
-- Name: oncall_load_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oncall_load_week_idx ON public.oncall_load USING btree (week_start DESC);

--
-- Name: people_next_meeting_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_next_meeting_at_idx ON public.people USING btree (next_meeting_at) WHERE ((archived_at IS NULL) AND (next_meeting_at IS NOT NULL));

--
-- Name: people_team_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_team_id_idx ON public.people USING btree (team_id);

--
-- Name: pulse_history_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pulse_history_captured_at_idx ON public.pulse_history USING btree (captured_at);

--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);

--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);

--
-- Name: survey_responses_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_responses_person_id_idx ON public.survey_responses USING btree (person_id);

--
-- Name: survey_responses_survey_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_responses_survey_id_idx ON public.survey_responses USING btree (survey_id);

--
-- Name: survey_responses_unique_per_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX survey_responses_unique_per_hash ON public.survey_responses USING btree (survey_id, respondent_hash, secret_version) WHERE (respondent_hash IS NOT NULL);

--
-- Name: survey_responses_unique_per_person; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX survey_responses_unique_per_person ON public.survey_responses USING btree (survey_id, person_id) WHERE (person_id IS NOT NULL);

--
-- Name: teams_lead_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX teams_lead_user_id_idx ON public.teams USING btree (lead_user_id) WHERE (lead_user_id IS NOT NULL);

--
-- Name: users_lead_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_lead_user_id_idx ON public.users USING btree (lead_user_id);

--
-- Name: users_team_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_team_id_idx ON public.users USING btree (team_id);

--
-- Name: users_username_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_lower_idx ON public.users USING btree (lower(username));

--
-- Name: actions actions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER actions_set_updated_at BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: cards cards_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cards_set_updated_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: competency_assessments competency_assessments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER competency_assessments_set_updated_at BEFORE UPDATE ON public.competency_assessments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: goals goals_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goals_set_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: lprs lprs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lprs_set_updated_at BEFORE UPDATE ON public.lprs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: meeting_drafts meeting_drafts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER meeting_drafts_set_updated_at BEFORE UPDATE ON public.meeting_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: notes notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: people people_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER people_set_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: prep prep_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prep_set_updated_at BEFORE UPDATE ON public.prep FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: pulse pulse_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pulse_set_updated_at BEFORE UPDATE ON public.pulse FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: surveys surveys_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER surveys_set_updated_at BEFORE UPDATE ON public.surveys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: teams teams_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: users users_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: actions actions_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: cards cards_lpr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT cards_lpr_id_fkey FOREIGN KEY (lpr_id) REFERENCES public.lprs(id) ON DELETE SET NULL;

--
-- Name: cards cards_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT cards_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: competency_assessments competency_assessments_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_assessments
    ADD CONSTRAINT competency_assessments_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: goals goals_lpr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_lpr_id_fkey FOREIGN KEY (lpr_id) REFERENCES public.lprs(id) ON DELETE SET NULL;

--
-- Name: goals goals_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: lprs lprs_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lprs
    ADD CONSTRAINT lprs_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: manager_notes manager_notes_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manager_notes
    ADD CONSTRAINT manager_notes_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: meeting_drafts meeting_drafts_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_drafts
    ADD CONSTRAINT meeting_drafts_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: meeting_log meeting_log_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_log
    ADD CONSTRAINT meeting_log_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: notes notes_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: oncall_load oncall_load_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oncall_load
    ADD CONSTRAINT oncall_load_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: people people_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

--
-- Name: prep prep_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep
    ADD CONSTRAINT prep_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: pulse_history pulse_history_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulse_history
    ADD CONSTRAINT pulse_history_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: pulse pulse_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulse
    ADD CONSTRAINT pulse_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: survey_responses survey_responses_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;

--
-- Name: survey_responses survey_responses_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;

--
-- Name: surveys surveys_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: teams teams_lead_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_lead_user_id_fkey FOREIGN KEY (lead_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: users users_lead_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_lead_user_id_fkey FOREIGN KEY (lead_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: users users_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE RESTRICT;

--
-- Name: users users_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

--
-- PostgreSQL database dump complete
--

