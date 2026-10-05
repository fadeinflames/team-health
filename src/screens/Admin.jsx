import { useRef } from "react";
import { CircleAlert, Copy, Ellipsis, KeyRound, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, ListGroup, Menu, PageHeader, Section, Select, Stat, useToast } from "../ui";
import { isPlatformAdminRole, isProtectedAccess, roleLabel, scrollBehavior } from "../lib/shared.jsx";
import PasswordField from "./team/PasswordField.jsx";
import { copyText } from "./team/clipboard.js";
import "../styles/screen-admin.css";

// Раздел «Админка» (id "admin"): только админ платформы. Создание логина,
// сброс пароля, список всех аккаунтов платформы.
//
// Состояние и обработчики живут в App.jsx, сюда приходят пропсами:
//   realUsers              аккаунты без демо (workspace.users без демо-доступа)
//   editableUsers          аккаунты, которым можно сбросить пароль (без админов платформы)
//   people                 workspace.people (имя участника берётся из его профиля)
//   createLoginPanel       готовый узел формы «Создать логин» (renderCreateLoginCard)
//   passwordUpdate         { userId, password }; setPasswordUpdate(updater)
//   passwordError          ошибка формы сброса пароля
//   onResetPassword(event) отправка формы (updateEmployeePassword)
//   onDeleteUser(user)     удалить логин (deleteEmployeeUser), без доп. подтверждения, как раньше
//
// Классы admin-view, settings-card и access-row оставлены как крючки для e2e-тестов.

function roleTone(user) {
  if (isPlatformAdminRole(user)) return "info";
  if (user.role === "lead") return "accent";
  return "neutral";
}

export default function AdminScreen({
  realUsers,
  editableUsers,
  people,
  createLoginPanel,
  passwordUpdate,
  setPasswordUpdate,
  passwordError,
  onResetPassword,
  onDeleteUser
}) {
  const { toast } = useToast();
  const resetRef = useRef(null);

  const leads = realUsers.filter((item) => item.role === "lead").length;
  const members = realUsers.filter((item) => item.role === "employee").length;

  const copyLogin = async (username) => {
    const ok = await copyText(username);
    toast(ok ? { title: "Логин скопирован", description: username, tone: "success" } : { title: "Не удалось скопировать", description: username, tone: "danger" });
  };

  // «Сбросить пароль» из меню строки: подставляем логин в форму, прокручиваем и ставим курсор в поле.
  const pickForReset = (userId) => {
    setPasswordUpdate((current) => ({ ...current, userId }));
    window.requestAnimationFrame(() => {
      const card = resetRef.current;
      if (!card) return;
      card.scrollIntoView({ block: "center", behavior: scrollBehavior() });
      card.querySelector("input[type='password'], input[type='text'][autocomplete='new-password']")?.focus({ preventScroll: true });
    });
  };

  return (
    <section className="admin-view adm" aria-label="Администрирование">
      <PageHeader title="Админка" subtitle="Доступы, роли, логины и пароли платформы. Демо и рабочая команда не смешиваются." />

      <div className="adm-stats" role="group" aria-label="Сводка по доступам">
        <Stat icon={KeyRound} label="Логинов" value={realUsers.length} hint="без демо-доступа" />
        <Stat icon={ShieldCheck} iconTone="info" label="Тимлидов" value={leads} hint="видят свою команду" />
        <Stat icon={UsersRound} iconTone="success" label="Участников" value={members} hint="видят только свой 1:1" />
      </div>

      {createLoginPanel}

      <Card ref={resetRef} className="settings-card adm-reset">
        <CardHeader
          icon={KeyRound}
          iconTone="warning"
          title="Сбросить пароль пользователю"
          subtitle="После сброса все активные сессии этого пользователя закроются."
        />
        <form className="adm-form" data-form="password" onSubmit={onResetPassword} noValidate>
          <Field label="Логин">
            {(field) => (
              <Select
                {...field}
                placeholder="Выберите логин"
                value={passwordUpdate.userId}
                onChange={(event) => setPasswordUpdate((current) => ({ ...current, userId: event.target.value }))}
              >
                {editableUsers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.username} — {item.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Новый пароль" hint="Минимум 8 символов. Сгенерированный пароль можно скопировать и передать человеку.">
            {(field) => (
              <PasswordField
                {...field}
                tools
                value={passwordUpdate.password}
                onValueChange={(password) => setPasswordUpdate((current) => ({ ...current, password }))}
                placeholder="минимум 8 символов"
              />
            )}
          </Field>
          {passwordError && (
            <p className="team-form__error" role="alert">
              <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{passwordError}</span>
            </p>
          )}
          <div className="team-form__actions">
            <Button type="submit" icon={KeyRound} disabled={!passwordUpdate.userId}>
              Сбросить пароль
            </Button>
          </div>
        </form>
      </Card>

      <Section size="lg" title="Все логины" hint="Все аккаунты платформы. Удаление логина закрывает все его сессии.">
        {realUsers.length === 0 ? (
          <Card>
            <EmptyState icon={KeyRound} title="Логинов пока нет" description="Создайте первый логин формой выше." />
          </Card>
        ) : (
          <ListGroup className="adm-list">
            {realUsers.map((item) => {
              const person = people.find((candidate) => candidate.id === item.personId);
              const name = isPlatformAdminRole(item) ? item.name : person?.name || item.name || "Без имени";
              const protectedAccount = isProtectedAccess(item);
              const menuItems = [
                { id: "copy", label: "Скопировать логин", icon: Copy, onSelect: () => copyLogin(item.username) },
                ...(protectedAccount ? [] : [{ id: "reset", label: "Сбросить пароль", icon: KeyRound, onSelect: () => pickForReset(item.id) }])
              ];
              return (
                <div role="listitem" className="ui-list__item" key={item.id}>
                  <article className="access-row adm-row">
                    <Avatar name={name} size={40} decorative />
                    <div className="adm-row__text">
                      <span className="adm-row__name">{name}</span>
                      <span className="adm-row__sub">
                        {item.username}
                        {item.teamLabel ? ` · ${item.teamLabel}` : ""}
                      </span>
                    </div>
                    <Badge className="adm-row__role" tone={roleTone(item)}>
                      {roleLabel[item.role] || item.role}
                    </Badge>
                    <div className="adm-row__actions">
                      <Menu
                        align="end"
                        label={`Действия для ${item.username}`}
                        items={menuItems}
                        trigger={<IconButton label={`Действия для ${item.username}`} icon={Ellipsis} />}
                      />
                      {!protectedAccount && (
                        <Button variant="danger" size="sm" icon={Trash2} onClick={() => onDeleteUser(item)}>
                          Удалить
                        </Button>
                      )}
                    </div>
                  </article>
                </div>
              );
            })}
          </ListGroup>
        )}
      </Section>
    </section>
  );
}
