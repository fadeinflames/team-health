import { useMemo, useState } from "react";
import { CalendarDays, HeartPulse, KeyRound, Pencil, RotateCcw, Search, ShieldCheck, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, ListGroup, ListRow, PageHeader, SearchInput, Section, Stat } from "../ui";
import { countLabel, formatRuDate, scorePulse } from "../lib/shared.jsx";
import EditPersonSheet from "./team/EditPersonSheet.jsx";
import "../styles/screen-team.css";

// Раздел «Команда» (id "team"): участники 1:1 как сгруппированный список,
// архив удалённых, правка профиля. Видят админ платформы и лиды; правка, удаление
// и архив только у админа платформы.
//
// Состояние и обработчики живут в App.jsx, сюда приходят пропсами:
//   workspace              { people, users, cards, pulse, archivedPeople }
//   isPlatformAdmin        показывать правку, удаление и архив
//   peopleInRiskZone       число людей в зоне внимания (считает App, по пульсу и срочным темам)
//   showCreateLoginForm    форма «Создать логин» раскрыта
//   createLoginPanel       готовый узел формы (renderCreateLoginCard) или null
//   onToggleCreateLogin()  раскрыть/скрыть форму
//   editingPersonId        id редактируемого участника ("" если нет)
//   personEditDraft        черновик правки; setPersonEditDraft(updater)
//   editError              ошибка формы правки
//   onStartEdit(person)    открыть правку; onSaveEdit(id); onCancelEdit()
//   pendingDeletePersonId  id участника, ждущего подтверждения удаления
//   onDeletePerson(person) первый вызов просит подтверждения, второй удаляет (deleteEmployeePerson)
//   onCancelDeletePerson() отменить подтверждение
//   onRestorePerson(id)    вернуть из архива
//   onOpenPerson(id)       открыть участника в «1:1»
//   onOpenSection(id)      перейти в раздел (ссылка на «Админку»)
//   showAdminLink          показывать ссылку на «Админку» (платформенный админ)

const PERSON_FORMS = ["участник", "участника", "участников"];
const TOPIC_FORMS = ["открытая тема", "открытые темы", "открытых тем"];

function pulseTone(score) {
  if (score < 64) return "danger";
  if (score < 76) return "warning";
  return "success";
}

