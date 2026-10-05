import { useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  LockKeyhole,
  MessageSquarePlus,
  UsersRound
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  ProgressBar,
  Section,
  Sheet,
  Stat,
  TabPanel,
  Tabs
} from "../ui";
import { meetingTypeLabel, pluralizeRu } from "../lib/shared.jsx";
import { useMediaQuery } from "../shell/Shell.jsx";
import PeoplePanel from "./meetings/PeoplePanel.jsx";
import PrepPanel from "./meetings/PrepPanel.jsx";
import AgendaView from "./meetings/AgendaView.jsx";
import PulseView from "./meetings/PulseView.jsx";
import OutcomesView from "./meetings/OutcomesView.jsx";
import { scoreTone, scoreWord, trendTone } from "./meetings/helpers.js";
import "../styles/screen-meetings.css";

/* Экран «1:1 встречи».

   Состояние и обработчики живут в App.jsx и приходят свойствами; в самом экране
   только локальный интерфейс: шторки выбора человека и подготовки, подтверждение удаления.

   Данные
     isAdmin, workspace, selectedPerson (или null), pageDescription
     people            участники после фильтра поиска; peopleSearch / setPeopleSearch
     teamScore, riskCount, openTopicsCount   сводка для левой колонки
     selectedScore, selectedPulse, readiness, briefing, person360Metrics
     personCards, filteredCards, personActions, unresolvedActions, personPrep
     lprById, activePersonLprs, openCardTitleKeys, openActionTitleKeys
     selectedMeetingDraft, summaryText, summaryPanelRef
   Вид
     activeView / setActiveView ("agenda" | "health" | "outcomes"), activeFilter / setActiveFilter
   Формы и правки (состояние остаётся в App)
     newCard, setNewCard, newCardTitleKey, newCardAlreadyOpen
     newAction, setNewAction, newActionTitleKey, newActionAlreadyOpen
     editingCardId, setEditingCardId, cardEditDraft, setCardEditDraft
     editingActionId, setEditingActionId, actionEditDraft, setActionEditDraft
     newManagerNote, setNewManagerNote, expandedMeetingId, setExpandedMeetingId
   Действия
     onSelectPerson(personId), onOpenSection(sectionId), showMeetingSummary(), buildSummary()
     addAgendaCard(event), addSeedCard(seed), updateCardFields, updateCardStatus,
     promoteCardToAction, promoteCardToLpr, deleteCard(id)
     pulseValue(metric), updatePulseDraft(metric, value), commitPulseValue(metric, value),
     updateMeetingDraft(text), clearMeetingDraft()
     addAction(event), toggleAction(id), updateActionFields(id, patch), deleteAction(id)
     togglePrep(id), updateNotes(text), toggleNewNoteTag(tag), addManagerNote(), deleteManagerNote(id)
*/
export default function MeetingsScreen(props) {
  const {
    isAdmin,
    workspace,
    selectedPerson,
    pageDescription,
    people,
    peopleSearch,
    setPeopleSearch,
    teamScore,
    riskCount,
    openTopicsCount,
    selectedScore,
    readiness,
    briefing,
    person360Metrics,
    personCards,
    unresolvedActions,
    activeView,
    setActiveView,
    onSelectPerson,
    onOpenSection,
    showMeetingSummary,
    deleteCard,
    deleteAction,
    deleteManagerNote
  } = props;

  const showPeople = useMediaQuery("(min-width: 1100px)");
  const showPrep = useMediaQuery("(min-width: 1280px)");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  // Удаление в два шага: сначала вопрос в окне, потом само удаление.
  const [pendingDelete, setPendingDelete] = useState(null);
  const askDelete = (intent) => setPendingDelete(intent);

  if (!selectedPerson) {
    return (
      <section className="meet" aria-label="1:1 встречи">
        <PageHeader title="1:1" subtitle={pageDescription} />
        <Card className="meet-empty-card meet-empty-card--page">
          <EmptyState
            icon={MessageSquarePlus}
            title="Нет участников 1:1"
            description="Добавьте участника, чтобы создать профиль 1:1."
            action={
              isAdmin ? (
                <Button icon={UsersRound} onClick={() => onOpenSection("team")}>
                  Открыть команду
                </Button>
              ) : null
            }
          />
        </Card>
      </section>
    );
  }

  const ctx = { ...props, askDelete };
  const hasPeopleColumn = isAdmin || workspace.people.length > 1;
  const canSwitch = workspace.people.length > 1;
  const tone = scoreTone(selectedScore);
  const openTopics = personCards.filter((card) => card.status !== "done").length;

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    if (kind === "card") deleteCard(id);
    else if (kind === "action") deleteAction(id);
    else if (kind === "note") deleteManagerNote(id);
  };

  const peoplePanelProps = {
    isAdmin,
    workspace,
    people,
    totalPeople: workspace.people.length,
    selectedId: selectedPerson.id,
    search: peopleSearch,
    onSearch: setPeopleSearch,
    teamScore,
    riskCount,
    openTopicsCount
  };

  const prepPanel = (variant) => <PrepPanel {...ctx} variant={variant} />;

  const tabs = [
    { id: "agenda", label: "Подготовка", icon: MessageSquarePlus, count: openTopics || undefined },
    { id: "health", label: "Встреча", icon: Activity },
    { id: "outcomes", label: "Итоги", icon: CheckCircle2, count: unresolvedActions.length || undefined }
  ];

  return (
    <section className={`meet${showPeople && hasPeopleColumn ? " meet--people" : ""}${showPrep ? " meet--prep" : ""}`} aria-label="1:1 встречи">
      <div className="meet__head">
        <PageHeader
          title={`1:1 с ${selectedPerson.meetingName}`}
          subtitle={pageDescription}
          actions={
            <Button icon={ClipboardCheck} onClick={showMeetingSummary}>
              Итоги встречи
            </Button>
          }
        />

        {(!showPeople && canSwitch) || !showPrep ? (
          <div className="meet__toolbar">
            {!showPeople && canSwitch ? (
              <button type="button" className="meet-switcher" onClick={() => setPeopleOpen(true)} aria-haspopup="dialog">
                <Avatar name={selectedPerson.name} size={40} decorative />
                <span className="meet-switcher__text">
                  <span className="meet-switcher__name">{selectedPerson.name}</span>
                  <span className="meet-switcher__sub">
                    {selectedPerson.role}
                    <span className="sr-only">. Сменить участника</span>
                  </span>
                </span>
                <ChevronsUpDown size={18} aria-hidden="true" className="meet-switcher__chev" />
              </button>
            ) : null}
            {!showPrep ? (
              <button type="button" className="meet-prepbtn" onClick={() => setPrepOpen(true)} aria-haspopup="dialog">
                <ClipboardList size={20} aria-hidden="true" />
                <span className="meet-prepbtn__text">
                  <span className="meet-prepbtn__title">Чек-лист и заметки</span>
                  <span className="meet-prepbtn__sub">Готовность к 1:1: {readiness}%</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="meet-switcher__chev" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="meet__grid">
        {showPeople && hasPeopleColumn ? (
          <aside className="meet__people" aria-label="Контекст встречи">
            <Section title="Участники 1:1" headingAs="h2">
              <PeoplePanel {...peoplePanelProps} onSelect={onSelectPerson} />
            </Section>
          </aside>
        ) : null}

        <div className="meet__main">
          <Card className="meet-hero" aria-label="Текущая встреча">
            <div className="meet-hero__text">
              <p className="meet-hero__when">
                <CalendarDays size={18} aria-hidden="true" />
                <span>{selectedPerson.nextMeeting}</span>
                <span className="meet-dot" aria-hidden="true" />
                <span>{selectedPerson.cadence}</span>
                {selectedPerson.meetingType && selectedPerson.meetingType !== "regular" ? (
                  <Badge tone="accent" size="sm">
                    {meetingTypeLabel[selectedPerson.meetingType]}
                  </Badge>
                ) : null}
              </p>
              <h2 className="meet-hero__title">{selectedPerson.managerFocus}</h2>
              {selectedPerson.lastSummary ? <p className="meet-hero__summary">{selectedPerson.lastSummary}</p> : null}
            </div>
            <div className="meet-hero__metrics">
              <div className="meet-metric">
                <span className="meet-metric__label">Пульс участника</span>
                <div className="meet-metric__row">
                  <strong className="meet-metric__value num">{selectedScore}</strong>
                  {selectedPerson.trend ? (
                    <Badge tone={trendTone(selectedPerson.trend)} size="sm" className="num">
                      {selectedPerson.trend}
                    </Badge>
                  ) : null}
                </div>
                <ProgressBar value={selectedScore} tone={tone} size="sm" aria-label="Пульс участника" />
                <span className="meet-metric__hint">{scoreWord(selectedScore)}</span>
              </div>
              <div className="meet-metric">
                <span className="meet-metric__label">Готовность к 1:1</span>
                <div className="meet-metric__row">
                  <strong className="meet-metric__value num">{readiness}%</strong>
                </div>
                <ProgressBar value={readiness} tone={readiness >= 85 ? "success" : "accent"} size="sm" aria-label="Готовность к 1:1" />
                <span className="meet-metric__hint">отмечено пунктов подготовки</span>
              </div>
            </div>
          </Card>

          <Section
            title="Сводка по участнику"
            className="meet-360"
            aria-label="Сводка по участнику"
            action={
              <div className="meet-privacy" role="group" aria-label="Приватность контекста">
                <Badge size="sm">Общее</Badge>
                {isAdmin ? (
                  <Badge size="sm" icon={LockKeyhole}>
                    Только лид
                  </Badge>
                ) : null}
                <Badge size="sm">Опросы агрегируются</Badge>
              </div>
            }
          >
            <Card className="meet-360__card">
              <dl className="meet-360__grid">
                {person360Metrics.map((metric) => (
                  <div className="meet-360__metric" key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd className="num">{metric.value}</dd>
                    <dd className="meet-360__detail">{metric.detail}</dd>
                  </div>
                ))}
              </dl>
              <ol className="meet-trace" aria-label="Связь работы">
                <li>1:1</li>
                <li>
                  <ChevronRight size={14} aria-hidden="true" />
                  <button type="button" onClick={() => onOpenSection("lprs")}>
                    ЛПР
                  </button>
                </li>
                <li>
                  <ChevronRight size={14} aria-hidden="true" />
                  <button type="button" onClick={() => onOpenSection("goals")}>
                    Цели
                  </button>
                </li>
                <li>
                  <ChevronRight size={14} aria-hidden="true" />
                  <button type="button" onClick={() => setActiveView("outcomes")}>
                    Шаги
                  </button>
                </li>
              </ol>
            </Card>
          </Section>

          {briefing ? (
            <Section
              title="Что важно знать перед встречей"
              className="meet-briefing"
              aria-label="Брифинг к встрече"
            >
              <div className="meet-briefing__grid">
                <Stat
                  label="Пульс за 4 недели"
                  value={`${briefing.delta > 0 ? "+" : ""}${briefing.delta}`}
                  tone={briefing.delta < -5 ? "warning" : briefing.delta > 5 ? "success" : "default"}
                  hint={
                    briefing.delta < -5
                      ? "заметное падение"
                      : briefing.delta < 0
                        ? "ниже"
                        : briefing.delta > 5
                          ? "стабильный рост"
                          : briefing.delta > 0
                            ? "выше"
                            : "без изменений"
                  }
                />
                <Stat
                  label="Открытые темы"
                  value={briefing.openTopics}
                  tone={briefing.urgentTopics > 0 ? "warning" : "default"}
                  hint={
                    briefing.urgentTopics > 0
                      ? `${briefing.urgentTopics} ${pluralizeRu(briefing.urgentTopics, ["срочная", "срочные", "срочных"])}`
                      : "ничего срочного"
                  }
                />
                <Stat
                  label="Открытые шаги"
                  value={briefing.openActionsCount}
                  tone={briefing.openActionsCount > 5 ? "warning" : "default"}
                  hint={
                    briefing.openActionsCount === 0 ? "нет хвостов" : briefing.openActionsCount > 5 ? "хвост накапливается" : "в работе"
                  }
                />
                <Stat
                  label="Темы от участника"
                  value={`${briefing.employeeRatio}%`}
                  tone={briefing.employeeRatio < 40 && personCards.length > 2 ? "warning" : "default"}
                  hint={personCards.length === 0 ? "нет данных" : briefing.employeeRatio < 40 ? "лид доминирует" : "баланс ок"}
                />
                {briefing.oncallWeeks > 0 ? (
                  <>
                    <Stat
                      label="On-call за 4 недели"
                      value={`${briefing.avgPagesPerWeek}/нед`}
                      tone={briefing.avgPagesPerWeek > 8 ? "warning" : "default"}
                      hint={
                        briefing.avgPagesPerWeek > 8
                          ? "высокий шум, нужен разбор"
                          : briefing.avgPagesPerWeek > 4
                            ? "среднее, выше нормы"
                            : "ниже порога риска"
                      }
                    />
                    <Stat
                      label="Сон"
                      value={briefing.totalSleepNights}
                      tone={briefing.totalSleepNights > 4 ? "warning" : "default"}
                      hint={
                        briefing.totalSleepNights === 0
                          ? "без ночных срабатываний"
                          : `${pluralizeRu(briefing.totalSleepNights, ["ночь", "ночи", "ночей"])} прерывали`
                      }
                    />
                  </>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Tabs tabs={tabs} value={activeView} onChange={setActiveView} ariaLabel="Разделы 1:1" className="meet-tabs">
            <TabPanel id="agenda">{activeView === "agenda" ? <AgendaView {...ctx} /> : null}</TabPanel>
            <TabPanel id="health">{activeView === "health" ? <PulseView {...ctx} /> : null}</TabPanel>
            <TabPanel id="outcomes">{activeView === "outcomes" ? <OutcomesView {...ctx} /> : null}</TabPanel>
          </Tabs>
        </div>

        {showPrep ? (
          <aside className="meet__prep" aria-label="Подготовка">
            {prepPanel("column")}
          </aside>
        ) : null}
      </div>

      <Sheet open={peopleOpen && !showPeople} onClose={() => setPeopleOpen(false)} title="Участники 1:1" className="meet-sheet">
        <PeoplePanel
          {...peoplePanelProps}
          onSelect={(personId) => {
            setPeopleOpen(false);
            onSelectPerson(personId);
          }}
        />
      </Sheet>

      <Sheet open={prepOpen && !showPrep} onClose={() => setPrepOpen(false)} title="Подготовка к встрече" className="meet-sheet">
        {prepPanel("sheet")}
      </Sheet>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        tone="danger"
        title={pendingDelete ? `Удалить ${pendingDelete.label}?` : ""}
        description="Это действие нельзя отменить."
        confirmLabel="Подтвердить удаление"
        cancelLabel="Отмена"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
