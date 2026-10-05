import { useRef } from "react";
import { Check, CircleDashed, ClipboardCheck, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Select,
  TextArea,
  TextInput
} from "../../ui";
import { countLabel, ownerLabel, todayISODate } from "../../lib/shared.jsx";

// Вкладка «Итоги»: следующие шаги до встречи и краткие итоги для рассылки.
export default function OutcomesView({
  isAdmin,
  personActions,
  unresolvedActions,
  editingActionId,
  setEditingActionId,
  actionEditDraft,
  setActionEditDraft,
  updateActionFields,
  toggleAction,
  askDelete,
  newAction,
  setNewAction,
  newActionTitleKey,
  newActionAlreadyOpen,
  addAction,
  summaryText,
  buildSummary,
  summaryPanelRef
}) {
  const titleRef = useRef(null);
  const today = todayISODate();
  const patchNew = (patch) => setNewAction((current) => ({ ...current, ...patch }));

  return (
    <div className="meet-view meet-outcomes">
      <Card className="meet-actions-card">
        <CardHeader
          icon={ClipboardCheck}
          title="Следующие шаги до встречи"
          subtitle="Что и кто делает до следующего 1:1"
          action={
            <Badge tone={unresolvedActions.length ? "accent" : "neutral"}>
              {countLabel(unresolvedActions.length, ["открытый шаг", "открытых шага", "открытых шагов"])}
            </Badge>
          }
        />

        {personActions.length === 0 ? (
          <EmptyState
            icon={CircleDashed}
            title="Пока нет следующих шагов"
            description="Зафиксируйте, о чём договорились: у шага есть исполнитель и срок."
            action={
              <Button variant="tinted" icon={Plus} onClick={() => titleRef.current?.focus()}>
                Добавить шаг
              </Button>
            }
          />
        ) : (
          <ul className="meet-actions" aria-label="Следующие шаги">
            {personActions.map((action) => {
              const canEdit = isAdmin || action.owner === "employee";
              const isEditing = editingActionId === action.id;
              const isOverdue = !action.done && action.dueDate && action.dueDate < today;
              return (
                <li className={`meet-action${action.done ? " is-done" : ""}${isOverdue ? " is-overdue" : ""}`} key={action.id}>
                  <Checkbox className="meet-action__check" checked={action.done} onChange={() => toggleAction(action.id)} aria-label="Готово" />
                  {isEditing ? (
                    <>
                      <div className="meet-action__edit">
                        <TextInput
                          aria-label="Действие"
                          value={actionEditDraft.title}
                          onChange={(event) => setActionEditDraft((current) => ({ ...current, title: event.target.value }))}
                          placeholder="Что нужно сделать"
                        />
                        <div className="meet-action__edit-row">
                          <TextInput
                            type="date"
                            aria-label="Срок: дата"
                            value={actionEditDraft.dueDate}
                            onChange={(event) => setActionEditDraft((current) => ({ ...current, dueDate: event.target.value }))}
                          />
                          <TextInput
                            aria-label="Срок словами"
                            value={actionEditDraft.due}
                            onChange={(event) => setActionEditDraft((current) => ({ ...current, due: event.target.value }))}
                            placeholder="Срок словами"
                          />
                        </div>
                      </div>
                      <div className="meet-action__buttons">
                        <IconButton
                          label="Сохранить"
                          icon={Check}
                          variant="tinted"
                          onClick={() => {
                            if (actionEditDraft.title.trim().length < 1) return;
                            updateActionFields(action.id, {
                              title: actionEditDraft.title.trim(),
                              due: actionEditDraft.due.trim() || "к следующему 1:1",
                              dueDate: actionEditDraft.dueDate || ""
                            });
                            setEditingActionId("");
                          }}
                        />
                        <IconButton label="Отмена" icon={X} onClick={() => setEditingActionId("")} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="meet-action__text">
                        <div className="action-row meet-action__title">
                          <strong>{action.title}</strong>
                        </div>
                        <p className="meet-action__meta">
                          {ownerLabel(action.owner)} · {action.due}
                          {action.dueDate ? ` · ${action.dueDate}` : ""}
                          {isOverdue ? (
                            <Badge tone="danger" size="sm" className="meet-action__late">
                              Просрочено
                            </Badge>
                          ) : null}
                        </p>
                      </div>
                      {canEdit && !action.done ? (
                        <div className="meet-action__buttons">
                          <IconButton
                            label="Изменить"
                            icon={Pencil}
                            onClick={() => {
                              setEditingActionId(action.id);
                              setActionEditDraft({ title: action.title, due: action.due, dueDate: action.dueDate || "" });
                            }}
                          />
                          <IconButton
                            label="Удалить"
                            icon={Trash2}
                            onClick={() => askDelete({ kind: "action", id: action.id, label: `шага «${action.title}»` })}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form className="meet-action-form" onSubmit={addAction} aria-label="Новый шаг">
          <div className="meet-action-form__grid">
            <Field label="Действие" className="meet-action-form__title">
              {(fieldProps) => (
                <TextInput
                  {...fieldProps}
                  ref={titleRef}
                  value={newAction.title}
                  onChange={(event) => patchNew({ title: event.target.value })}
                  placeholder="Что нужно сделать?"
                />
              )}
            </Field>
            {isAdmin ? (
              <Field label="Ответственный">
                {(fieldProps) => (
                  <Select {...fieldProps} value={newAction.owner} onChange={(event) => patchNew({ owner: event.target.value })}>
                    <option value="manager">Лид</option>
                    <option value="employee">Участник</option>
                  </Select>
                )}
              </Field>
            ) : null}
            <Field label="Срок">
              {(fieldProps) => (
                <TextInput {...fieldProps} value={newAction.due} onChange={(event) => patchNew({ due: event.target.value })} />
              )}
            </Field>
          </div>
          <div className="meet-action-form__foot">
            <Button
              type="submit"
              icon={Plus}
              disabled={!newActionTitleKey || newActionAlreadyOpen}
              title={newActionAlreadyOpen ? "Такой шаг уже есть" : "Добавить шаг"}
            >
              Добавить шаг
            </Button>
          </div>
        </form>
      </Card>

      <Card as="div" className="summary-panel meet-summary" ref={summaryPanelRef}>
        <CardHeader
          icon={Copy}
          title="Краткие итоги"
          subtitle="Текст для рассылки участнику"
          action={
            <Button variant="tinted" size="sm" icon={ClipboardCheck} onClick={buildSummary}>
              Сформировать итоги
            </Button>
          }
        />
        <TextArea
          readOnly
          aria-label="Краткие итоги встречи"
          value={summaryText || "Сформируйте итоги, чтобы получить краткое резюме встречи."}
          rows={14}
        />
      </Card>
    </div>
  );
}
