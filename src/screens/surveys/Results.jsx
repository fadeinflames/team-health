// Результаты опроса для лида: по вопросу своя «лунка» с графиком и числами.
// Цвет никогда не единственный носитель смысла: у каждого столбика есть число.
import { BarChart3, Copy, Lock, Plus } from "lucide-react";
import { Badge, Button, ProgressBar } from "../../ui";
import { formatRuDate, pluralizeRu, surveyQuestionTypeLabel } from "../../lib/shared.jsx";
import { formatAvg, percentOf } from "./helpers.js";

function ScaleChart({ distribution, avg, count }) {
  const top = Math.max(1, ...distribution.map((item) => item.value));
  const summary = distribution.map((item) => `${item.label}: ${item.value}`).join(", ");
  return (
    <div className="sv-scale-result">
      <div className="sv-scale-result__avg">
        <span className="sv-scale-result__num num">{formatAvg(avg)}</span>
        <span className="sv-scale-result__of">
          среднее из 10
          <br />
          {count} {pluralizeRu(count, ["ответ", "ответа", "ответов"])}
        </span>
      </div>
      <div className="sv-dist" role="img" aria-label={`Распределение оценок. ${summary}`}>
        {distribution.map((item) => (
          <div className="sv-dist__col" key={item.label}>
            <span className="sv-dist__value num">{item.value}</span>
            <span className="sv-dist__track">
              <span className="sv-dist__bar" style={{ height: `${(item.value / top) * 100}%` }} data-empty={item.value === 0 || undefined} />
            </span>
            <span className="sv-dist__label num">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChoiceBars({ distribution, total }) {
  return (
    <ul className="sv-bars">
      {distribution.map((item) => (
        <li className="sv-bars__item" key={item.label}>
          <div className="sv-bars__row">
            <span className="sv-bars__label">{item.label}</span>
            <span className="sv-bars__value num">
              {item.value} · {percentOf(item.value, total)}%
            </span>
          </div>
          <ProgressBar value={item.value} max={Math.max(1, total)} size="sm" aria-label={`${item.label}: ${item.value} из ${total}`} />
        </li>
      ))}
    </ul>
  );
}

function Note({ icon: Icon = Lock, children }) {
  return (
    <p className="sv-lock">
      <Icon size={18} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function QuestionResult({ question, stats, index }) {
  let body;
  if (stats?.hidden) {
    body = (
      <Note>
        Недостаточно ответов для показа этого вопроса (нужно не меньше {stats.minResponses}). Сейчас: {stats.count}.
      </Note>
    );
  } else if (!stats || stats.count === 0) {
    body = <p className="sv-empty-line">Ответов пока нет.</p>;
  } else if (question.type === "scale") {
    body = <ScaleChart distribution={stats.distribution} avg={stats.avg} count={stats.count} />;
  } else if (question.type === "single" || question.type === "multi") {
    body = <ChoiceBars distribution={stats.distribution} total={stats.count} />;
  } else if (stats.redacted) {
    body = (
      <Note>
        Ответов: <strong>{stats.count}</strong>. {question.type === "date" ? "Ответы скрыты для анонимности." : "Тексты скрыты для анонимности."}
      </Note>
    );
  } else if (question.type === "date") {
    body = (
      <ul className="sv-samples sv-samples--dates">
        {stats.samples.map((date, i) => (
          <li key={i}>{formatRuDate(date)}</li>
        ))}
      </ul>
    );
  } else {
    body = (
      <ul className="sv-samples">
        {stats.samples.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    );
  }

  return (
    <section className="sv-result" aria-label={`Результаты вопроса ${index + 1}`}>
      <header className="sv-result__head">
        <Badge size="sm">{surveyQuestionTypeLabel[question.type]}</Badge>
        <h4 className="sv-result__title">{question.prompt}</h4>
      </header>
      {body}
    </section>
  );
}

export default function Results({ survey, onOpenReports, onRepeat, onNewSurvey }) {
  const aggregate = survey.aggregate;
  return (
    <div className="sv-results">
      {aggregate?.hidden ? (
        <div className="sv-hidden">
          <Note>
            Анонимные результаты скрыты до {aggregate.minResponses} ответов. Сейчас: {aggregate.count}.
          </Note>
          <ProgressBar
            value={aggregate.count}
            max={aggregate.minResponses}
            size="sm"
            aria-label={`Собрано ответов: ${aggregate.count} из ${aggregate.minResponses}`}
          />
        </div>
      ) : (
        <div className="sv-results__grid">
          {survey.questions.map((question, index) => (
            <QuestionResult key={question.id} question={question} stats={aggregate?.perQuestion?.[question.id]} index={index} />
          ))}
        </div>
      )}

      <section className="sv-next" aria-label="Действия после опроса">
        <div className="sv-next__text">
          <strong>Превратите сигнал в следующий шаг</strong>
          <span>Посмотрите тренды в отчётах или повторите опрос через пару недель.</span>
        </div>
        <div className="sv-next__buttons">
          <Button variant="neutral" icon={BarChart3} onClick={onOpenReports}>
            В отчёты
          </Button>
          <Button variant="neutral" icon={Copy} onClick={onRepeat}>
            Повторить
          </Button>
          <Button variant="tinted" icon={Plus} onClick={onNewSurvey}>
            Новый опрос
          </Button>
        </div>
      </section>
    </div>
  );
}
