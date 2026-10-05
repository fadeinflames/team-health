import { useId } from "react";
import { AlertTriangle, CheckCircle2, Eraser, NotebookPen } from "lucide-react";
import { Badge, Button, Card, CardHeader, ListGroup, ListRow, Section, Slider, TextArea } from "../../ui";
import { countLabel } from "../../lib/shared.jsx";
import { scoreTone, signalDefs } from "./helpers.js";

// Один ползунок пульса. Класс signal-control нужен тестам; вид задают классы meet-.
// Значение уходит в черновик на каждом движении и сохраняется, когда человек отпустил ползунок.
function SignalControl({ id, label, min, max, value, onDraft, onCommit }) {
  const inputId = `${useId()}-${id}`;
  return (
    <div className="signal-control meet-signal">
      <div className="meet-signal__head">
        <label className="meet-signal__label" htmlFor={inputId}>
          {label}
        </label>
        <output className="meet-signal__value num" htmlFor={inputId}>
          {value}/10
        </output>
      </div>
      <Slider
        id={inputId}
        min={1}
        max={10}
        value={value}
        onChange={(_, event) => onDraft(id, event.target.value)}
        onPointerDown={(event) => event.currentTarget.setPointerCapture?.(event.pointerId)}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          onCommit(id, event.currentTarget.value);
        }}
        onKeyUp={(event) => onCommit(id, event.currentTarget.value)}
        onBlur={(event) => onCommit(id, event.currentTarget.value)}
      />
      <div className="meet-signal__scale" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// Вкладка «Встреча»: сигналы между встречами, подсказки по рискам и протокол.
export default function PulseView({
  selectedScore,
  selectedPulse,
  selectedMeetingDraft,
  pulseValue,
  updatePulseDraft,
  commitPulseValue,
  updateMeetingDraft,
  clearMeetingDraft
}) {
  const insights = [
    selectedPulse.load >= 8 && "Нагрузка выше нормы: стоит снять часть входящих задач.",
    selectedPulse.clarity <= 6 && "Проседает ясность: нужен контекст по приоритетам и критериям успеха.",
    selectedPulse.energy <= 5 && "Энергия низкая: лучше начать с восстановления и границ.",
    selectedPulse.trust <= 6 && "Доверие ниже нормы: зафиксируйте спорные решения и ожидания."
  ].filter(Boolean);

  return (
    <div className="meet-view meet-pulse">
      <Card className="meet-signals">
        <CardHeader
          title="Сигналы между встречами"
          subtitle="Передвиньте ползунки, чтобы обновить пульс участника"
          action={
            <Badge tone={scoreTone(selectedScore)} className="num">
              {selectedScore}/100
            </Badge>
          }
        />
        <div className="meet-signals__grid">
          {signalDefs.map(([id, label, min, max]) => (
            <SignalControl
              key={id}
              id={id}
              label={label}
              min={min}
              max={max}
              value={pulseValue(id)}
              onDraft={updatePulseDraft}
              onCommit={commitPulseValue}
            />
          ))}
        </div>
      </Card>

      <Section title="Что требует внимания">
        <ListGroup>
          {insights.length === 0 ? (
            <ListRow
              icon={CheckCircle2}
              iconTone="success"
              title="Критичных сигналов нет"
              subtitle="Проверьте открытые действия и план развития."
            />
          ) : (
            insights.map((text) => <ListRow key={text} icon={AlertTriangle} iconTone="warning" title={text} />)
          )}
        </ListGroup>
      </Section>

      <Card className="meet-protocol">
        <CardHeader
          icon={NotebookPen}
          title="Протокол встречи"
          subtitle="Ключевые цитаты, решения, контекст и открытые вопросы"
          action={<Badge size="sm">Видно участнику и лиду</Badge>}
        />
        <TextArea
          aria-label="Протокол встречи"
          value={selectedMeetingDraft}
          onChange={(event) => updateMeetingDraft(event.target.value)}
          placeholder="Ключевые цитаты, решения, контекст и открытые вопросы."
          rows={10}
        />
        <div className="meet-protocol__foot">
          <span className="meet-note num">
            {countLabel(selectedMeetingDraft.trim().length, ["символ", "символа", "символов"])}
          </span>
          <Button variant="neutral" size="sm" icon={Eraser} onClick={clearMeetingDraft} disabled={!selectedMeetingDraft.trim()}>
            Очистить
          </Button>
        </div>
      </Card>
    </div>
  );
}