function PersonRow({
  person,
  score,
  openCards,
  linkedUsers,
  isPlatformAdmin,
  pendingDelete,
  onOpenPerson,
  onStartEdit,
  onDeletePerson,
  onCancelDeletePerson
}) {
  const hasLogin = linkedUsers.length > 0;
  return (
    <div role="listitem" className={`ui-list__item team-member-card`}>
      <div className="team-row">
        <button type="button" className="team-member-main" onClick={() => onOpenPerson(person.id)}>
          <Avatar name={person.name} size={44} decorative />
          <span className="team-row__text">
            <span className="team-row__name">{person.name}</span>
            <span className="team-row__sub">
              {person.role} · {person.team}
            </span>
          </span>
        </button>

        <p className="team-row__meta">
          <span>{countLabel(openCards, TOPIC_FORMS)}</span>
          {hasLogin ? (
            <span className="team-row__login">Доступ: {linkedUsers.map((item) => item.username).join(", ")}</span>
          ) : (
            <Badge tone="warning" size="sm">
              доступ не выдан
            </Badge>
          )}
        </p>

        <Badge className="team-row__pulse" tone={pulseTone(score)} dot>
          Пульс {score}
        </Badge>

        {isPlatformAdmin && (
          <div className={`team-row__actions${pendingDelete ? " team-row__actions--confirm" : ""}`}>
            {pendingDelete ? (
              <div className="team-row__confirm" role="group" aria-label={`Подтверждение удаления ${person.name}`}>
                <p>{hasLogin ? "Удалить участника вместе с логином и историей 1:1?" : "Удалить участника вместе с историей 1:1?"}</p>
                <div className="team-row__confirm-buttons">
                  <Button variant="danger" size="sm" icon={Trash2} onClick={() => onDeletePerson(person)}>
                    Подтвердить удаление
                  </Button>
                  <Button variant="neutral" size="sm" icon={X} onClick={onCancelDeletePerson}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button variant="plain" size="sm" icon={Pencil} onClick={() => onStartEdit(person)}>
                  Изменить
                </Button>
                <Button variant="plain" size="sm" icon={Trash2} className="team-row__delete" onClick={() => onDeletePerson(person)}>
                  Удалить участника
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeamScreen({
  workspace,
  isPlatformAdmin,
  peopleInRiskZone,
  showCreateLoginForm,
  createLoginPanel,
  onToggleCreateLogin,
  editingPersonId,
  personEditDraft,
  setPersonEditDraft,
  editError,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  pendingDeletePersonId,
  onDeletePerson,
  onCancelDeletePerson,
  onRestorePerson,
  onOpenPerson,
  onOpenSection,
  showAdminLink
}) {
  const [query, setQuery] = useState("");
  const people = workspace.people;
  const archived = workspace.archivedPeople || [];

  const rows = useMemo(
    () =>
      people.map((person) => ({
        person,
        score: scorePulse(workspace.pulse[person.id]),
        linkedUsers: workspace.users.filter((item) => item.personId === person.id),
        openCards: workspace.cards.filter((card) => card.personId === person.id && card.status !== "done").length
      })),
    [people, workspace.pulse, workspace.users, workspace.cards]
  );

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? rows.filter(({ person, linkedUsers }) =>
        [person.name, person.role, person.team, ...linkedUsers.map((item) => item.username)].some((part) => String(part || "").toLowerCase().includes(needle))
      )
    : rows;

  // Несколько команд: список по командам, как контакты по группам. Одна команда: один список.
  const groups = useMemo(() => {
    const byTeam = new Map();
    for (const row of visible) {
      const team = row.person.team || "Без команды";
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push(row);
    }
    return [...byTeam.entries()].map(([team, items]) => ({ team, items }));
  }, [visible]);
  const grouped = groups.length > 1;

  const withoutAccess = rows.filter((row) => row.linkedUsers.length === 0).length;
  const withoutMeetings = people.filter((person) => !person.nextMeeting).length;
  const editingPerson = isPlatformAdmin ? people.find((person) => person.id === editingPersonId) || null : null;

  const renderRows = (items) => (
    <ListGroup className="team-list">
      {items.map((row) => (
        <PersonRow
          key={row.person.id}
          {...row}
          isPlatformAdmin={isPlatformAdmin}
          pendingDelete={pendingDeletePersonId === row.person.id}
          onOpenPerson={onOpenPerson}
          onStartEdit={onStartEdit}
          onDeletePerson={onDeletePerson}
          onCancelDeletePerson={onCancelDeletePerson}
        />
      ))}
    </ListGroup>
  );

  return (
    <section className="team" aria-label="Состав команды">
      <PageHeader
        title="Команда"
        subtitle={countLabel(people.length, PERSON_FORMS)}
        actions={
          <Button icon={showCreateLoginForm ? X : UserPlus} variant={showCreateLoginForm ? "neutral" : "primary"} onClick={onToggleCreateLogin}>
            {showCreateLoginForm ? "Скрыть форму" : "Создать логин"}
          </Button>
        }
      />

      {showCreateLoginForm && createLoginPanel}

      <div className="team-stats" role="group" aria-label="Состояние команды">
        <Stat icon={UsersRound} label="Участники" value={people.length} hint="в рабочей команде" />
        <Stat
          icon={HeartPulse}
          iconTone={peopleInRiskZone ? "warning" : "success"}
          label="В зоне внимания"
          value={peopleInRiskZone}
          hint="по пульсу и темам"
        />
        <Stat icon={KeyRound} iconTone={withoutAccess ? "warning" : "success"} label="Без доступа" value={withoutAccess} hint="логин не выдан" />
        <Stat icon={CalendarDays} iconTone="info" label="Без 1:1" value={withoutMeetings} hint="нужно назначить" />
      </div>

      <Section
        size="lg"
        title="Участники 1:1"
        action={
          rows.length > 6 ? (
            <SearchInput
              className="team-search"
              size="sm"
              aria-label="Найти участника"
              placeholder="Найти участника"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery("")}
            />
          ) : null
        }
      >
        {people.length === 0 ? (
          <Card>
            <EmptyState
              icon={UsersRound}
              title="Участников пока нет"
              description="В рабочей команде пока нет участников 1:1. Создайте логин: вместе с ним появится профиль для 1:1."
            />
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState icon={Search} title="Никого не нашли" description="Попробуйте другое имя, роль или логин." />
          </Card>
        ) : grouped ? (
          <div className="team-groups">
            {groups.map(({ team, items }) => (
              <Section key={team} title={team} headingAs="h3" hint={countLabel(items.length, PERSON_FORMS)}>
                {renderRows(items)}
              </Section>
            ))}
          </div>
        ) : (
          renderRows(visible)
        )}
      </Section>

      {isPlatformAdmin && archived.length > 0 && (
        <Section size="lg" title="Удалённые участники" hint="История 1:1 и заметки сохранены: участника можно вернуть.">
          <ListGroup>
            {archived.map((person) => (
              <ListRow
                key={person.id}
                leading={<Avatar name={person.name} size={36} decorative tone="neutral" />}
                title={person.name}
                subtitle={`${person.role} · ${person.team} · удалён ${formatRuDate(person.archivedAt)}`}
                trailing={
                  <Button variant="tinted" size="sm" icon={RotateCcw} onClick={() => onRestorePerson(person.id)}>
                    Вернуть
                  </Button>
                }
              />
            ))}
          </ListGroup>
        </Section>
      )}

      {showAdminLink && (
        <ListGroup>
          <ListRow
            icon={ShieldCheck}
            iconTone="neutral"
            title="Админка"
            subtitle="Сброс паролей и полный список логинов"
            chevron
            onClick={() => onOpenSection("admin")}
          />
        </ListGroup>
      )}

      <EditPersonSheet person={editingPerson} draft={personEditDraft} setDraft={setPersonEditDraft} error={editError} onSave={onSaveEdit} onCancel={onCancelEdit} />
    </section>
  );
}
