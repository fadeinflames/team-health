import { useMemo } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ListChecks,
  MessageSquare,
  Sparkles,
  Target,
  UserPlus,
  UsersRound
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ListGroup,
  ListRow,
  PageHeader,
  ProgressBar,
  ProgressRing,
  Section,
  Sparkline,
  Stat
} from "../ui";
import { countLabel, scorePulse } from "../lib/shared.jsx";
import { useMediaQuery } from "../shell/Shell.jsx";
import "../styles/screen-home.css";

// Тон по значению пульса: те же пороги, что и во всём приложении (64 и 76).
function scoreTone(score) {
  if (score < 64) return "danger";
  if (score < 76) return "warning";
  return "success";
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function formatToday(date) {
  const text = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Средний пульс команды по неделям: из истории берём последние точки по датам
// и усредняем оценку по тем, кто в сводке. Меньше двух точек тренда не даёт.
function buildTrend(history, personIds) {
  const byDate = new Map();
  for (const entry of history || []) {
    if (!personIds.has(entry.personId) || !entry.capturedAt) continue;
    const day = String(entry.capturedAt).slice(0, 10);
    const bucket = byDate.get(day) || [];
    bucket.push(scorePulse(entry));
    byDate.set(day, bucket);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([, scores]) => Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length));
}

const ITEM_ICON = { Тема: MessageSquare, Шаг: ListChecks, Сигнал: AlertTriangle };

export default function HomeScreen({
  displayName,
  isAdmin,
  workspace,
  dashboardPeople,
  hasDashboardPeople,
  dashboardScore,
  dashboardSnapshots,
  peopleInRiskZone,
  urgentCount,
  openCardsCount,
  openActionsCount,
  upcomingMeetings,
  actionInboxItems,
  myPulse,
  createLoginPanel,
  onOpenPerson,
  onOpenSection,
  onCreateLogin
}) {
  const now = new Date();
  const compact = useMediaQuery("(max-width: 760px)");
  const firstName = String(displayName || "").trim().split(/\s+/)[0] || "";
  const personIds = useMemo(() => new Set(dashboardPeople.map((person) => person.id)), [dashboardPeople]);
  const trend = useMemo(() => buildTrend(workspace?.pulseHistory, personIds), [workspace?.pulseHistory, personIds]);
  const goals = useMemo(
    () => (workspace?.goals || []).filter((goal) => personIds.has(goal.personId) && goal.status === "active"),
    [workspace?.goals, personIds]
  );
  const goalsAverage = goals.length ? Math.round(goals.reduce((sum, goal) => sum + (Number(goal.progress) || 0), 0) / goals.length) : 0;

  // Люди, которым стоит уделить внимание первыми: низкий пульс, срочные темы, открытые шаги.
  const peopleByAttention = useMemo(
    () =>
      [...dashboardSnapshots].sort((a, b) => {
        const weight = (item) => (item.score < 64 ? 80 : 0) + item.urgentCards * 18 + item.openActions * 4 + (100 - item.readiness) / 10;
        return weight(b) - weight(a) || a.score - b.score;
      }),
    [dashboardSnapshots]
  );

  const nextMeeting = upcomingMeetings[0] || null;
  const tone = scoreTone(dashboardScore);
  const trendDelta = trend.length > 1 ? trend[trend.length - 1] - trend[0] : null;

  if (!hasDashboardPeople) {
    return (
      <section className="home" aria-label="Сводка команды">
        <PageHeader
          title={`${greetingFor(now)}${firstName ? `, ${firstName}` : ""}`}
          subtitle={formatToday(now)}
        />
        <Card className="home-empty">
          <EmptyState
            icon={isAdmin ? UsersRound : Sparkles}
            title={isAdmin ? "Команда пока пустая" : "Профиль 1:1 пока не настроен"}
            description={
              isAdmin
                ? "Добавьте участников и логины, после этого здесь появятся ближайшие 1:1, пульс, срочные темы и следующие шаги."
                : "Когда лидер добавит ваш профиль, здесь появятся темы, пульс, цели и договорённости."
            }
            action={
              isAdmin ? (
                <div className="home-empty__actions">
                  <Button icon={UserPlus} onClick={onCreateLogin}>
                    Создать логин
                  </Button>
                  <Button variant="neutral" icon={UsersRound} onClick={() => onOpenSection("team")}>
                    Открыть команду
                  </Button>
                </div>
              ) : null
            }
          />
        </Card>
        {isAdmin && createLoginPanel}
      </section>
    );
  }

  const subtitle = isAdmin
    ? `${formatToday(now)} · ${countLabel(peopleInRiskZone, ["человек в зоне внимания", "человека в зоне внимания", "человек в зоне внимания"])}`
    : formatToday(now);

  return (
    <section className="home" aria-label="Сводка команды">
      <PageHeader
        title={`${greetingFor(now)}${firstName ? `, ${firstName}` : ""}`}
        subtitle={subtitle}
        actions={
          <>
            {isAdmin && (
              <Button variant="neutral" icon={ClipboardList} onClick={() => onOpenSection("surveys")}>
                Запустить опрос
              </Button>
            )}
            {nextMeeting && (
              <Button icon={CalendarDays} onClick={() => onOpenPerson(nextMeeting.person.id)}>
                Подготовить 1:1
              </Button>
            )}
          </>
        }
      />

      <div className="home-top">
        <Card className="home-pulse" aria-label={isAdmin ? "Пульс команды" : "Мой пульс"}>
          <CardHeader
            title={isAdmin ? "Пульс команды" : "Мой пульс"}
            subtitle={isAdmin ? `среднее по ${countLabel(dashboardPeople.length, ["участнику", "участникам", "участникам"])}` : "по вашему профилю"}
            icon={Sparkles}
            iconTone={tone}
          />
          <div className="home-pulse__body">
            <ProgressRing value={dashboardScore} size={compact ? 112 : 152} stroke={compact ? 10 : 13} tone={tone} label={isAdmin ? "Пульс команды" : "Мой пульс"}>
              <span className="home-pulse__score num">{dashboardScore}</span>
              <span className="home-pulse__of">из 100</span>
            </ProgressRing>
            <div className="home-pulse__side">
              {trend.length > 1 ? (
                <>
                  <Sparkline data={trend} width={compact ? 168 : 260} height={compact ? 64 : 92} tone={tone} label={`Тренд пульса: от ${trend[0]} до ${trend[trend.length - 1]}`} />
                  <p className="home-pulse__trend">
                    {trendDelta === 0
                      ? `Без изменений за ${countLabel(trend.length, ["неделю", "недели", "недель"])}`
                      : `${trendDelta > 0 ? "+" : "−"}${Math.abs(trendDelta)} за ${countLabel(trend.length, ["неделю", "недели", "недель"])}`}
                  </p>
                </>
              ) : (
                <p className="home-pulse__trend">История пульса появится после нескольких недель работы.</p>
              )}
              {isAdmin ? (
                <Badge tone={peopleInRiskZone ? "warning" : "success"} icon={peopleInRiskZone ? AlertTriangle : CheckCircle2}>
                  {peopleInRiskZone ? `${peopleInRiskZone} из ${dashboardPeople.length} в зоне внимания` : "Все в порядке"}
                </Badge>
              ) : myPulse ? (
                <div className="home-pulse__metrics">
                  {[
                    ["Энергия", myPulse.energy],
                    ["Нагрузка", myPulse.load],
                    ["Ясность", myPulse.clarity],
                    ["Доверие", myPulse.trust]
                  ].map(([name, value]) => (
                    <div key={name} className="home-pulse__metric">
                      <span>{name}</span>
                      <ProgressBar value={Number(value) || 0} max={10} size="sm" aria-label={`${name}: ${Number(value) || 0} из 10`} />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="home-stats">
          <Stat
            icon={AlertTriangle}
            iconTone={urgentCount ? "warning" : "success"}
            label="Срочные темы"
            value={urgentCount}
            hint={urgentCount ? "риски и блокеры" : "срочного нет"}
          />
          <Stat icon={MessageSquare} label="Открытые темы" value={openCardsCount} hint="на ближайших 1:1" />
          <Stat icon={ListChecks} iconTone="info" label="Шаги в работе" value={openActionsCount} hint="требуют выполнения" />
          <Stat
            icon={Target}
            iconTone="success"
            label="Цели"
            value={goals.length}
            hint={goals.length ? `средний прогресс ${goalsAverage}%` : "активных целей нет"}
          />
        </div>
      </div>

      <div className="home-columns">
        <Section
          size="lg"
          title="Ближайшие 1:1"
          action={
            <Button variant="plain" size="sm" onClick={() => onOpenSection("meetings")}>
              Все встречи
            </Button>
          }
        >
          {upcomingMeetings.length ? (
            <ListGroup>
              {upcomingMeetings.slice(0, 4).map(({ person, readiness, openActions, urgentCards }) => (
                <ListRow
                  key={person.id}
                  leading={<Avatar name={person.name} size={36} decorative />}
                  title={person.name}
                  subtitle={`${person.nextMeeting || "время не задано"} · ${person.cadence}`}
                  meta={
                    <Badge tone={readiness >= 85 ? "success" : readiness >= 50 ? "warning" : "neutral"}>
                      готовность {readiness}%
                    </Badge>
                  }
                  chevron
                  onClick={() => onOpenPerson(person.id)}
                >
                  {(urgentCards > 0 || openActions > 0) && (
                    <span className="home-row-hint">
                      {urgentCards > 0 && countLabel(urgentCards, ["срочная тема", "срочные темы", "срочных тем"])}
                      {urgentCards > 0 && openActions > 0 && " · "}
                      {openActions > 0 && countLabel(openActions, ["шаг", "шага", "шагов"])}
                    </span>
                  )}
                </ListRow>
              ))}
            </ListGroup>
          ) : (
            <Card>
              <EmptyState icon={CalendarDays} title="Ближайших встреч нет" description="Когда у участников появятся даты 1:1, они покажутся здесь." />
            </Card>
          )}
        </Section>

        <Section size="lg" title="Что требует решения">
          {actionInboxItems.length ? (
            <ListGroup>
              {actionInboxItems.slice(0, 5).map((item) => {
                const Icon = ITEM_ICON[item.label] || MessageSquare;
                return (
                  <ListRow
                    key={item.id}
                    icon={Icon}
                    iconTone={item.tone === "risk" ? "danger" : item.tone === "watch" ? "warning" : "neutral"}
                    title={item.title}
                    subtitle={item.meta}
                    chevron
                    onClick={() => onOpenPerson(item.personId)}
                  />
                );
              })}
            </ListGroup>
          ) : (
            <Card>
              <EmptyState icon={CheckCircle2} title="Всё под контролем" description="Срочных тем и просроченных шагов сейчас нет." />
            </Card>
          )}
        </Section>
      </div>

      {isAdmin && (
        <Section size="lg" title="Команда" hint="Сначала те, кому нужно внимание">
          <div className="home-people">
            {peopleByAttention.slice(0, 12).map(({ person, score, openCards, openActions, urgentCards, readiness }) => (
              <Card key={person.id} interactive className="home-person" onClick={() => onOpenPerson(person.id)} aria-label={`${person.name}, пульс ${score}`}>
                <div className="home-person__head">
                  <Avatar name={person.name} size={44} decorative status={score < 64 ? "busy" : undefined} />
                  <div className="home-person__id">
                    <strong>{person.name}</strong>
                    <span>{person.role}</span>
                  </div>
                  <ProgressRing value={score} size={44} stroke={5} tone={scoreTone(score)} label={`Пульс ${score}`}>
                    <span className="home-person__score num">{score}</span>
                  </ProgressRing>
                </div>
                <p className="home-person__meta">
                  {countLabel(openCards, ["тема", "темы", "тем"])} · {countLabel(openActions, ["шаг", "шага", "шагов"])}
                  {urgentCards > 0 && <Badge tone="danger" size="sm">срочных: {urgentCards}</Badge>}
                </p>
                <ProgressBar value={readiness} size="sm" aria-label={`Готовность к 1:1: ${readiness}%`} />
                <span className="home-person__go" aria-hidden="true">
                  <ChevronRight size={16} />
                </span>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {isAdmin && createLoginPanel}
    </section>
  );
}
