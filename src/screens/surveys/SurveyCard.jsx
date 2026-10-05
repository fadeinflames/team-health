// Карточка опроса в списке: заголовок, значки, участие, действия и раскрывающееся
// содержимое (результаты для лида, форма для участника).
import { BookmarkPlus, CheckCircle2, ChevronDown, ClipboardList, Copy, Download, Lock, MoreHorizontal, Trash2, UsersRound } from "lucide-react";
import { Badge, Button, Card, IconButton, IconTile, Menu, ProgressBar } from "../../ui";
import { pluralizeRu } from "../../lib/shared.jsx";
import Answer from "./Answer.jsx";
import Results from "./Results.jsx";
import { participationOf } from "./helpers.js";

export default function SurveyCard({
  survey,
  isAdmin,
  peopleCount,
  expanded,
  draft,
  onToggle,
  onExportCsv,
  onDuplicate,
  onSaveTemplate,
  onDelete,
  onPatchAnswer,
  onSubmitAnswer,
  onOpenReports,
  onNewSurvey
}) {
  const myResponse = survey.myResponse;
  const pct = participationOf(survey, peopleCount);
  const panelId = `sv-panel-${survey.id}`;
  const toggleLabel = expanded ? "Свернуть" : isAdmin ? "Открыть результаты" : myResponse ? "Изменить ответы" : "Пройти";

  const menuItems = [
    survey.responseCount > 0 && { id: "csv", label: "Скачать ответы CSV", icon: Download, onSelect: () => onExportCsv(survey) },
    { id: "copy", label: "Создать копию", icon: Copy, onSelect: () => onDuplicate(survey) },
    { id: "template", label: "Сохранить как шаблон", icon: BookmarkPlus, onSelect: () => onSaveTemplate(survey.id) },
    "separator",
    { id: "delete", label: "Удалить опрос", icon: Trash2, tone: "danger", onSelect: () => onDelete(survey) }
  ].filter(Boolean);

  return (
    <Card as="article" className="sv-survey" data-expanded={expanded || undefined} aria-label={survey.title}>
      <div className="sv-survey__head">
        <IconTile icon={survey.anonymous ? Lock : ClipboardList} tone={survey.anonymous ? "info" : "accent"} />
        <div className="sv-survey__id">
          <h3 className="sv-survey__title">{survey.title}</h3>
          <div className="sv-survey__badges">
            <Badge tone={survey.anonymous ? "info" : "neutral"} size="sm">
              {survey.anonymous ? "Анонимный" : "С указанием автора"}
            </Badge>
            <Badge size="sm">
              {survey.responseCount} {pluralizeRu(survey.responseCount, ["ответ", "ответа", "ответов"])}
            </Badge>
            {!isAdmin && myResponse && (
              <Badge tone="success" size="sm" icon={CheckCircle2}>
                Вы ответили
              </Badge>
            )}
          </div>
        </div>
        {isAdmin && (
          <Menu
            align="end"
            label={`Действия с опросом «${survey.title}»`}
            trigger={<IconButton label={`Действия с опросом «${survey.title}»`} icon={MoreHorizontal} />}
            items={menuItems}
          />
        )}
      </div>

      {survey.description && <p className="sv-survey__desc">{survey.description}</p>}

      {isAdmin && (
        <div className="sv-survey__participation">
          <ProgressBar value={pct} size="sm" aria-label="Участие в опросе" />
          <span className="sv-survey__pct num">
            <UsersRound size={14} aria-hidden="true" />
            {pct}% участия · {survey.responseCount} из {peopleCount}
          </span>
        </div>
      )}

      <div className="sv-survey__actions">
        <Button
          variant={!isAdmin && !myResponse && !expanded ? "primary" : "tinted"}
          iconRight={ChevronDown}
          className="sv-survey__toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {toggleLabel}
        </Button>
      </div>

      {expanded && (
        <div className="sv-survey__panel" id={panelId}>
          {isAdmin ? (
            <Results survey={survey} onOpenReports={onOpenReports} onRepeat={() => onDuplicate(survey)} onNewSurvey={onNewSurvey} />
          ) : (
            <Answer survey={survey} draft={draft} onPatch={onPatchAnswer} onSubmit={onSubmitAnswer} />
          )}
        </div>
      )}
    </Card>
  );
}
