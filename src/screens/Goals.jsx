import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Flag,
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
  Dialog,
  EmptyState,
  Field,
  IconButton,
  ListGroup,
  ListRow,
  Menu,
  PageHeader,
  ProgressBar,
  Section,
  Segmented,
  Select,
  Slider,
  Stat,
  TextArea,
  TextInput,
  ConfirmDialog
} from "../ui";
import { formatDateRu, goalStatusLabel } from "../lib/shared.jsx";
import "../styles/screen-goals.css";

/*
  Экран «Цели».

  Состояние и обработчики живут в App.jsx и приходят пропсами. Локально только
  чистый интерфейс: какая цель ждёт подтверждения удаления.

  Пропсы:
    isAdmin            boolean, лид видит и правит цели всех участников
    currentPersonId    id участника текущего пользователя (или "")
    people             workspace.people
    goals              все цели рабочего пространства (для счётчиков и справки)
    visibleGoals       цели после фильтра и сортировки
    aggregate          { active, achieved, avgProgress, atRisk }
    filter, onFilterChange       { personId, status } и его сеттер
    lprs               все ЛПР (для названий связанных планов)
    availableLprs      ЛПР, к которым можно привязать новую цель
    draft, onDraftChange         черновик новой цели и его сеттер
    targetPersonId     участник, которому будет добавлена цель
    composeOpen, onComposeOpenChange   открыта ли форма новой цели
    onAdd(event)       отправка формы, возвращает true, если цель добавлена
    progressOf(goal)   текущее значение прогресса (с учётом черновика ползунка)
    onProgressDraft(goalId, value)     движение ползунка
    onProgressCommit(goalId, value)    сохранение значения
    onSetStatus(goalId, status)        "active" | "achieved" | "abandoned"
    onDelete(goalId)
*/

const STATUS_TONE = { active: "accent", achieved: "success", abandoned: "neutral" };

function formatDue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? formatDateRu(value) : String(value || "");
}

