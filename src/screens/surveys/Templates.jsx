// Выбор шаблона: карточки встроенных шаблонов и «моих» (сохранённых из опросов).
import { Activity, FilePlus2, Gauge, HeartPulse, Repeat, Sparkles, UsersRound } from "lucide-react";
import { Badge, Card, IconTile } from "../../ui";
import { pluralizeRu } from "../../lib/shared.jsx";

export const TEMPLATE_ICON = {
  blank: FilePlus2,
  "weekly-pulse": HeartPulse,
  "on-call-review": Activity,
  "team-retro": Repeat,
  eNPS: Gauge,
  360: UsersRound
};

const TONES = ["accent", "info", "success", "warning", "neutral"];

function questionsLabel(count) {
  return `${count} ${pluralizeRu(count, ["вопрос", "вопроса", "вопросов"])}`;
}

export default function Templates({ templates, userTemplates, onPick, onPickUser }) {
  return (
    <div className="sv-tpls">
      {templates.map((template, index) => (
        <Card as="button" interactive className="sv-tpl" key={template.id} onClick={() => onPick(template)}>
          <IconTile icon={TEMPLATE_ICON[template.id] || Sparkles} tone={template.id === "blank" ? "neutral" : TONES[index % TONES.length]} />
          <span className="sv-tpl__title">{template.label}</span>
          <span className="sv-tpl__desc">{template.description}</span>
          {template.id !== "blank" && (
            <Badge size="sm" className="sv-tpl__badge">
              {questionsLabel(template.survey.questions.length)}
            </Badge>
          )}
        </Card>
      ))}
      {userTemplates.map((template) => (
        <Card as="button" interactive className="sv-tpl" key={template.id} onClick={() => onPickUser(template)}>
          <IconTile icon={Sparkles} tone="accent" />
          <span className="sv-tpl__title">{template.title || "Без названия"}</span>
          <span className="sv-tpl__desc">{template.description || "Ваш шаблон"}</span>
          <Badge size="sm" tone="accent" className="sv-tpl__badge">
            {questionsLabel((template.questions || []).length)} · мой шаблон
          </Badge>
        </Card>
      ))}
    </div>
  );
}
