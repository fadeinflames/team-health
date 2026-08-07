// Описание таблиц для sync.js: какие колонки, какого типа и откуда берётся
// значение. Одно место, где формат строки в базе встречается с форматом
// объекта в приложении.
//
// created_at везде в immutable. Раньше он не переживал обновление, потому что
// строка удалялась и вставлялась заново — карточка, созданная неделю назад,
// после переименования пользователя оказывалась созданной только что.

const iso = (value) => value || null;

export const peopleTable = {
  table: "people",
  key: "id",
  columns: [
    { name: "id", type: "text", value: (p) => p.id },
    { name: "name", type: "text", value: (p) => p.name },
    { name: "meeting_name", type: "text", value: (p) => p.meetingName },
    { name: "role", type: "text", value: (p) => p.role },
    { name: "team", type: "text", value: (p) => p.team },
    { name: "initials", type: "text", value: (p) => p.initials },
    { name: "next_meeting", type: "text", value: (p) => p.nextMeeting },
    // Expand-колонка из миграции 0023: пишем обе, читаем пока старую.
    { name: "next_meeting_at", type: "timestamptz", value: (p) => iso(p.nextMeetingAt) },
    { name: "cadence", type: "text", value: (p) => p.cadence },
    { name: "manager_focus", type: "text", value: (p) => p.managerFocus },
    { name: "last_summary", type: "text", value: (p) => p.lastSummary },
    { name: "trend", type: "text", value: (p) => p.trend },
    { name: "meeting_type", type: "text", value: (p) => p.meetingType || "regular" },
    { name: "mentorship_mode", type: "text", value: (p) => p.mentorshipMode || "coach" },
    { name: "growth_narrative", type: "text", value: (p) => p.growthNarrative || "" },
    { name: "performance_narrative", type: "text", value: (p) => p.performanceNarrative || "" },
    { name: "archived_at", type: "timestamptz", value: (p) => iso(p.archivedAt) }
  ]
};

