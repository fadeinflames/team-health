// Конструктор опроса. Черновик (composer) живёт в App, чтобы переживать смену
// раздела; здесь только отображение и правки через setComposer(updater).
import { useEffect, useId, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CircleAlert,
  CircleDot,
  ListChecks,
  Plus,
  Send,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { Button, Card, Checkbox, Field, IconButton, ListGroup, ListRow, PageHeader, Section, Select, Slider, Switch, TextArea, TextInput } from "../../ui";
import {
  ANONYMOUS_MAX_RESPONSES,
  ANONYMOUS_MIN_RESPONSES,
  clampAnonymousMin,
  emptyQuestionFor,
  surveyQuestionTypeLabel
} from "../../lib/shared.jsx";
import { buildSurveyPayload } from "./helpers.js";

const TYPE_META = {
  scale: { icon: SlidersHorizontal, hint: "Оценка от 1 до 10", note: "Респондент выберет число от 1 до 10." },
  single: { icon: CircleDot, hint: "Выбрать один вариант из списка", note: "" },
  multi: { icon: ListChecks, hint: "Выбрать несколько вариантов", note: "" },
  text: { icon: AlignLeft, hint: "Ответ своими словами", note: "Свободный ответ в несколько строк." },
  date: { icon: CalendarDays, hint: "Выбрать дату в календаре", note: "Респондент выберет дату." }
};

const ADD_BUTTONS = [
  ["scale", "Шкала"],
  ["single", "Один вариант"],
  ["multi", "Несколько вариантов"],
  ["text", "Свободный ответ"],
  ["date", "Дата"]
];

const TYPE_OPTIONS = Object.entries(surveyQuestionTypeLabel).map(([value, label]) => ({ value, label }));

export default function Composer({ composer, setComposer, onPublish, onHide, onCancel }) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef(null);
  const titleRef = useRef(null);
  const focusQuestion = useRef("");

  // Пустой черновик: сразу ставим курсор в название.
  useEffect(() => {
    if (!composer.title) titleRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Новый вопрос получает фокус: можно сразу печатать.
  useEffect(() => {
    if (!focusQuestion.current) return;
    const id = focusQuestion.current;
    focusQuestion.current = "";
    document.querySelector(`[data-qid="${id}"] input.ui-input`)?.focus();
  }, [composer.questions.length]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);

  const patch = (changes) => setComposer((current) => ({ ...current, ...changes }));

  function addQuestion(type) {
    const question = emptyQuestionFor(type);
    focusQuestion.current = question.id;
    setComposer((current) => ({ ...current, questions: [...current.questions, question] }));
  }

  function patchQuestion(index, changes) {
    setComposer((current) => ({
      ...current,
      questions: current.questions.map((question, i) => {
        if (i !== index) return question;
        const next = { ...question, ...changes };
        if (changes.type && changes.type !== question.type) {
          next.options = next.type === "single" || next.type === "multi" ? ["", ""] : [];
        }
        return next;
      })
    }));
  }

  function removeQuestion(index) {
    setComposer((current) => ({ ...current, questions: current.questions.filter((_, i) => i !== index) }));
  }

  function moveQuestion(index, delta) {
    setComposer((current) => {
      const next = [...current.questions];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...current, questions: next };
    });
  }

  function patchOption(qIndex, oIndex, value) {
    setComposer((current) => ({
      ...current,
      questions: current.questions.map((question, i) => {
        if (i !== qIndex) return question;
        const options = [...question.options];
        options[oIndex] = value;
        return { ...question, options };
      })
    }));
  }

  function addOption(qIndex) {
    setComposer((current) => ({
      ...current,
      questions: current.questions.map((question, i) => (i !== qIndex ? question : { ...question, options: [...question.options, ""] }))
    }));
  }

  function removeOption(qIndex, oIndex) {
    setComposer((current) => ({
      ...current,
      questions: current.questions.map((question, i) =>
        i !== qIndex ? question : { ...question, options: question.options.filter((_, idx) => idx !== oIndex) }
      )
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await onPublish(buildSurveyPayload(composer));
    } catch (failure) {
      setError(failure?.message || "Не удалось создать опрос");
      setBusy(false);
    }
  }

  const minResponses = clampAnonymousMin(composer.anonymousMinResponses);
  const filled = composer.questions.filter((question) => question.prompt.trim()).length;

  return (
    <section className="sv sv-composer" aria-label="Конструктор опроса">
      <PageHeader
        title="Новый опрос"
        subtitle="Соберите вопросы, выберите режим ответов и опубликуйте опрос для команды."
        back={{ label: "Опросы", onClick: onHide }}
        actions={
          <>
            <Button variant="neutral" onClick={onCancel}>
              Отмена
            </Button>
            <Button type="submit" form={formId} icon={Send} loading={busy}>
              Опубликовать
            </Button>
          </>
        }
      />

      {error && (
        <div className="sv-alert" role="alert" ref={errorRef}>
          <CircleAlert size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form id={formId} className="sv-composer__grid" onSubmit={handleSubmit} noValidate>
        <Card className="sv-composer__basics" aria-label="Основное">
          <Field label="Название" required>
            {(fieldProps) => (
              <TextInput
                {...fieldProps}
                ref={titleRef}
                value={composer.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder="Например: Пульс команды за неделю"
                maxLength={160}
              />
            )}
          </Field>
          <Field label="Описание" hint="Зачем мы спрашиваем и как используем ответы.">
            {(fieldProps) => (
              <TextArea
                {...fieldProps}
                value={composer.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="Коротко о цели опроса"
                rows={2}
                autoGrow
              />
            )}
          </Field>
        </Card>

        <div className="sv-composer__side">
          <Card className="sv-composer__settings" aria-label="Режим ответов">
            <Switch
              label="Анонимный"
              description={`Агрегаты откроются после ${minResponses} ответов, авторы не раскрываются`}
              checked={composer.anonymous}
              onChange={(checked) => patch({ anonymous: checked })}
            />
            {composer.anonymous && (
              <div className="sv-composer__threshold">
                <Slider
                  label="Минимум ответов для показа результатов"
                  showValue
                  min={ANONYMOUS_MIN_RESPONSES}
                  max={ANONYMOUS_MAX_RESPONSES}
                  step={1}
                  value={minResponses}
                  onChange={(value) => patch({ anonymousMinResponses: value })}
                />
                <p className="sv-note">
                  Не меньше {ANONYMOUS_MIN_RESPONSES}: при двух ответах один респондент легко вычисляет ответ другого. Порог действует и на
                  каждый вопрос отдельно.
                </p>
              </div>
            )}
          </Card>

          <Section title="Добавить вопрос" className="sv-composer__add">
            <ListGroup>
              {ADD_BUTTONS.map(([type, label]) => (
                <ListRow
                  key={type}
                  icon={TYPE_META[type].icon}
                  title={label}
                  subtitle={TYPE_META[type].hint}
                  trailing={<Plus size={18} aria-hidden="true" />}
                  aria-label={`Добавить вопрос: ${label}`}
                  onClick={() => addQuestion(type)}
                />
              ))}
            </ListGroup>
          </Section>

          <div className="sv-composer__submit">
            <p className="sv-composer__count">
              Заполнено вопросов: {filled} из {composer.questions.length}
            </p>
            <Button type="submit" icon={Send} loading={busy} fullWidth>
              Опубликовать
            </Button>
            <Button variant="neutral" fullWidth onClick={onCancel}>
              Отмена
            </Button>
          </div>
        </div>

        <Section size="lg" title="Вопросы" hint="Порядок можно менять стрелками. Пустые вопросы не попадут в опрос." className="sv-composer__questions">
          {composer.questions.map((question, qIndex) => {
            const choice = question.type === "single" || question.type === "multi";
            const last = qIndex === composer.questions.length - 1;
            return (
              <Card as="article" className="sv-q" key={question.id} data-qid={question.id} aria-label={`Вопрос ${qIndex + 1}`}>
                <div className="sv-q__head">
                  <span className="sv-q__num num" aria-hidden="true">
                    {qIndex + 1}
                  </span>
                  <Select
                    className="sv-q__type"
                    aria-label={`Тип вопроса ${qIndex + 1}`}
                    value={question.type}
                    options={TYPE_OPTIONS}
                    onChange={(event) => patchQuestion(qIndex, { type: event.target.value })}
                  />
                  <div className="sv-q__tools">
                    <IconButton label={`Поднять вопрос ${qIndex + 1} выше`} icon={ArrowUp} disabled={qIndex === 0} onClick={() => moveQuestion(qIndex, -1)} />
                    <IconButton label={`Опустить вопрос ${qIndex + 1} ниже`} icon={ArrowDown} disabled={last} onClick={() => moveQuestion(qIndex, +1)} />
                    {composer.questions.length > 1 && (
                      <IconButton label={`Удалить вопрос ${qIndex + 1}`} icon={Trash2} className="sv-icon-danger" onClick={() => removeQuestion(qIndex)} />
                    )}
                  </div>
                </div>

                <Field label="Текст вопроса">
                  {(fieldProps) => (
                    <TextInput
                      {...fieldProps}
                      value={question.prompt}
                      onChange={(event) => patchQuestion(qIndex, { prompt: event.target.value })}
                      placeholder="Текст вопроса"
                    />
                  )}
                </Field>

                {choice ? (
                  <div className="sv-q__options" role="group" aria-label={`Варианты ответа, вопрос ${qIndex + 1}`}>
                    <span className="sv-q__caption">Варианты ответа</span>
                    {question.options.map((option, oIndex) => (
                      <div className="sv-q__option" key={oIndex}>
                        <span className={`sv-q__mark sv-q__mark--${question.type}`} aria-hidden="true" />
                        <TextInput
                          aria-label={`Вариант ${oIndex + 1}, вопрос ${qIndex + 1}`}
                          value={option}
                          onChange={(event) => patchOption(qIndex, oIndex, event.target.value)}
                          placeholder={`Вариант ${oIndex + 1}`}
                        />
                        {question.options.length > 2 && (
                          <IconButton label={`Убрать вариант ${oIndex + 1}`} icon={X} size="sm" onClick={() => removeOption(qIndex, oIndex)} />
                        )}
                      </div>
                    ))}
                    <Button variant="plain" size="sm" icon={Plus} className="sv-q__add-option" onClick={() => addOption(qIndex)}>
                      Добавить вариант
                    </Button>
                  </div>
                ) : (
                  <p className="sv-q__note">{TYPE_META[question.type]?.note}</p>
                )}

                <div className="sv-q__foot">
                  <Checkbox
                    label="Обязательный"
                    checked={Boolean(question.required)}
                    onChange={(event) => patchQuestion(qIndex, { required: event.target.checked })}
                  />
                </div>
              </Card>
            );
          })}
        </Section>
      </form>
    </section>
  );
}
