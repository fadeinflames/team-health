// Экран «Опросы»: конструктор и шаблоны (лид), прохождение (участник), результаты (лид).
//
// Контракт props (состояние и обращения к API остаются в App.jsx):
//   isAdmin            boolean   лид/админ: создаёт опросы и видит результаты.
//   workspace          object    нужны surveys, surveyTemplates, people.
//   composer           object    черновик конструктора {title, description, anonymous,
//                                anonymousMinResponses, questions[]}; живёт в App,
//                                чтобы переживать смену раздела.
//   setComposer        function  setState-подобная: принимает значение или updater.
//   composerOpen       boolean   открыт ли конструктор.
//   setComposerOpen    function
//   answerDrafts       object    черновики ответов {[surveyId]: {[questionId]: answer}}.
//   setAnswerDrafts    function  setState-подобная.
//   onCreateSurvey     async (payload) => void     POST /api/surveys; при ошибке бросает Error.
//   onSaveTemplate     async (surveyId) => void    опрос в шаблоны; бросает Error.
//   onDeleteSurvey     async (surveyId) => void    удаление; бросает Error.
//   onSubmitResponse   async (surveyId, answers) => void   ответ участника; бросает Error.
//   onOpenSection      (sectionId) => void         переход в другой раздел («В отчёты»).
//
// Сообщения об успехе и ошибках показывает сам экран (useToast), старое
// уведомление App для опросов больше не используется.
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, LayoutTemplate, MessageSquareText, Plus, Sparkles, UsersRound } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Menu, PageHeader, Section, Stat, useToast } from "../ui";
import { scrollBehavior, sectionDescriptionFor, surveyTemplates } from "../lib/shared.jsx";
import Composer from "./surveys/Composer.jsx";
import SurveyCard from "./surveys/SurveyCard.jsx";
import Templates, { TEMPLATE_ICON } from "./surveys/Templates.jsx";
import {
  composerFromSurvey,
  composerFromTemplate,
  composerFromUserTemplate,
  exportSurveyCsv,
  freshComposer,
  participationOf
} from "./surveys/helpers.js";
import "../styles/screen-surveys.css";

