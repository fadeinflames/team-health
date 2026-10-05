import { useMemo, useState } from "react";
import {
  Activity,
  Check,
  CircleDashed,
  ClipboardCheck,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Target,
  Trash2
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  ListGroup,
  ListRow,
  Menu,
  PageHeader,
  ProgressRing,
  Section,
  Segmented,
  Select,
  Stat,
  TextArea,
  TextInput
} from "../ui";
import { countLabel, lprStatusLabel } from "../lib/shared.jsx";
import "../styles/screen-lprs.css";

/*
  Экран «ЛПР» (личный план развития): темы 1:1, цели и прогресс в одной карточке.

  Состояние и обработчики живут в App.jsx и приходят пропсами. Локально только
  чистый интерфейс: открыта ли форма и какой план ждёт подтверждения удаления.

  Пропсы:
    isAdmin            boolean, лид видит и правит планы всех участников
    currentPersonId    id участника текущего пользователя (или "")
    people             workspace.people
    lprs               все ЛПР (для счётчиков и справки в форме)
    visibleLprs        ЛПР после фильтра и сортировки
    goals              все цели; cards: все темы 1:1 (связи через lprId)
    aggregate          { active, linkedGoals, linkedCards, avgProgress }
    filter, onFilterChange       { personId, status } и его сеттер
    draft, onDraftChange         черновик нового ЛПР и его сеттер
    targetPersonId     участник, которому будет добавлен план
    onAdd(event)       отправка формы, возвращает true, если план добавлен
    onSetStatus(lprId, status)   "active" | "paused" | "done"
    onDelete(lprId)
    onOpenPerson(personId)       открыть 1:1 участника (по теме из плана)
    onAddGoal(lpr)               открыть форму цели, привязанной к плану
*/

const STATUS_TONE = { active: "accent", paused: "warning", done: "success" };