export default function GoalsScreen({
  isAdmin,
  currentPersonId,
  people,
  goals,
  visibleGoals,
  aggregate,
  filter,
  onFilterChange,
  lprs,
  availableLprs,
  draft,
  onDraftChange,
  targetPersonId,
  composeOpen,
  onComposeOpenChange,
  onAdd,
  progressOf,
  onProgressDraft,
  onProgressCommit,
  onSetStatus,
  onDelete
}) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const lprById = useMemo(() => new Map(lprs.map((lpr) => [lpr.id, lpr])), [lprs]);
  const canCompose = isAdmin || Boolean(currentPersonId);

  // Счётчики на сегментах считаются в рамках выбранного участника.
  const scoped = useMemo(
    () => goals.filter((goal) => filter.personId === "all" || goal.personId === filter.personId),
    [goals, filter.personId]
  );
  const count = (status) => scoped.filter((goal) => goal.status === status).length;
  const statusOptions = [
    { value: "active", label: goalStatusLabel.active, badge: count("active") },
    { value: "achieved", label: "Достигнуты", badge: count("achieved") },
    { value: "abandoned", label: "Сняты", badge: count("abandoned") },
    { value: "all", label: "Все", badge: scoped.length }
  ];

  const targetActive = useMemo(
    () => goals.filter((goal) => goal.personId === targetPersonId && goal.status === "active").slice(0, 3),
    [goals, targetPersonId]
  );
  const targetPerson = peopleById.get(targetPersonId);

  const setFilter = (patch) => onFilterChange((current) => ({ ...current, ...patch }));
  const set = (patch) => onDraftChange((current) => ({ ...current, ...patch }));

  const submit = (event) => {
    if (onAdd(event)) onComposeOpenChange(false);
  };

  const showAll = () => onFilterChange({ personId: isAdmin ? "all" : filter.personId, status: "all" });

  const addButton = canCompose ? (
    <Button icon={Plus} onClick={() => onComposeOpenChange(true)}>
      Добавить цель
    </Button>
  ) : null;

  return (
    <section className="goal-screen" aria-label="Цели">
      <PageHeader title="Цели" subtitle="Прогресс, сроки и связь с планами развития" actions={addButton} />

      <div className="goal-stats">
        <Stat icon={Target} label="В работе" value={aggregate.active} hint="активных целей" />
        <Stat icon={CheckCircle2} iconTone="success" label="Достигнуто" value={aggregate.achieved} hint="цели закрыты" />
        <Stat icon={Activity} iconTone="info" label="Средний прогресс" value={`${aggregate.avgProgress}%`} hint="по активным" />
        <Stat
          icon={AlertTriangle}
          iconTone={aggregate.atRisk ? "warning" : "success"}
          label="Под риском"
          value={aggregate.atRisk}
          hint={aggregate.atRisk ? "прогресс меньше 30%" : "всё идёт по плану"}
        />
      </div>

      <div className="goal-toolbar" role="toolbar" aria-label="Фильтры целей">
        <Segmented
          ariaLabel="Статус цели"
          value={filter.status}
          onChange={(status) => setFilter({ status })}
          options={statusOptions}
          className="goal-toolbar__status"
        />
        {isAdmin && (
          <Select
            aria-label="Участник"
            className="goal-toolbar__person"
            value={filter.personId}
            onChange={(event) => setFilter({ personId: event.target.value })}
            options={[{ value: "all", label: "Все участники" }, ...people.map((person) => ({ value: person.id, label: person.name }))]}
          />
        )}
      </div>

      {visibleGoals.length === 0 ? (
        <Card className="goal-empty">
          {goals.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Целей пока нет"
              description="Цель превращает договорённости с 1:1 в измеримый результат: с горизонтом, сроком и понятным прогрессом."
              action={addButton}
            />
          ) : (
            <EmptyState
              icon={Target}
              title="В этом фильтре пока нет целей"
              description="Попробуйте другой статус или покажите все цели."
              action={
                <Button variant="neutral" onClick={showAll}>
                  Показать все
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="goal-list">
          {visibleGoals.map((goal) => {
            const person = peopleById.get(goal.personId);
            const lpr = goal.lprId ? lprById.get(goal.lprId) : null;
            const owner = isAdmin || currentPersonId === goal.personId;
            const value = progressOf(goal);
            const atRisk = goal.status === "active" && value < 30;
            const progressTone = goal.status === "achieved" ? "success" : atRisk ? "warning" : "accent";
            const editable = owner && goal.status !== "abandoned";
            const due = goal.dueDate && goal.dueDate !== goal.horizon ? formatDue(goal.dueDate) : "";

            const items = [];
            if (goal.status !== "abandoned") items.push({ id: "abandon", label: "Снять", icon: Flag, onSelect: () => onSetStatus(goal.id, "abandoned") });
            if (items.length) items.push("separator");
            items.push({
              id: "delete",
              label: "Удалить",
              icon: Trash2,
              tone: "danger",
              onSelect: () => setPendingDelete({ id: goal.id, title: goal.title })
            });

            return (
              <Card as="article" className="goal-card" key={goal.id} data-status={goal.status}>
                <div className="goal-card__head">
                  {person ? (
                    <span className="goal-card__person">
                      <Avatar name={person.name} size={32} decorative />
                      <span className="goal-card__name">{person.name}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  <Badge tone={STATUS_TONE[goal.status] || "neutral"} dot>
                    {goalStatusLabel[goal.status]}
                  </Badge>
                </div>

                <div className="goal-card__body">
                  <h3 className="goal-card__title">{goal.title}</h3>
                  {goal.description && <p className="goal-card__desc">{goal.description}</p>}
                </div>

                <div className="goal-card__chips">
                  {goal.horizon && <Badge icon={Flag}>{goal.horizon}</Badge>}
                  {due && <Badge icon={Calendar}>до {due}</Badge>}
                  {lpr && <Badge icon={ClipboardCheck}>ЛПР · {lpr.title}</Badge>}
                  {atRisk && (
                    <Badge tone="warning" icon={AlertTriangle}>
                      Под риском
                    </Badge>
                  )}
                </div>

                <div className="goal-progress">
                  <span className="goal-progress__value num">{value}%</span>
                  {editable ? (
                    <Slider
                      className="goal-progress__slider"
                      min={0}
                      max={100}
                      step={5}
                      value={value}
                      aria-label="Прогресс цели"
                      onChange={(next) => onProgressDraft(goal.id, next)}
                      onPointerDown={(event) => event.currentTarget.setPointerCapture?.(event.pointerId)}
                      onPointerUp={(event) => {
                        event.currentTarget.releasePointerCapture?.(event.pointerId);
                        onProgressCommit(goal.id, event.currentTarget.value);
                      }}
                      onKeyUp={(event) => onProgressCommit(goal.id, event.currentTarget.value)}
                      onBlur={(event) => onProgressCommit(goal.id, event.currentTarget.value)}
                    />
                  ) : (
                    <ProgressBar className="goal-progress__slider" value={value} tone={progressTone} aria-label="Прогресс цели" />
                  )}
                </div>

                {owner && (
                  <div className="goal-card__actions">
                    {goal.status === "active" ? (
                      <Button variant="tinted" size="sm" icon={Check} onClick={() => onSetStatus(goal.id, "achieved")}>
                        Достигнута
                      </Button>
                    ) : (
                      <Button variant="tinted" size="sm" icon={RotateCcw} onClick={() => onSetStatus(goal.id, "active")}>
                        Вернуть в работу
                      </Button>
                    )}
                    {goal.status === "abandoned" && (
                      <Button variant="neutral" size="sm" icon={Check} onClick={() => onSetStatus(goal.id, "achieved")}>
                        Достигнута
                      </Button>
                    )}
                    <Menu
                      align="end"
                      label={`Действия: ${goal.title}`}
                      trigger={<IconButton label="Ещё" icon={MoreHorizontal} className="goal-card__more" />}
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
        onClose={() => onComposeOpenChange(false)}
        size="md"
        title="Новая цель"
        description="Что считаем успехом и к какому сроку"
        footer={
          <>
            <Button variant="neutral" onClick={() => onComposeOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" form="goal-compose-form" icon={Plus}>
              Добавить цель
            </Button>
          </>
        }
      >
        <form id="goal-compose-form" className="goal-form" aria-label="Новая цель" onSubmit={submit}>
          {isAdmin && (
            <Field label="Участник" required>
              <Select
                value={targetPersonId || ""}
                onChange={(event) => set({ personId: event.target.value, lprId: "" })}
                placeholder="Выберите участника"
                options={people.map((person) => ({ value: person.id, label: person.name }))}
              />
            </Field>
          )}

          {availableLprs.length > 0 && (
            <Field label="ЛПР" hint="Необязательно: свяжите цель с планом развития">
              <Select
                value={draft.lprId}
                onChange={(event) => set({ lprId: event.target.value })}
                options={[{ value: "", label: "Без ЛПР" }, ...availableLprs.map((lpr) => ({ value: lpr.id, label: lpr.title }))]}
              />
            </Field>
          )}

          <Field label="Цель" required>
            <TextInput
              value={draft.title}
              onChange={(event) => set({ title: event.target.value })}
              placeholder="Например: снизить MTTR в 2 раза"
              data-autofocus
            />
          </Field>

          <Field label="Контекст">
            <TextArea
              rows={3}
              value={draft.description}
              onChange={(event) => set({ description: event.target.value })}
              placeholder="Что считаем успехом и какие ключевые шаги"
            />
          </Field>

          <div className="goal-form__pair">
            <Field label="Горизонт">
              <TextInput value={draft.horizon} onChange={(event) => set({ horizon: event.target.value })} placeholder="2026-Q2" />
            </Field>
            <Field label="Дедлайн">
              <TextInput type="date" value={draft.dueDate} onChange={(event) => set({ dueDate: event.target.value })} />
            </Field>
          </div>

          {targetPerson && targetActive.length > 0 && (
            <Section title={`Уже в работе у ${targetPerson.name}`} headingAs="h3">
              <ListGroup>
                {targetActive.map((goal) => (
                  <ListRow key={goal.id} title={goal.title} meta={<span className="num">{goal.progress}%</span>} />
                ))}
              </ListGroup>
            </Section>
          )}
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        tone="danger"
        title="Удалить цель?"
        description={pendingDelete ? `Цель «${pendingDelete.title}» будет удалена без возможности восстановления.` : ""}
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