export default function SurveysScreen({
  isAdmin,
  workspace,
  composer,
  setComposer,
  composerOpen,
  setComposerOpen,
  answerDrafts,
  setAnswerDrafts,
  onCreateSurvey,
  onSaveTemplate,
  onDeleteSurvey,
  onSubmitResponse,
  onOpenSection
}) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const surveys = workspace.surveys || [];
  const people = workspace.people || [];
  const userTemplates = workspace.surveyTemplates || [];
  const showComposer = isAdmin && composerOpen;

  // Конструктор открывается с самого верха страницы.
  useEffect(() => {
    if (showComposer) window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, [showComposer]);

  const stats = useMemo(() => {
    const responses = surveys.reduce((sum, survey) => sum + (survey.responseCount || 0), 0);
    const turnout = surveys.length
      ? Math.round(surveys.reduce((sum, survey) => sum + participationOf(survey, people.length), 0) / surveys.length)
      : 0;
    return { responses, turnout };
  }, [surveys, people.length]);

  function openComposer(next) {
    if (next) setComposer(next);
    setComposerOpen(true);
  }

  function closeComposer({ reset } = {}) {
    if (reset) setComposer(freshComposer());
    setComposerOpen(false);
  }

  async function publish(payload) {
    await onCreateSurvey(payload);
    setComposer(freshComposer());
    setComposerOpen(false);
    toast({ title: "Опрос создан", tone: "success" });
  }

  async function runAction(action, successTitle) {
    try {
      await action();
      toast({ title: successTitle, tone: "success" });
    } catch (error) {
      toast({ title: error?.message || "Не удалось выполнить действие", tone: "danger" });
    }
  }

  function duplicate(survey) {
    if (!isAdmin) return;
    openComposer(composerFromSurvey(survey));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const target = deleteTarget;
    await runAction(async () => {
      await onDeleteSurvey(target.id);
      if (expandedId === target.id) setExpandedId("");
    }, "Опрос удалён");
    setDeleting(false);
    setDeleteTarget(null);
  }

  function patchAnswer(surveyId, questionId, answer) {
    setAnswerDrafts((current) => ({ ...current, [surveyId]: { ...(current[surveyId] || {}), [questionId]: answer } }));
  }

  async function submitAnswer(survey) {
    // Черновик содержит только тронутые поля: склеиваем с уже сохранёнными ответами,
    // чтобы нетронутые вопросы не пропали и не сломали проверку обязательных на сервере.
    const merged = { ...(survey.myResponse?.answers || {}), ...(answerDrafts[survey.id] || {}) };
    await onSubmitResponse(survey.id, merged);
    setAnswerDrafts((current) => ({ ...current, [survey.id]: {} }));
    setExpandedId((current) => (current === survey.id ? "" : current));
    toast({ title: "Ответы сохранены", tone: "success" });
  }

  const renderCard = (survey) => (
    <SurveyCard
      key={survey.id}
      survey={survey}
      isAdmin={isAdmin}
      peopleCount={people.length}
      expanded={expandedId === survey.id}
      draft={answerDrafts[survey.id] || {}}
      onToggle={() => setExpandedId(expandedId === survey.id ? "" : survey.id)}
      onExportCsv={(item) => {
        exportSurveyCsv(item, people);
        toast({ title: "CSV скачан", tone: "success" });
      }}
      onDuplicate={duplicate}
      onSaveTemplate={(id) => runAction(() => onSaveTemplate(id), "Сохранено как шаблон")}
      onDelete={setDeleteTarget}
      onPatchAnswer={(questionId, answer) => patchAnswer(survey.id, questionId, answer)}
      onSubmitAnswer={() => submitAnswer(survey)}
      onOpenReports={() => onOpenSection("reports")}
      onNewSurvey={() => openComposer()}
    />
  );

  if (showComposer) {
    return (
      <Composer
        composer={composer}
        setComposer={setComposer}
        onPublish={publish}
        onHide={() => closeComposer()}
        onCancel={() => closeComposer({ reset: true })}
      />
    );
  }

  const templateMenu = [
    ...surveyTemplates
      .filter((template) => template.id !== "blank")
      .map((template) => ({
        id: template.id,
        label: template.label,
        icon: TEMPLATE_ICON[template.id],
        onSelect: () => openComposer(composerFromTemplate(template))
      })),
    ...(userTemplates.length ? ["separator"] : []),
    ...userTemplates.map((template) => ({
      id: template.id,
      label: `${template.title || "Без названия"} (мой шаблон)`,
      icon: Sparkles,
      onSelect: () => openComposer(composerFromUserTemplate(template))
    }))
  ];

  const header = (
    <PageHeader
      title="Опросы"
      subtitle={sectionDescriptionFor("surveys", { isAdmin })}
      actions={
        isAdmin ? (
          <>
            {surveys.length > 0 && (
              <Menu
                align="end"
                label="Начать с шаблона"
                trigger={
                  <Button variant="neutral" icon={LayoutTemplate}>
                    Из шаблона
                  </Button>
                }
                items={templateMenu}
              />
            )}
            <Button icon={Plus} onClick={() => openComposer()}>
              Создать опрос
            </Button>
          </>
        ) : null
      }
    />
  );

  const deleteDialog = (
    <ConfirmDialog
      open={Boolean(deleteTarget)}
      title={deleteTarget ? `Удалить опрос «${deleteTarget.title}»?` : "Удалить опрос?"}
      description="Ответы тоже будут удалены. Это действие нельзя отменить."
      confirmLabel="Подтвердить удаление"
      tone="danger"
      onConfirm={confirmDelete}
      onCancel={() => !deleting && setDeleteTarget(null)}
    />
  );

  // --- Пусто ---
  if (surveys.length === 0) {
    return (
      <section className="sv" aria-label="Опросы">
        {header}
        {isAdmin ? (
          <>
            <Card className="sv-empty">
              <EmptyState
                icon={ClipboardList}
                title="Опросов пока нет"
                description="Начните с готового шаблона ниже или соберите опрос с нуля: ответы покажутся здесь."
              />
            </Card>
            <Section
              size="lg"
              title="Начать с готового опроса"
              hint="Выберите шаблон: мы откроем конструктор с уже добавленными вопросами, останется только подправить."
            >
              <Templates
                templates={surveyTemplates}
                userTemplates={userTemplates}
                onPick={(template) => openComposer(composerFromTemplate(template))}
                onPickUser={(template) => openComposer(composerFromUserTemplate(template))}
              />
            </Section>
          </>
        ) : (
          <Card className="sv-empty">
            <EmptyState
              icon={ClipboardList}
              title="Опросов пока нет"
              description="Когда лид запустит опрос, он появится здесь, а ответить можно будет прямо на этой странице."
            />
          </Card>
        )}
      </section>
    );
  }

  // --- Участник: сначала то, что ждёт ответа ---
  if (!isAdmin) {
    const pending = surveys.filter((survey) => !survey.myResponse);
    const done = surveys.filter((survey) => survey.myResponse);
    return (
      <section className="sv" aria-label="Опросы">
        {header}
        {pending.length === 0 && (
          <Card className="sv-empty sv-empty--compact">
            <EmptyState icon={CheckCircle2} title="Вы ответили на все опросы" description="Спасибо. Ответы можно изменить, пока лид не закрыл опрос." />
          </Card>
        )}
        {pending.length > 0 && (
          <Section size="lg" title="Ждут вашего ответа" hint={`Осталось опросов: ${pending.length}`}>
            <div className="sv-list">{pending.map(renderCard)}</div>
          </Section>
        )}
        {done.length > 0 && (
          <Section size="lg" title="Пройденные">
            <div className="sv-list">{done.map(renderCard)}</div>
          </Section>
        )}
      </section>
    );
  }

  // --- Лид ---
  return (
    <section className="sv" aria-label="Опросы">
      {header}
      <div className="sv-stats">
        <Stat icon={ClipboardList} label="Опросов" value={surveys.length} hint="в работе" />
        <Stat icon={MessageSquareText} iconTone="info" label="Ответов" value={stats.responses} hint="за всё время" />
        <Stat icon={UsersRound} iconTone="success" label="Средняя явка" value={`${stats.turnout}%`} hint={`из ${people.length} участников`} />
      </div>
      <Section size="lg" title="Опросы команды">
        <div className="sv-list">{surveys.map(renderCard)}</div>
      </Section>
      {deleteDialog}
    </section>
  );
}