export default function LprsScreen({
  isAdmin,
  currentPersonId,
  people,
  lprs,
  visibleLprs,
  goals,
  cards,
  aggregate,
  filter,
  onFilterChange,
  draft,
  onDraftChange,
  targetPersonId,
  onAdd,
  onSetStatus,
  onDelete,
  onOpenPerson,
  onAddGoal
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const canCompose = isAdmin || Boolean(currentPersonId);

  const scoped = useMemo(
    () => lprs.filter((lpr) => filter.personId === "all" || lpr.personId === filter.personId),
    [lprs, filter.personId]
  );
  const count = (status) => scoped.filter((lpr) => lpr.status === status).length;
  const statusOptions = [
    { value: "active", label: lprStatusLabel.active, badge: count("active") },
    { value: "paused", label: lprStatusLabel.paused, badge: count("paused") },
    { value: "done", label: "Завершены", badge: count("done") },
    { value: "all", label: "Все", badge: scoped.length }
  ];

  const targetActive = useMemo(
    () => lprs.filter((lpr) => lpr.personId === targetPersonId && lpr.status === "active").slice(0, 3),
    [lprs, targetPersonId]
  );
  const targetPerson = peopleById.get(targetPersonId);

  const setFilter = (patch) => onFilterChange((current) => ({ ...current, ...patch }));
  const set = (patch) => onDraftChange((current) => ({ ...current, ...patch }));

  const submit = (event) => {
    if (onAdd(event)) setComposeOpen(false);
  };

  const showAll = () => onFilterChange({ personId: isAdmin ? "all" : filter.personId, status: "all" });

  const addButton = canCompose ? (
    <Button icon={Plus} onClick={() => setComposeOpen(true)}>
      Новый ЛПР
    </Button>
  ) : null;

  return (
    <section className="lpr-screen" aria-label="ЛПР: личные планы развития">
      <PageHeader title="ЛПР" subtitle="Личный план развития: от тем 1:1 к целям" actions={addButton} />

      <div className="lpr-stats">
        <Stat icon={ClipboardCheck} label="ЛПР в работе" value={aggregate.active} hint="активных планов" />
        <Stat icon={Target} iconTone="success" label="Связанные цели" value={aggregate.linkedGoals} hint="цели с ЛПР" />
        <Stat icon={MessageSquarePlus} iconTone="info" label="Темы из 1:1" value={aggregate.linkedCards} hint="привязаны к ЛПР" />
        <Stat icon={Activity} iconTone="warning" label="Средний прогресс" value={`${aggregate.avgProgress}%`} hint="по активным целям" />
      </div>

      <div className="lpr-toolbar" role="toolbar" aria-label="Фильтры ЛПР">
        <Segmented
          ariaLabel="Статус ЛПР"
          value={filter.status}
          onChange={(status) => setFilter({ status })}
          options={statusOptions}
          className="lpr-toolbar__status"
        />
        {isAdmin && (
          <Select
            aria-label="Участник"
            className="lpr-toolbar__person"
            value={filter.personId}
            onChange={(event) => setFilter({ personId: event.target.value })}
            options={[{ value: "all", label: "Все участники" }, ...people.map((person) => ({ value: person.id, label: person.name }))]}
          />
        )}
      </div>

      {visibleLprs.length === 0 ? (
        <Card className="lpr-empty">
          {lprs.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Планов развития пока нет"
              description="ЛПР собирает повторяющиеся темы из 1:1 в понятный план и связывает их с целями. Начните с первого."
              action={canCompose ? addButton : null}
            />
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="Пока нет ЛПР в этом фильтре"
              description="Попробуйте другой статус или покажите все планы."
              action={
                <Button variant="neutral" onClick={showAll}>
                  Показать все
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="lpr-list">
          {visibleLprs.map((lpr) => {
            const person = peopleById.get(lpr.personId);
            const linkedGoals = goals.filter((goal) => goal.lprId === lpr.id);
            const linkedCards = cards.filter((card) => card.lprId === lpr.id);
            const activeGoals = linkedGoals.filter((goal) => goal.status === "active");
            const avg = activeGoals.length
              ? Math.round(activeGoals.reduce((sum, goal) => sum + (goal.progress || 0), 0) / activeGoals.length)
              : 0;
            const canEdit = isAdmin || currentPersonId === lpr.personId;

            const items = [];
            if (lpr.status === "active") items.push({ id: "pause", label: "Пауза", icon: CircleDashed, onSelect: () => onSetStatus(lpr.id, "paused") });
            if (lpr.status === "paused") items.push({ id: "done", label: "Завершить", icon: Check, onSelect: () => onSetStatus(lpr.id, "done") });
            if (lpr.status === "done") items.push({ id: "pause", label: "Пауза", icon: CircleDashed, onSelect: () => onSetStatus(lpr.id, "paused") });
            items.push("separator", {
              id: "delete",
              label: "Удалить",
              icon: Trash2,
              tone: "danger",
              onSelect: () => setPendingDelete({ id: lpr.id, title: lpr.title })
            });

            return (
              <Card as="article" className="lpr-card" key={lpr.id} data-status={lpr.status}>
                <div className="lpr-card__head">
                  {person ? (
                    <span className="lpr-card__person">
                      <Avatar name={person.name} size={32} decorative />
                      <span className="lpr-card__name">{person.name}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  <Badge tone={STATUS_TONE[lpr.status] || "neutral"} dot>
                    {lprStatusLabel[lpr.status]}
                  </Badge>
                </div>

                <div className="lpr-card__main">
                  <div className="lpr-card__text">
                    <h3 className="lpr-card__title">{lpr.title}</h3>
                    {lpr.focus && <p className="lpr-card__focus">{lpr.focus}</p>}
                    <p className="lpr-card__meta">
                      {countLabel(linkedCards.length, ["тема 1:1", "темы 1:1", "тем 1:1"])}
                      <span aria-hidden="true"> · </span>
                      {countLabel(linkedGoals.length, ["цель", "цели", "целей"])}
                    </p>
                  </div>
                  <ProgressRing value={avg} size={72} stroke={7} tone={avg >= 100 ? "success" : "accent"} label={`Прогресс плана: ${avg}%`}>
                    <span className="lpr-card__ring num">{avg}%</span>
                  </ProgressRing>
                </div>

                <div className="lpr-card__links">
                  <Section title="Из 1:1" headingAs="h4">
                    {linkedCards.length ? (
                      <ListGroup inset={false}>
                        {linkedCards.slice(0, 4).map((card) => (
                          <ListRow key={card.id} title={card.title} chevron onClick={() => onOpenPerson(card.personId)} />
                        ))}
                      </ListGroup>
                    ) : (
                      <p className="lpr-card__hint">Свяжите тему 1:1 с ЛПР.</p>
                    )}
                  </Section>
                  <Section title="Цели" headingAs="h4">
                    {linkedGoals.length ? (
                      <ListGroup inset={false}>
                        {linkedGoals.slice(0, 4).map((goal) => (
                          <ListRow
                            key={goal.id}
                            title={goal.title}
                            meta={<span className="num">{goal.progress}%</span>}
                            chevron
                            onClick={() => onAddGoal(lpr)}
                          />
                        ))}
                      </ListGroup>
                    ) : (
                      <p className="lpr-card__hint">Добавьте цель из этого плана.</p>
                    )}
                  </Section>
                </div>

                {canEdit && (
                  <div className="lpr-card__actions">
                    <Button variant="tinted" size="sm" icon={Plus} onClick={() => onAddGoal(lpr)}>
                      Цель
                    </Button>
                    {lpr.status === "active" ? (
                      <Button variant="neutral" size="sm" icon={Check} onClick={() => onSetStatus(lpr.id, "done")}>
                        Завершить
                      </Button>
                    ) : (
                      <Button variant="neutral" size="sm" icon={RotateCcw} onClick={() => onSetStatus(lpr.id, "active")}>
                        В работу
                      </Button>
                    )}
                    <Menu
                      align="end"
                      label={`Действия: ${lpr.title}`}
                      trigger={<IconButton label="Ещё" icon={MoreHorizontal} className="lpr-card__more" />}
                      items={items}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        size="md"
        title="Новый ЛПР"
        description="Название и фокус личного плана развития"
        footer={
          <>
            <Button variant="neutral" onClick={() => setComposeOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" form="lpr-compose-form" icon={Plus}>
              Добавить ЛПР
            </Button>
          </>
        }
      >
        <form id="lpr-compose-form" className="lpr-form" aria-label="Новый ЛПР" onSubmit={submit}>
          {isAdmin && (
            <Field label="Участник" required>
              <Select
                value={targetPersonId || ""}
                onChange={(event) => set({ personId: event.target.value })}
                placeholder="Выберите участника"
                options={people.map((person) => ({ value: person.id, label: person.name }))}
              />
            </Field>
          )}

          <Field label="Название" required>
            <TextInput
              value={draft.title}
              onChange={(event) => set({ title: event.target.value })}
              placeholder="Например: ЛПР: ownership направления"
              data-autofocus
            />
          </Field>

          <Field label="Фокус">
            <TextArea
              rows={4}
              value={draft.focus}
              onChange={(event) => set({ focus: event.target.value })}
              placeholder="Какие темы из 1:1 превращаем в цели и практику"
            />
          </Field>

          {targetPerson && targetActive.length > 0 && (
            <Section title={`Активные ЛПР: ${targetPerson.name}`} headingAs="h3">
              <ListGroup>
                {targetActive.map((lpr) => (
                  <ListRow
                    key={lpr.id}
                    title={lpr.title}
                    meta={countLabel(goals.filter((goal) => goal.lprId === lpr.id).length, ["цель", "цели", "целей"])}
                  />
                ))}
              </ListGroup>
            </Section>
          )}
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        tone="danger"
        title="Удалить ЛПР?"
        description={
          pendingDelete ? `ЛПР «${pendingDelete.title}» будет удалён. Связанные темы и цели сохранятся.` : ""
        }
        confirmLabel="Подтвердить удаление"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) onDelete(target.id);
        }}
      />
    </section>
  );
}
