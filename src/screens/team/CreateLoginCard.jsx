import { CircleAlert, UserPlus, X } from "lucide-react";
import { Button, Card, CardHeader, Field, IconButton, Segmented, Select, TextInput } from "../../ui";
import PasswordField from "./PasswordField.jsx";
import "../../styles/screen-team.css";

// Форма «Создать логин». Её показывают три места (главная, команда, админка),
// поэтому App собирает её через renderCreateLoginCard и отдаёт экранам готовым узлом.
//
// Props:
//   id                 id корня (home-/team-/admin-create-login-panel): по нему якорят тесты и прокрутка
//   description        пояснение под заголовком
//   allowLeadCreation  можно ли выбрать тип доступа «Тимлид» (только админ платформы)
//   showCancel         показывать крестик закрытия
//   cardRef            ref корня (App прокручивает к форме при открытии)
//   form               { role, leadUserId, personName, personRole, personTeam, username, password }
//   setForm(updater)   setState формы
//   teamLocked         команда задана учёткой лида и не редактируется
//   leadUsers          тимлиды, к которым можно привязать участника
//   error              текст ошибки формы или пусто
//   onSubmit(event)    отправка (createEmployeeUser)
//   onClose()          закрыть форму
//
// Подписи полей не меняем: по ним форму находят тесты (getByLabel). По той же
// причине у формы и контейнеров нет aria-label со словами «логин», «пароль».
const ACCESS_OPTIONS = [
  { value: "employee", label: "Участник команды" },
  { value: "lead", label: "Тимлид" }
];

export default function CreateLoginCard({
  id,
  description,
  allowLeadCreation,
  showCancel = false,
  cardRef,
  form,
  setForm,
  teamLocked = false,
  leadUsers = [],
  error,
  onSubmit,
  onClose
}) {
  const formRole = allowLeadCreation ? form.role : "employee";
  const patch = (fields) => setForm((current) => ({ ...current, ...fields }));

  return (
    <Card as="article" id={id} ref={cardRef} className="team-create">
      <CardHeader
        icon={UserPlus}
        title="Создать логин"
        subtitle={description}
        action={showCancel ? <IconButton label="Закрыть форму" icon={X} onClick={onClose} /> : null}
      />
      <form className="team-form" onSubmit={onSubmit} noValidate>
        {allowLeadCreation && (
          <div className="team-form__access">
            <span className="team-form__legend">Тип доступа</span>
            <Segmented
              fullWidth
              ariaLabel="Тип доступа"
              value={form.role}
              options={ACCESS_OPTIONS}
              onChange={(role) => patch({ role, leadUserId: role === "lead" ? "" : form.leadUserId })}
            />
          </div>
        )}

        <Field label={formRole === "lead" ? "Имя тимлида" : "Имя участника"}>
          {(field) => (
            <TextInput
              {...field}
              value={form.personName}
              onChange={(event) => patch({ personName: event.target.value })}
              placeholder={formRole === "lead" ? "Например: Мария Лидова" : "Например: Иван Петров"}
              autoComplete="name"
            />
          )}
        </Field>

        <div className="team-form__grid">
          {formRole === "employee" ? (
            <Field label="Роль в команде">
              {(field) => (
                <TextInput {...field} value={form.personRole} onChange={(event) => patch({ personRole: event.target.value })} placeholder="Product Manager" />
              )}
            </Field>
          ) : (
            <Field label="Роль в системе">{(field) => <TextInput {...field} value="Тимлид" readOnly />}</Field>
          )}
          <Field label="Команда" hint={teamLocked ? "Тимлид создаёт логины в свою команду" : undefined}>
            {(field) => (
              <TextInput
                {...field}
                value={form.personTeam}
                onChange={(event) => patch({ personTeam: event.target.value })}
                placeholder="Product Growth"
                readOnly={teamLocked}
              />
            )}
          </Field>
        </div>

        {formRole === "employee" && allowLeadCreation && leadUsers.length > 0 && (
          <Field label="Тимлид">
            {(field) => (
              <Select
                {...field}
                value={form.leadUserId}
                onChange={(event) => {
                  const lead = leadUsers.find((item) => item.id === event.target.value);
                  patch({ leadUserId: event.target.value, personTeam: lead?.teamLabel || form.personTeam });
                }}
              >
                <option value="">По названию команды</option>
                {leadUsers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.teamLabel || "команда не задана"}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <div className="team-form__grid">
          <Field label="Логин" hint="Латиница, цифры, точка, дефис">
            {(field) => (
              <TextInput
                {...field}
                value={form.username}
                onChange={(event) => patch({ username: event.target.value })}
                placeholder="ivan.sre"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label="Пароль" hint="Минимум 8 символов">
            {(field) => (
              <PasswordField {...field} tools value={form.password} onValueChange={(password) => patch({ password })} placeholder="минимум 8 символов" />
            )}
          </Field>
        </div>

        {error && (
          <p className="team-form__error" role="alert">
            <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        <div className="team-form__actions">
          <Button type="submit" icon={UserPlus}>
            Создать логин
          </Button>
        </div>
      </form>
    </Card>
  );
}
