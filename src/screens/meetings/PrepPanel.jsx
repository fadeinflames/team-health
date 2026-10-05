import { CalendarDays, ChevronRight, ClipboardList, History, LockKeyhole, Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  IconButton,
  ListRow,
  ProgressBar,
  TextArea
} from "../../ui";
import { checklist, formatRuDate, managerNoteTagLabel, managerNoteTagOrder, meetingTypeLabel } from "../../lib/shared.jsx";

const ownerNote = (item, isAdmin) =>
  item.owner === "employee"
    ? "Зона участника"
    : item.owner === "manager"
      ? isAdmin
        ? "Зона лида"
        : "Зона лида · только для чтения"
      : "Общая зона";

// Правая колонка (на узком экране шторка): чек-лист подготовки, приватные заметки лида
// и контекст прошлых встреч. Никакого собственного состояния, кроме разворота записи
// встречи, которое приходит из App (expandedMeetingId).
export default function PrepPanel({
  isAdmin,
  workspace,
  selectedPerson,
  readiness,
  personPrep,
  togglePrep,
  updateNotes,
  newManagerNote,
  setNewManagerNote,
  toggleNewNoteTag,
  addManagerNote,
  unresolvedActions,
  expandedMeetingId,
  setExpandedMeetingId,
  askDelete,
  variant = "column"
}) {
  const notes = (workspace.managerNotes || []).filter((note) => note.personId === selectedPerson.id);
  const meetings = (workspace.meetingLog || []).filter((m) => m.personId === selectedPerson.id).slice(0, 10);

  return (
    <div className={`meet-prep meet-prep--${variant}`}>
      <Card as="section" className="meet-prep__card" aria-label="Чек-лист подготовки к встрече">
        <CardHeader
          headingAs="h2"
          title="Чек-лист подготовки"
          subtitle="За 24 часа до встречи"
          action={
            <Badge tone={readiness >= 85 ? "success" : readiness >= 50 ? "warning" : "neutral"} className="num">
              {readiness}%
            </Badge>
          }
        />
        <ProgressBar value={readiness} size="sm" tone={readiness >= 85 ? "success" : "accent"} aria-label="Готовность к 1:1" />
        <div className="meet-checklist">
          {checklist.map((item) => (
            <Checkbox
              key={item.id}
              className="meet-checklist__item"
              label={item.label}
              description={ownerNote(item, isAdmin)}
              checked={Boolean(personPrep[item.id])}
              disabled={!isAdmin && item.owner === "manager"}
              onChange={() => togglePrep(item.id)}
            />
          ))}
        </div>
      </Card>

      {isAdmin ? (
        <Card as="section" className="meet-prep__card" aria-label="Заметки лида">
          <CardHeader
            headingAs="h2"
            icon={LockKeyhole}
            iconTone="neutral"
            title="Заметки лида"
            subtitle="Не видно участнику. Для подготовки и разбора."
          />
          <TextArea
            aria-label="Приватные заметки о встрече"
            value={workspace.notes[selectedPerson.id] || ""}
            onChange={(event) => updateNotes(event.target.value)}
            placeholder="Наблюдения, которые не идут в общую повестку."
            rows={5}
          />

          <div className="meet-notes">
            <p className="meet-caption">Журнал заметок</p>
            <TextArea
              aria-label="Новая заметка"
              placeholder="Новая заметка с тегом — сохраняется в журнале"
              value={newManagerNote.body}
              onChange={(event) => setNewManagerNote((current) => ({ ...current, body: event.target.value }))}
              rows={2}
              autoGrow
            />
            <div className="meet-chips" role="group" aria-label="Теги заметки">
              {managerNoteTagOrder.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="meet-chip"
                  aria-pressed={newManagerNote.tags.includes(tag)}
                  onClick={() => toggleNewNoteTag(tag)}
                >
                  #{managerNoteTagLabel[tag]}
                </button>
              ))}
            </div>
            <Button variant="tinted" size="sm" icon={Plus} onClick={addManagerNote} disabled={!newManagerNote.body.trim()}>
              Записать
            </Button>

            {notes.length > 0 ? (
              <ul className="meet-notelist">
                {notes.map((note) => (
                  <li className="meet-note-entry" key={note.id}>
                    <div className="meet-note-entry__head">
                      <time>{formatRuDate(note.createdAt)}</time>
                      <IconButton
                        label="Удалить заметку"
                        icon={Trash2}
                        size="sm"
                        onClick={() =>
                          askDelete({
                            kind: "note",
                            id: note.id,
                            label: `заметки от ${formatRuDate(note.createdAt)}`
                          })
                        }
                      />
                    </div>
                    <p>{note.body}</p>
                    {note.tags.length > 0 ? (
                      <div className="meet-note-entry__tags">
                        {note.tags.map((tag) => (
                          <Badge size="sm" key={tag}>
                            #{managerNoteTagLabel[tag] || tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card as="section" className="meet-prep__card" aria-label="Приватность">
          <CardHeader
            headingAs="h2"
            icon={ShieldCheck}
            iconTone="success"
            title="Доступ только к вашему 1:1"
            subtitle="Приватность"
          />
          <p className="meet-note">В этом аккаунте доступны только ваши темы, пульс, чек-лист и следующие шаги.</p>
        </Card>
      )}

      <Card as="section" className="meet-prep__card" aria-label="Контекст 1:1">
        <CardHeader headingAs="h2" icon={History} iconTone="info" title="Контекст 1:1" subtitle="Что было раньше" />
        <dl className="meet-context">
          <div>
            <dt>Прошлый 1:1</dt>
            <dd>{selectedPerson.lastSummary || "Записей пока нет"}</dd>
          </div>
          <div>
            <dt>Фокус лида</dt>
            <dd>{selectedPerson.managerFocus || "Фокус пока не задан"}</dd>
          </div>
          <div>
            <dt>Открытые действия</dt>
            <dd>{unresolvedActions.length ? unresolvedActions.map((action) => action.title).join("; ") : "нет открытых шагов"}</dd>
          </div>
        </dl>

        {isAdmin ? (
          <div className="meet-history">
            <p className="meet-caption">Записи встреч</p>
            {meetings.length > 0 ? (
              <ul className="meet-history__list">
                {meetings.map((m) => {
                  const expanded = expandedMeetingId === m.id;
                  return (
                    <li key={m.id} className="meet-history__item">
                      <ListRow
                        icon={CalendarDays}
                        iconTone="neutral"
                        title={formatRuDate(m.heldAt)}
                        subtitle={meetingTypeLabel[m.meetingType] || "1:1"}
                        aria-expanded={expanded}
                        onClick={() => setExpandedMeetingId(expanded ? "" : m.id)}
                        trailing={<ChevronRight size={16} aria-hidden="true" className={`meet-history__chev${expanded ? " is-open" : ""}`} />}
                      />
                      {expanded ? (
                        m.summary ? (
                          <pre className="meet-history__summary">{m.summary}</pre>
                        ) : (
                          <p className="meet-history__summary meet-note">Итоги для этой встречи не были сформированы.</p>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                className="meet-history__empty"
                icon={ClipboardList}
                title="Истории встреч пока нет"
                description="Нажмите «Итоги встречи», чтобы записать первую."
              />
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
