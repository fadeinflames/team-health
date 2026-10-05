import { useRef } from "react";
import {
  Check,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  IconButton,
  ListGroup,
  ListRow,
  Menu,
  Section,
  Select,
  TextArea,
  TextInput
} from "../../ui";
import {
  categories,
  duplicateTitleKey,
  getQuestionSeeds,
  meetingTypeLabel,
  priorityLabel,
  sourceLabel
} from "../../lib/shared.jsx";
import { categoryTone, priorityTone, topicFilters } from "./helpers.js";

// Вкладка «Подготовка»: повестка 1:1, форма новой темы и быстрые вопросы.
// Все данные и обработчики приходят из App (см. контракт в Meetings.jsx).
export default function AgendaView({
  isAdmin,
  selectedPerson,
  activeFilter,
  setActiveFilter,
  filteredCards,
  personCards,
  lprById,
  activePersonLprs,
  openCardTitleKeys,
  openActionTitleKeys,
  editingCardId,
  setEditingCardId,
  cardEditDraft,
  setCardEditDraft,
  updateCardFields,
  updateCardStatus,
  promoteCardToAction,
  promoteCardToLpr,
  askDelete,
  newCard,
  setNewCard,
  newCardTitleKey,
  newCardAlreadyOpen,
  addAgendaCard,
  addSeedCard
}) {
  const titleRef = useRef(null);
  const meetingType = selectedPerson?.meetingType || "regular";
  const seeds = getQuestionSeeds(meetingType, selectedPerson?.mentorshipMode || "coach");
  const patchNew = (patch) => setNewCard((current) => ({ ...current, ...patch }));

  return (
    <div className="meet-view meet-agenda">
      <Card as="form" className="meet-compose" onSubmit={addAgendaCard} aria-label="Добавление темы">
        <CardHeader
          icon={MessageSquarePlus}
          title="Новая тема"
          subtitle="Видна участнику и лиду. Приватные заметки лид ведёт отдельно."
        />

        <div className="meet-compose__grid">
          <Field label="Тема">
            {(fieldProps) => (
              <TextInput
                {...fieldProps}
                ref={titleRef}
                value={newCard.title}
                onChange={(event) => patchNew({ title: event.target.value })}
                placeholder="Например: слишком много срочных запросов"
              />
            )}
          </Field>
          <Field label="Контекст">
            {(fieldProps) => (
              <TextArea
                {...fieldProps}
                autoGrow
                rows={2}
                value={newCard.body}
                onChange={(event) => patchNew({ body: event.target.value })}
                placeholder="Что важно не забыть обсудить?"
              />
            )}
          </Field>

          <div className="meet-compose__row">
            <Field label="Тип темы">
              {(fieldProps) => (
                <Select {...fieldProps} value={newCard.category} onChange={(event) => patchNew({ category: event.target.value })}>
                  {Object.entries(categories).map(([id, category]) => (
                    <option key={id} value={id}>
                      {category.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Приоритет">
              {(fieldProps) => (
                <Select {...fieldProps} value={newCard.priority} onChange={(event) => patchNew({ priority: event.target.value })}>
                  <option value="high">Срочно</option>
                  <option value="medium">Важно</option>
                  <option value="low">Может подождать</option>
                </Select>
              )}
            </Field>
            {isAdmin ? (
              <Field label="Автор темы">
                {(fieldProps) => (
                  <Select {...fieldProps} value={newCard.source} onChange={(event) => patchNew({ source: event.target.value })}>
                    <option value="employee">Участник 1:1</option>
                    <option value="manager">Лид</option>
                  </Select>
                )}
              </Field>
            ) : null}
            {activePersonLprs.length > 0 ? (
              <Field label="Связь с ЛПР">
                {(fieldProps) => (
                  <Select {...fieldProps} value={newCard.lprId || ""} onChange={(event) => patchNew({ lprId: event.target.value })}>
                    <option value="">Без ЛПР</option>
                    {activePersonLprs.map((lpr) => (
                      <option key={lpr.id} value={lpr.id}>
                        {lpr.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
          </div>
        </div>

        <div className="meet-compose__foot">
          {isAdmin ? null : <p className="meet-note">Тема будет добавлена от имени участника 1:1.</p>}
          <Button
            type="submit"
            icon={Plus}
            disabled={!newCardTitleKey || newCardAlreadyOpen}
            title={newCardAlreadyOpen ? "Такая тема уже есть" : "Добавить тему"}
          >
            Добавить
          </Button>
        </div>
      </Card>

      <Section
        title="Темы 1:1"
        hint="Темы повестки видны и участнику, и лиду."
        className="meet-topics-section"
      >
        <div className="meet-chips" role="group" aria-label="Фильтр тем">
          {topicFilters.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="meet-chip"
              aria-pressed={activeFilter === id}
              onClick={() => setActiveFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {filteredCards.length === 0 ? (
          <Card className="meet-empty-card">
            <EmptyState
              icon={CircleDashed}
              title={personCards.length === 0 ? "Повестка пока пустая" : "В этом фильтре тем нет"}
              description={
                personCards.length === 0
                  ? "Добавьте первую тему выше или возьмите один из быстрых вопросов ниже."
                  : "Выберите другой фильтр, чтобы увидеть остальные темы."
              }
              action={
                personCards.length === 0 ? (
                  <Button variant="tinted" icon={Plus} onClick={() => titleRef.current?.focus()}>
                    Добавить тему
                  </Button>
                ) : (
                  <Button variant="tinted" onClick={() => setActiveFilter("all")}>
                    Показать все темы
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="meet-topics">
            {filteredCards.map((card) => {
              const canEdit = isAdmin || card.source === "employee";
              const isEditing = editingCardId === card.id;
              const actionAlreadyOpen = openActionTitleKeys.has(duplicateTitleKey(card.title));
              const lpr = card.lprId ? lprById.get(card.lprId) : null;
              const menuItems = [
                ...(!card.lprId ? [{ id: "lpr", label: "В ЛПР", icon: ClipboardCheck, onSelect: () => promoteCardToLpr(card) }] : []),
                ...(canEdit
                  ? [
                      {
                        id: "edit",
                        label: "Изменить",
                        icon: Pencil,
                        onSelect: () => {
                          setEditingCardId(card.id);
                          setCardEditDraft({ title: card.title, body: card.body || "" });
                        }
                      },
                      "separator",
                      {
                        id: "delete",
                        label: "Удалить тему",
                        icon: Trash2,
                        tone: "danger",
                        onSelect: () => askDelete({ kind: "card", id: card.id, label: `темы «${card.title}»` })
                      }
                    ]
                  : [])
              ];
              return (
                <article
                  className={`agenda-card meet-topic${card.status === "done" ? " is-done" : ""}`}
                  data-priority={card.priority}
                  key={card.id}
                >
                  <div className="meet-topic__tags">
                    <Badge tone={categoryTone[card.category] || "neutral"} size="sm">
                      <span className="sr-only">Тема: </span>
                      {categories[card.category]?.label || "Тема"}
                    </Badge>
                    <Badge tone={priorityTone[card.priority] || "neutral"} size="sm">
                      <span className="sr-only">Приоритет: </span>
                      {priorityLabel(card.priority)}
                    </Badge>
                    <Badge size="sm">
                      <span className="sr-only">Автор: </span>
                      {sourceLabel(card.source)}
                    </Badge>
                    {lpr ? (
                      <Badge tone="accent" size="sm">
                        ЛПР · {lpr.title}
                      </Badge>
                    ) : null}
                    {card.status === "discussing" ? (
                      <Badge tone="warning" size="sm" dot>
                        В работе
                      </Badge>
                    ) : null}
                    {card.status === "done" ? (
                      <Badge tone="success" size="sm" icon={Check}>
                        Обсудили
                      </Badge>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div className="meet-topic__edit">
                      <TextInput
                        aria-label="Тема"
                        value={cardEditDraft.title}
                        onChange={(event) => setCardEditDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Тема"
                      />
                      <TextArea
                        aria-label="Контекст"
                        autoGrow
                        rows={3}
                        value={cardEditDraft.body}
                        onChange={(event) => setCardEditDraft((current) => ({ ...current, body: event.target.value }))}
                        placeholder="Контекст"
                      />
                    </div>
                  ) : (
                    <>
                      <h3 className="meet-topic__title">{card.title}</h3>
                      {card.body ? <p className="meet-topic__body">{card.body}</p> : null}
                    </>
                  )}

                  <div className="meet-topic__actions">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          icon={Check}
                          onClick={() => {
                            if (cardEditDraft.title.trim().length < 1) return;
                            updateCardFields(card.id, {
                              title: cardEditDraft.title.trim(),
                              body: cardEditDraft.body.trim()
                            });
                            setEditingCardId("");
                          }}
                        >
                          Сохранить
                        </Button>
                        <Button size="sm" variant="neutral" icon={X} onClick={() => setEditingCardId("")}>
                          Отмена
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant={card.status === "discussing" ? "tinted" : "neutral"}
                          aria-pressed={card.status === "discussing"}
                          onClick={() => updateCardStatus(card.id, card.status === "discussing" ? "todo" : "discussing")}
                        >
                          В работе
                        </Button>
                        <Button
                          size="sm"
                          variant={card.status === "done" ? "tinted" : "neutral"}
                          icon={Check}
                          aria-pressed={card.status === "done"}
                          onClick={() => updateCardStatus(card.id, card.status === "done" ? "todo" : "done")}
                        >
                          Обсудили
                        </Button>
                        <Button
                          size="sm"
                          variant="plain"
                          icon={actionAlreadyOpen ? Check : ChevronRight}
                          onClick={() => promoteCardToAction(card)}
                          disabled={actionAlreadyOpen}
                          title={actionAlreadyOpen ? "Такой шаг уже есть" : "Добавить в шаги"}
                        >
                          {actionAlreadyOpen ? "Уже в шагах" : "Добавить в шаги"}
                        </Button>
                        {menuItems.length > 0 ? (
                          <Menu
                            align="end"
                            label="Другие действия с темой"
                            items={menuItems}
                            trigger={<IconButton label="Другие действия" icon={MoreHorizontal} size="sm" className="meet-topic__more" />}
                          />
                        ) : null}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title={`Быстрые вопросы · ${meetingTypeLabel[meetingType]}`}
        hint="Нажмите, чтобы добавить вопрос в повестку."
      >
        <ListGroup>
          {seeds.map((seed) => {
            const seedAlreadyOpen = openCardTitleKeys.has(duplicateTitleKey(seed.title));
            return (
              <ListRow
                key={seed.title}
                className="meet-seed"
                title={seed.title}
                subtitle={seedAlreadyOpen ? "Такая тема уже есть в повестке" : undefined}
                onClick={() => addSeedCard(seed)}
                disabled={seedAlreadyOpen}
                trailing={seedAlreadyOpen ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
              />
            );
          })}
        </ListGroup>
      </Section>
    </div>
  );
}
