import { useRef } from "react";
import { Check, CircleAlert } from "lucide-react";
import { Button, Field, Select, Sheet, TextArea, TextInput } from "../../ui";
import { meetingTypeLabel, mentorshipModeHint, mentorshipModeLabel } from "../../lib/shared.jsx";
import "../../styles/screen-team.css";

// Правка профиля участника в боковой шторке (на телефоне шторка снизу).
//
// Props:
//   person       редактируемый участник или null (шторка закрыта)
//   draft        черновик полей (personEditDraft из App)
//   setDraft     setState черновика
//   error        текст ошибки или пусто
//   onSave(id)   сохранить (savePersonEdit)
//   onCancel()   закрыть без сохранения
export default function EditPersonSheet({ person, draft, setDraft, error, onSave, onCancel }) {
  // Шторка уезжает с анимацией: имя нужно ещё на время закрытия, когда person уже null.
  const lastPerson = useRef(person);
  if (person) lastPerson.current = person;
  const shown = person || lastPerson.current;
  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const formId = "team-edit-person-form";

  return (
    <Sheet
      side="right"
      open={Boolean(person)}
      onClose={onCancel}
      title="Изменить участника"
      description={shown ? `${shown.name} · ${shown.role}` : undefined}
      footer={
        <>
          <Button variant="neutral" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" form={formId} icon={Check}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="team-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (person) onSave(person.id);
        }}
      >
        <div className="team-form__grid">
          <Field label="Имя">{(field) => <TextInput {...field} value={draft.name} onChange={set("name")} autoComplete="off" />}</Field>
          <Field label="Роль">{(field) => <TextInput {...field} value={draft.role} onChange={set("role")} />}</Field>
        </div>
        <div className="team-form__grid">
          <Field label="Команда">{(field) => <TextInput {...field} value={draft.team} onChange={set("team")} />}</Field>
          <Field label="Периодичность 1:1">
            {(field) => <TextInput {...field} value={draft.cadence} onChange={set("cadence")} placeholder="каждую неделю" />}
          </Field>
        </div>
        <Field label="Ближайший 1:1">
          {(field) => <TextInput {...field} value={draft.nextMeeting} onChange={set("nextMeeting")} placeholder="10 мая, 14:00" />}
        </Field>
        <Field label="Фокус лида">{(field) => <TextArea {...field} rows={2} value={draft.managerFocus} onChange={set("managerFocus")} />}</Field>
        <div className="team-form__grid">
          <Field label="Тип встречи">
            {(field) => (
              <Select {...field} value={draft.meetingType} onChange={set("meetingType")}>
                {Object.entries(meetingTypeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Режим лида" hint={mentorshipModeHint[draft.mentorshipMode]}>
            {(field) => (
              <Select {...field} value={draft.mentorshipMode} onChange={set("mentorshipMode")}>
                {Object.entries(mentorshipModeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="История роста" hint="Долгая история: цели на год, сложные проекты, возможности продвижения">
          {(field) => <TextArea {...field} rows={3} value={draft.growthNarrative} onChange={set("growthNarrative")} />}
        </Field>
        <Field label="Журнал результатов" hint="Факты для будущего ревью: что получилось, что нет, обратная связь">
          {(field) => <TextArea {...field} rows={3} value={draft.performanceNarrative} onChange={set("performanceNarrative")} />}
        </Field>
        {error && (
          <p className="team-form__error" role="alert">
            <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </form>
    </Sheet>
  );
}
