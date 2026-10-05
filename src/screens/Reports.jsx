// Экран «Отчёты»: аналитика команды, тепловая карта, карта компетенций, графики, CSV.
//
// Контракт свойств (все данные считает App.jsx, экран только показывает):
//   isAdmin                  boolean   лид/админ видит CSV, форму отчёта и здоровье повестки
//   people                   Person[]  workspace.people (список для формы отчёта)
//   reportsData              object    useMemo-сводка из App (тренды, темы, цели, компетенции)
//   teamHeatmapRows          object[]  строки тепловой карты: { person, score, energy, load, clarity, trust, openActions }
//   reportRecommendations    object[]  { id, tone: "risk"|"watch", title, action, personId?, section? }
//   competencyDraft          object    черновик формы отчёта { personId, title, roleContext, rows }
//   setCompetencyDraft       function  setState черновика (принимает функцию-обновление)
//   competencyFormError      string    ошибка формы (formErrors["competency-report"])
//   onSubmitCompetency       (event)   отправка формы отчёта
//   onExportCsv              ()        выгрузка матрицы компетенций в CSV
//   onImportToLpr            (assessment) перенос зон роста в ЛПР
//   onDeleteAssessment       (assessmentId) удаление отчёта (подтверждение внутри экрана)
//   onOpenPerson             (personId)  открыть человека (selectPerson)
//   onOpenSection            (sectionId) перейти в раздел
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  MessageSquarePlus,
  Target,
  UsersRound
} from "lucide-react";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ListGroup,
  ListRow,
  PageHeader,
  ProgressBar,
  Section,
  Segmented,
  Stat
} from "../ui";
import { countLabel, pluralizeRu, pulseSeries } from "../lib/shared.jsx";
import { useMediaQuery } from "../shell/Shell.jsx";
import { BarList, TrendChart, formatNumber } from "./reports/charts.jsx";
import Heatmap, { HeatmapLegend, scoreTone } from "./reports/Heatmap.jsx";
import { CompetencyForm, CompetencyMap, LatestAssessments } from "./reports/Competencies.jsx";
import "../styles/screen-reports.css";

const PERIODS = [
  { value: "4", label: "4 недели" },
  { value: "8", label: "8 недель" },
  { value: "all", label: "Всё время" }
];

// Цвета рядов пульса: из токенов категорий, не из hex в данных.
const SERIES_TONE = { energy: "cat1", load: "cat4", clarity: "cat5", trust: "cat6" };
const CATEGORY_TONES = ["cat1", "cat2", "cat3", "cat4", "cat5", "cat6"];
const PRIORITY_TONES = ["danger", "warning", "success"];
const SOURCE_TONES = ["accent", "cat5"];
const GOAL_TONES = ["danger", "warning", "info", "success"];

const withTones = (data, tones) => data.map((item, index) => ({ label: item.label, value: item.value, tone: tones[index % tones.length] }));

function sliceTail(values, size) {
  return size === "all" ? values : values.slice(-Number(size));
}