export const lprsTable = {
  table: "lprs",
  key: "id",
  immutable: ["created_at"],
  columns: [
    { name: "id", type: "text", value: (l) => l.id },
    { name: "person_id", type: "text", value: (l) => l.personId },
    { name: "title", type: "text", value: (l) => l.title },
    { name: "focus", type: "text", value: (l) => l.focus },
    { name: "status", type: "text", value: (l) => l.status },
    { name: "created_at", type: "timestamptz", value: (l) => iso(l.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};

export const cardsTable = {
  table: "cards",
  key: "id",
  immutable: ["created_at"],
  columns: [
    { name: "id", type: "text", value: (c) => c.id },
    { name: "person_id", type: "text", value: (c) => c.personId },
    { name: "lpr_id", type: "text", value: (c) => c.lprId || null },
    { name: "source", type: "text", value: (c) => c.source },
    { name: "category", type: "text", value: (c) => c.category },
    { name: "priority", type: "text", value: (c) => c.priority },
    { name: "status", type: "text", value: (c) => c.status },
    { name: "title", type: "text", value: (c) => c.title },
    { name: "body", type: "text", value: (c) => c.body },
    { name: "created_at", type: "timestamptz", value: (c) => iso(c.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};

export const actionsTable = {
  table: "actions",
  key: "id",
  immutable: ["created_at"],
  columns: [
    { name: "id", type: "text", value: (a) => a.id },
    { name: "person_id", type: "text", value: (a) => a.personId },
    { name: "owner", type: "text", value: (a) => a.owner },
    { name: "title", type: "text", value: (a) => a.title },
    { name: "due", type: "text", value: (a) => a.due },
    // Expand-колонка из миграции 0022: due переименовывается в due_label,
    // пока пишем обе.
    { name: "due_label", type: "text", value: (a) => a.due },
    { name: "due_date", type: "date", value: (a) => a.dueDate || null },
    { name: "done", type: "bool", value: (a) => a.done },
    { name: "created_at", type: "timestamptz", value: (a) => iso(a.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};

export const goalsTable = {
  table: "goals",
  key: "id",
  immutable: ["created_at"],
  columns: [
    { name: "id", type: "text", value: (g) => g.id },
    { name: "person_id", type: "text", value: (g) => g.personId },
    { name: "lpr_id", type: "text", value: (g) => g.lprId || null },
    { name: "title", type: "text", value: (g) => g.title },
    { name: "description", type: "text", value: (g) => g.description },
    { name: "horizon", type: "text", value: (g) => g.horizon },
    { name: "progress", type: "int", value: (g) => g.progress },
    { name: "status", type: "text", value: (g) => g.status },
    { name: "due_date", type: "text", value: (g) => g.dueDate || "" },
    // Expand-колонка из миграции 0021: due_date как text уезжает, due_at
    // типа date остаётся.
    { name: "due_at", type: "date", value: (g) => g.dueDate || null },
    { name: "created_at", type: "timestamptz", value: (g) => iso(g.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};

export const competencyAssessmentsTable = {
  table: "competency_assessments",
  key: "id",
  immutable: ["created_at"],
  columns: [
    { name: "id", type: "text", value: (a) => a.id },
    { name: "person_id", type: "text", value: (a) => a.personId },
    { name: "title", type: "text", value: (a) => a.title },
    { name: "role_context", type: "text", value: (a) => a.roleContext },
    { name: "source", type: "text", value: (a) => a.source },
    { name: "status", type: "text", value: (a) => a.status },
    { name: "scale_max", type: "int", value: (a) => a.scaleMax },
    { name: "average_score", type: "numeric", value: (a) => a.averageScore },
    { name: "min_score", type: "numeric", value: (a) => a.minScore },
    { name: "grade", type: "text", value: (a) => a.grade },
    { name: "competencies_json", type: "jsonb", value: (a) => JSON.stringify(a.competencies) },
    { name: "cases_json", type: "jsonb", value: (a) => JSON.stringify(a.cases) },
    { name: "recommendations_json", type: "jsonb", value: (a) => JSON.stringify(a.recommendations) },
    { name: "validated_at", type: "timestamptz", value: (a) => iso(a.validatedAt) },
    { name: "created_at", type: "timestamptz", value: (a) => iso(a.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};

export const prepTable = {
  table: "prep",
  key: "person_id",
  columns: [
    { name: "person_id", type: "text", value: (p) => p.personId },
    { name: "employee_agenda", type: "bool", value: (p) => p.employeeAgenda },
    { name: "manager_agenda", type: "bool", value: (p) => p.managerAgenda },
    { name: "pulse", type: "bool", value: (p) => p.pulse },
    { name: "last_actions", type: "bool", value: (p) => p.lastActions },
    { name: "growth", type: "bool", value: (p) => p.growth },
    { name: "commitments", type: "bool", value: (p) => p.commitments }
  ]
};

export const pulseTable = {
  table: "pulse",
  key: "person_id",
  columns: [
    { name: "person_id", type: "text", value: (p) => p.personId },
    { name: "energy", type: "int", value: (p) => p.energy },
    { name: "load", type: "int", value: (p) => p.load },
    { name: "clarity", type: "int", value: (p) => p.clarity },
    { name: "trust", type: "int", value: (p) => p.trust }
  ]
};

export const notesTable = {
  table: "notes",
  key: "person_id",
  columns: [
    { name: "person_id", type: "text", value: (n) => n.personId },
    { name: "body", type: "text", value: (n) => n.body }
  ]
};

export const meetingDraftsTable = {
  table: "meeting_drafts",
  key: "person_id",
  columns: [
    { name: "person_id", type: "text", value: (d) => d.personId },
    { name: "body", type: "text", value: (d) => d.body }
  ]
};

export const pulseHistoryTable = {
  table: "pulse_history",
  key: ["person_id", "captured_at"],
  columns: [
    { name: "person_id", type: "text", value: (e) => e.personId },
    { name: "captured_at", type: "date", value: (e) => e.capturedAt },
    { name: "energy", type: "int", value: (e) => e.energy },
    { name: "load", type: "int", value: (e) => e.load },
    { name: "clarity", type: "int", value: (e) => e.clarity },
    { name: "trust", type: "int", value: (e) => e.trust }
  ]
};

export const oncallLoadTable = {
  table: "oncall_load",
  key: ["person_id", "week_start"],
  columns: [
    { name: "person_id", type: "text", value: (e) => e.personId },
    { name: "week_start", type: "date", value: (e) => e.weekStart },
    { name: "pages_total", type: "int", value: (e) => e.pagesTotal },
    { name: "after_hours_pages", type: "int", value: (e) => e.afterHoursPages },
    { name: "incidents_led", type: "int", value: (e) => e.incidentsLed },
    { name: "sleep_disrupted_nights", type: "int", value: (e) => e.sleepDisruptedNights }
  ]
};

export const surveysTable = {
  table: "surveys",
  key: "id",
  immutable: ["created_at"],
  columns: [
    { name: "id", type: "text", value: (s) => s.id },
    { name: "title", type: "text", value: (s) => s.title },
    { name: "description", type: "text", value: (s) => s.description },
    { name: "anonymous", type: "bool", value: (s) => s.anonymous },
    { name: "status", type: "text", value: (s) => s.status },
    { name: "questions_json", type: "jsonb", value: (s) => JSON.stringify(s.questions || []) },
    { name: "is_demo_seed", type: "bool", value: (s) => s.isDemoSeed === true },
    { name: "is_template", type: "bool", value: (s) => s.isTemplate === true },
    { name: "owner_user_id", type: "text", value: (s) => s.ownerUserId || null },
    { name: "anonymous_min_responses", type: "int", value: (s) => s.anonymousMinResponses || 3 },
    { name: "created_at", type: "timestamptz", value: (s) => iso(s.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};

export function surveyResponsesTable(currentSecretVersion) {
  return {
    table: "survey_responses",
    key: "id",
    immutable: ["submitted_at"],
    columns: [
      { name: "id", type: "text", value: (r) => r.id },
      { name: "survey_id", type: "text", value: (r) => r.surveyId },
      { name: "person_id", type: "text", value: (r) => r.personId || null },
      { name: "respondent_hash", type: "text", value: (r) => r.respondentHash || null },
      { name: "secret_version", type: "int", value: (r) => r.secretVersion || currentSecretVersion },
      { name: "answers_json", type: "jsonb", value: (r) => JSON.stringify(r.answers || {}) },
      {
        name: "submitted_at",
        type: "timestamptz",
        value: (r) => iso(r.submittedAt),
        expr: "coalesce(src.submitted_at, now())"
      }
    ]
  };
}

export const managerNotesTable = {
  table: "manager_notes",
  key: "id",
  immutable: ["created_at"],
  columns: [
    { name: "id", type: "text", value: (n) => n.id },
    { name: "person_id", type: "text", value: (n) => n.personId },
    { name: "body", type: "text", value: (n) => n.body },
    {
      name: "tags",
      type: "jsonb",
      value: (n) => JSON.stringify(n.tags || []),
      // unnest не умеет разворачивать массив массивов, поэтому теги едут
      // как jsonb и превращаются в text[] уже в проекции.
      expr: "array(select jsonb_array_elements_text(src.tags))"
    },
    { name: "created_at", type: "timestamptz", value: (n) => iso(n.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};

export const meetingLogTable = {
  table: "meeting_log",
  key: "id",
  columns: [
    { name: "id", type: "text", value: (e) => e.id },
    { name: "person_id", type: "text", value: (e) => e.personId },
    { name: "held_at", type: "timestamptz", value: (e) => e.heldAt },
    { name: "meeting_type", type: "text", value: (e) => e.meetingType },
    { name: "summary", type: "text", value: (e) => e.summary },
    { name: "attended", type: "bool", value: (e) => e.attended }
  ]
};

export const usersTable = {
  table: "users",
  key: "id",
  // lead_user_id проставляется вторым проходом: ссылка на другого
  // пользователя может указывать на строку, которой в базе ещё нет.
  immutable: ["created_at", "lead_user_id"],
  columns: [
    { name: "id", type: "text", value: (u) => u.id },
    { name: "username", type: "text", value: (u) => u.username },
    { name: "name", type: "text", value: (u) => u.name },
    { name: "role", type: "text", value: (u) => u.role },
    { name: "person_id", type: "text", value: (u) => u.personId || null },
    { name: "lead_user_id", type: "text", value: () => null },
    { name: "team_label", type: "text", value: (u) => u.teamLabel || "" },
    { name: "salt", type: "text", value: (u) => u.salt },
    { name: "password_hash", type: "text", value: (u) => u.passwordHash },
    { name: "created_at", type: "timestamptz", value: (u) => iso(u.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};

export const sessionsTable = {
  table: "sessions",
  key: "id",
  immutable: ["created_at"],
  columns: [
    { name: "id", type: "text", value: (s) => s.id },
    { name: "user_id", type: "text", value: (s) => s.userId },
    { name: "expires_at", type: "timestamptz", value: (s) => s.expiresAt },
    { name: "created_at", type: "timestamptz", value: (s) => iso(s.createdAt), expr: "coalesce(src.created_at, now())" }
  ]
};
