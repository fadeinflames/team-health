// Прохождение опроса: по блоку на вопрос, крупные зоны нажатия, прогресс сверху.
// Ответы-черновики (draft) хранятся в App, сохранённые (saved) приходят с сервера.
import { useState } from "react";
import { Check, CircleAlert, Send } from "lucide-react";
import { Button, ProgressBar, TextArea, TextInput } from "../../ui";
import { isAnswered } from "./helpers.js";

function Legend({ id, index, question }) {
  return (
    <div className="sv-qa__legend" id={id}>
      <span className="sv-qa__num num" aria-hidden="true">
        {index + 1}
      </span>
      <span className="sv-qa__prompt">
        {question.prompt}
        {question.required && (
          <>
            <em aria-hidden="true"> *</em>
            <span className="sr-only"> (обязательно)</span>
          </>
        )}
      </span>
    </div>
  );
}

function ScaleInput({ name, labelledBy, value, onChange }) {
  return (
    <div className="sv-scale" role="radiogroup" aria-labelledby={labelledBy}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <label className="sv-scale__item" key={n}>
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
          <span className="sv-scale__label num">{n}</span>
        </label>
      ))}
    </div>
  );
}

function ChoiceRow({ type, name, checked, onChange, children }) {
  return (
    <label className={`sv-choice sv-choice--${type}`} data-checked={checked || undefined}>
      <input type={type === "single" ? "radio" : "checkbox"} name={name} checked={checked} onChange={onChange} />
      <span className="sv-choice__mark" aria-hidden="true">
        {type === "multi" && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="sv-choice__text">{children}</span>
    </label>
  );
}

export default function Answer({ survey, draft, onPatch, onSubmit }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const myResponse = survey.myResponse;

  const answerFor = (question) => draft[question.id] || myResponse?.answers?.[question.id] || null;
  const total = survey.questions.length;
  const answered = survey.questions.filter((question) => isAnswered(question, answerFor(question))).length;

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await onSubmit();
    } catch (failure) {
      setError(failure?.message || "Не удалось сохранить ответы");
      setBusy(false);
    }
  }

  return (
    <form className="sv-fill" onSubmit={handleSubmit} aria-label={`Ответы на опрос «${survey.title}»`} noValidate>
      <ProgressBar
        className="sv-fill__progress"
        label={`Отвечено ${answered} из ${total}`}
        value={answered}
        max={Math.max(1, total)}
        size="sm"
      />

      {survey.questions.map((question, index) => {
        const answer = answerFor(question);
        const legendId = `${survey.id}-${question.id}-legend`;
        const name = `${survey.id}-${question.id}`;
        let control;
        if (question.type === "scale") {
          control = <ScaleInput name={name} labelledBy={legendId} value={answer?.value ?? ""} onChange={(value) => onPatch(question.id, { value })} />;
        } else if (question.type === "single") {
          const value = answer?.value ?? "";
          control = (
            <div className="sv-choices" role="radiogroup" aria-labelledby={legendId}>
              {question.options.map((option) => (
                <ChoiceRow key={option} type="single" name={name} checked={value === option} onChange={() => onPatch(question.id, { value: option })}>
                  {option}
                </ChoiceRow>
              ))}
            </div>
          );
        } else if (question.type === "multi") {
          const values = answer?.values ?? [];
          control = (
            <div className="sv-choices" role="group" aria-labelledby={legendId}>
              {question.options.map((option) => (
                <ChoiceRow
                  key={option}
                  type="multi"
                  name={name}
                  checked={values.includes(option)}
                  onChange={(event) =>
                    onPatch(question.id, { values: event.target.checked ? [...values, option] : values.filter((item) => item !== option) })
                  }
                >
                  {option}
                </ChoiceRow>
              ))}
            </div>
          );
        } else if (question.type === "date") {
          control = (
            <TextInput
              type="date"
              className="sv-qa__date"
              aria-labelledby={legendId}
              value={answer?.value ?? ""}
              onChange={(event) => onPatch(question.id, { value: event.target.value })}
            />
          );
        } else {
          control = (
            <TextArea
              aria-labelledby={legendId}
              rows={3}
              autoGrow
              placeholder="Ваш ответ"
              value={answer?.value ?? ""}
              onChange={(event) => onPatch(question.id, { value: event.target.value })}
            />
          );
        }
        return (
          <section className="sv-qa" key={question.id}>
            <Legend id={legendId} index={index} question={question} />
            {control}
          </section>
        );
      })}

      {error && (
        <div className="sv-alert" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="sv-fill__actions">
        <Button type="submit" icon={Send} loading={busy}>
          {myResponse ? "Сохранить изменения" : "Отправить ответы"}
        </Button>
      </div>
    </form>
  );
}