export default function ReportsScreen({
  isAdmin,
  people,
  reportsData,
  teamHeatmapRows,
  reportRecommendations,
  competencyDraft,
  setCompetencyDraft,
  competencyFormError,
  onSubmitCompetency,
  onExportCsv,
  onImportToLpr,
  onDeleteAssessment,
  onOpenPerson,
  onOpenSection
}) {
  const compact = useMediaQuery("(max-width: 760px)");
  const [period, setPeriod] = useState("8");
  const [hidden, setHidden] = useState(() => new Set());
  const data = reportsData;

  const weeks = data.trendLabels.length;
  const labels = useMemo(() => sliceTail(data.trendLabels, period), [data.trendLabels, period]);
  const pulsePoints = useMemo(() => sliceTail(data.compositeScorePoints, period), [data.compositeScorePoints, period]);
  const components = useMemo(
    () =>
      data.trendSeries.map((series) => ({
        id: series.id,
        label: series.label,
        tone: SERIES_TONE[series.id] || "accent",
        points: sliceTail(series.points, period)
      })),
    [data.trendSeries, period]
  );
  const visibleComponents = components.filter((series) => !hidden.has(series.id));

  const toggleSeries = (id) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (components.length - next.size > 1) next.add(id);
      return next;
    });

  const openTopics = data.priorityData.reduce((sum, item) => sum + item.value, 0);
  const urgentTopics = data.priorityData[0]?.value || 0;
  const delta = data.trendDelta;
  const pulseTone = scoreTone(data.latestAvg);
  const statTrend = data.compositeScorePoints.slice(-12);
  const showCompetencies = isAdmin || data.competencyMatrixRows.length > 0;
  const description = isAdmin
    ? "Тренды по пульсу, темам, целям, авторству повестки и карте компетенций."
    : "Ваши тренды по пульсу, темам, целям, компетенциям и договорённостям между встречами.";

  return (
    <section className="rep" aria-label="Отчёты">
      <PageHeader title="Отчёты" subtitle={description} />

      <div className="rep-stats">
        <Stat
          icon={HeartPulse}
          iconTone={pulseTone}
          tone="default"
          label="Пульс сейчас"
          value={data.latestAvg}
          trend={statTrend.length > 1 ? statTrend : undefined}
          delta={delta ? `${delta > 0 ? "+" : "−"}${Math.abs(delta)}` : undefined}
          deltaTone={delta > 0 ? "success" : delta < 0 ? "danger" : "neutral"}
          hint={delta ? "за 4 недели" : "без изменений"}
        />
        <Stat icon={UsersRound} iconTone="neutral" label="Участников" value={data.peopleCount} hint="в сводке" />
        <Stat
          icon={AlertTriangle}
          iconTone={urgentTopics ? "warning" : "success"}
          label="Открытых тем"
          value={openTopics}
          hint={`${urgentTopics} срочных`}
        />
        <Stat
          icon={CheckCircle2}
          iconTone="success"
          label="Закрыто шагов"
          value={`${data.completionPct}%`}
          hint={`${data.actionsDone} из ${data.actionsDone + data.actionsOpen}`}
        />
        <Stat icon={Target} label="Активных целей" value={data.activeGoalsCount} hint="в работе" />
        <Stat
          icon={ClipboardCheck}
          iconTone="info"
          label="Отчётов навыков"
          value={data.assessmentCount}
          hint={`${data.competencyMatrixRows.length} ${pluralizeRu(data.competencyMatrixRows.length, ["компетенция", "компетенции", "компетенций"])}`}
        />
      </div>

      <Section
        size="lg"
        className="rep-dyn"
        title="Динамика"
        action={
          weeks > 4 ? <Segmented size="sm" ariaLabel="Период графиков" options={PERIODS} value={period} onChange={setPeriod} /> : null
        }
      >
        <div className="rep-grid rep-grid--2">
          <Card className="rep-card">
            <CardHeader icon={Activity} title="Пульс команды (0–100) по неделям" subtitle={weeks ? `сейчас ${data.latestAvg}` : undefined} />
            <TrendChart
              series={[{ id: "pulse", label: "Пульс", tone: "accent", points: pulsePoints }]}
              labels={labels}
              min={0}
              max={100}
              fill
              caption="Пульс команды по неделям"
            />
          </Card>

          <Card className="rep-card">
            <CardHeader icon={Activity} iconTone="info" title="Энергия / нагрузка / ясность / доверие (1–10)" subtitle="Среднее по команде" />
            <TrendChart
              series={visibleComponents}
              labels={labels}
              min={0}
              max={10}
              ticks={[0, 2, 4, 6, 8, 10]}
              caption="Компоненты пульса по неделям"
            />
            <ul className="rep-legend-chips" aria-label="Показать или скрыть ряды">
              {components.map((series) => {
                const last = series.points[series.points.length - 1];
                const off = hidden.has(series.id);
                return (
                  <li key={series.id}>
                    <button
                      type="button"
                      className={`rep-series rep-tone--${series.tone}`}
                      aria-pressed={!off}
                      onClick={() => toggleSeries(series.id)}
                    >
                      <i className="rep-dot" aria-hidden="true" />
                      <span>{series.label}</span>
                      <b className="num">{last == null ? "—" : formatNumber(last)}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </Section>

      <div className="rep-grid rep-grid--heat">
        <Card className="rep-card">
          <CardHeader icon={BarChart3} iconTone="warning" title="Где проседает команда" subtitle="Сначала те, у кого пульс ниже" />
          <Heatmap rows={teamHeatmapRows} compact={compact} onOpenPerson={onOpenPerson} />
          {teamHeatmapRows.length > 0 && <HeatmapLegend />}
        </Card>

        <Card className="rep-card" padded={false}>
          <div className="rep-card__head">
            <CardHeader icon={ClipboardCheck} title="Куда вложить усилие" subtitle="Рекомендации по данным команды" />
          </div>
          {reportRecommendations.length ? (
            <ListGroup inset={false}>
              {reportRecommendations.map((item) => (
                <ListRow
                  key={item.id}
                  icon={item.tone === "risk" ? AlertTriangle : ClipboardCheck}
                  iconTone={item.tone === "risk" ? "danger" : "warning"}
                  title={item.title}
                  subtitle={item.action}
                  chevron
                  onClick={() => (item.personId ? onOpenPerson(item.personId) : onOpenSection(item.section || "reports"))}
                />
              ))}
            </ListGroup>
          ) : (
            <EmptyState icon={CheckCircle2} title="Всё в порядке" description="Критичных рекомендаций сейчас нет." />
          )}
        </Card>
      </div>

      <Section size="lg" title="Темы и цели">
        <div className="rep-grid rep-grid--4">
          <Card className="rep-card">
            <CardHeader icon={MessageSquarePlus} title="По категориям" subtitle="Открытые темы" />
            <BarList data={withTones(data.categoriesData, CATEGORY_TONES)} caption="Темы по категориям" />
          </Card>
          <Card className="rep-card">
            <CardHeader icon={AlertTriangle} iconTone="warning" title="По приоритетам" subtitle="Открытые темы" />
            <BarList data={withTones(data.priorityData, PRIORITY_TONES)} caption="Темы по приоритетам" />
          </Card>
          <Card className="rep-card">
            <CardHeader icon={UsersRound} iconTone="info" title="По автору" subtitle="Кто поднял тему" />
            <BarList data={withTones(data.sourceData, SOURCE_TONES)} caption="Темы по автору" />
          </Card>
          <Card className="rep-card">
            <CardHeader icon={Target} iconTone="success" title="Прогресс активных" subtitle="Цели по доле выполнения" />
            <BarList data={withTones(data.goalBuckets, GOAL_TONES)} caption="Цели по прогрессу" />
          </Card>
        </div>
      </Section>

      {showCompetencies && (
        <Section size="lg" title="Компетенции">
          <CompetencyMap data={data} isAdmin={isAdmin} compact={compact} onOpenPerson={onOpenPerson} onExportCsv={onExportCsv} />
          <LatestAssessments
            items={data.latestCompetencyAssessments}
            isAdmin={isAdmin}
            onImportToLpr={onImportToLpr}
            onDeleteAssessment={onDeleteAssessment}
          />
          {isAdmin && (
            <CompetencyForm
              people={people}
              draft={competencyDraft}
              onDraftChange={setCompetencyDraft}
              error={competencyFormError}
              onSubmit={onSubmitCompetency}
            />
          )}
        </Section>
      )}

      {isAdmin && data.authorRatioByPerson.length > 0 && (
        <Section
          size="lg"
          title="Здоровье повестки"
          hint="Если на 1:1 более половины тем приходит от лида, это ранний сигнал, что встреча превращается в статус-апдейт."
        >
          {data.authorRatioByPerson.some((row) => row.total > 0) ? (
            <ListGroup>
              {data.authorRatioByPerson
                .filter((row) => row.total > 0)
                .map((row) => {
                  const warn = row.total >= 3 && row.ratio !== null && row.ratio < 50;
                  return (
                    <ListRow
                      key={row.person.id}
                      leading={<Avatar name={row.person.name} size={36} decorative />}
                      title={row.person.name}
                      subtitle={`${countLabel(row.total, ["тема", "темы", "тем"])}, от участника ${row.ratio === null ? "—" : `${row.ratio}%`}`}
                      meta={
                        warn ? (
                          <Badge tone="warning" icon={AlertTriangle}>
                            ведёт лид
                          </Badge>
                        ) : row.ratio !== null ? (
                          <Badge tone="success">{row.ratio}%</Badge>
                        ) : null
                      }
                    >
                      <ProgressBar
                        size="sm"
                        value={row.ratio || 0}
                        tone={warn ? "warning" : "accent"}
                        aria-label={`Доля тем от участника: ${row.ratio === null ? "нет данных" : `${row.ratio}%`}`}
                      />
                    </ListRow>
                  );
                })}
            </ListGroup>
          ) : (
            <Card>
              <EmptyState icon={MessageSquarePlus} title="Тем пока нет" description="Темы появятся, когда участники начнут их добавлять." />
            </Card>
          )}
        </Section>
      )}
    </section>
  );
}
