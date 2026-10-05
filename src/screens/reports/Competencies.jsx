// Компетенции: карта навыков (матрица), последние оценки по участникам, форма отчёта.
import { useState } from "react";
import { BarChart3, CheckCircle2, ClipboardCheck, ClipboardList, Download, Plus, Trash2, UsersRound } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  ListGroup,
  ListRow,
  ProgressRing,
  Select,
  TextArea,
  TextInput
} from "../../ui";
import {
  competencyGradeLabel,
  competencySourceLabel,
  competencyTone,
  formatScoreValue,
  pluralizeRu
} from "../../lib/shared.jsx";

const TONE_WORD = { good: "сильная зона", watch: "рядом с целью", risk: "ниже цели", empty: "нет оценки" };
const MATRIX_LIMIT = 12;

function cellLabel(cell) {
  return cell.score == null ? `${cell.person.name}: нет оценки` : `${cell.person.name}: ${formatScoreValue(cell.score)} из ${formatScoreValue(cell.targetScore || 5)}`;
}

function rowMeta(row) {
  return `среднее ${formatScoreValue(row.avg)} · bus factor ${row.busFactor} · ${row.coverage} ${pluralizeRu(row.coverage, ["оценка", "оценки", "оценок"])}`;
}

function assessmentTone(assessment) {
  if (assessment.minScore < 2.5) return "danger";
  if (assessment.averageScore < 3.5) return "warning";
  return "success";
}

/* ------------------------------------------------------------- Карта навыков */

export function CompetencyMap({ data, isAdmin, compact, onOpenPerson, onExportCsv }) {
  const rows = data.competencyMatrixRows;
  const shown = rows.slice(0, MATRIX_LIMIT);
  const people = rows[0]?.cells.map((cell) => cell.person) || [];

  return (
    <Card className="rep-card">
      <CardHeader
        icon={BarChart3}
        title="Карта навыков команды"
        subtitle="Компетенции, у которых больше всего отставаний, идут первыми"
        action={
          isAdmin && data.assessmentCount > 0 ? (
            <Button variant="tinted" size="sm" icon={Download} onClick={onExportCsv}>
              CSV
            </Button>
          ) : null
        }
      />

      {rows.length > 0 ? (
        <>
          <div className="rep-summary">
            <div className="rep-summary__item rep-tone--success">
              <strong className="num">{data.competencyStrengths.length}</strong>
              <span>сильных зон</span>
            </div>
            <div className="rep-summary__item rep-tone--warning">
              <strong className="num">{data.competencyWeaknesses.length}</strong>
              <span>зон роста</span>
            </div>
            <div className="rep-summary__item rep-tone--danger">
              <strong className="num">{data.competencyBusFactorRisks.length}</strong>
              <span>bus factor рисков</span>
            </div>
          </div>

          {compact ? (
            <div className="rep-card-list" aria-label="Матрица компетенций">
              <ListGroup inset={false}>
                {shown.map((row) => (
                  <ListRow key={row.key} title={row.name} subtitle={rowMeta(row)}>
                    <span className="rep-chips">
                      {row.cells.map((cell) => {
                        const tone = competencyTone(cell.score, cell.targetScore);
                        return (
                          <button
                            key={`${row.key}-${cell.person.id}`}
                            type="button"
                            className={`rep-chip rep-heat rep-heat--${tone}`}
                            title={cellLabel(cell)}
                            aria-label={cellLabel(cell)}
                            onClick={() => onOpenPerson(cell.person.id)}
                          >
                            <span className="rep-chip__who">{cell.person.initials || cell.person.name.slice(0, 2)}</span>
                            <span className="num">{cell.score == null ? "—" : formatScoreValue(cell.score)}</span>
                          </button>
                        );
                      })}
                    </span>
                  </ListRow>
                ))}
              </ListGroup>
            </div>
          ) : (
            <div className="rep-scroll rep-scroll--matrix" role="region" aria-label="Матрица компетенций, прокручиваемая таблица" tabIndex={0}>
              <table className="rep-table rep-matrix" aria-label="Матрица компетенций">
                <thead>
                  <tr>
                    <th scope="col">Компетенция</th>
                    {people.map((person) => (
                      <th scope="col" key={person.id} className="rep-table__num">
                        <button type="button" className="rep-matrix__who" title={person.name} onClick={() => onOpenPerson(person.id)}>
                          <Avatar name={person.name} size={28} decorative />
                          <span className="rep-matrix__name">{person.name.split(/\s+/)[0]}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">
                        <span className="rep-matrix__title">{row.name}</span>
                        <span className="rep-matrix__meta">{rowMeta(row)}</span>
                      </th>
                      {row.cells.map((cell) => {
                        const tone = competencyTone(cell.score, cell.targetScore);
                        return (
                          <td key={`${row.key}-${cell.person.id}`} className="rep-table__num">
                            <button
                              type="button"
                              className={`rep-cell rep-heat rep-heat--${tone}`}
                              title={cellLabel(cell)}
                              aria-label={`${cellLabel(cell)}, ${TONE_WORD[tone]}`}
                              onClick={() => onOpenPerson(cell.person.id)}
                            >
                              <span className="num">{cell.score == null ? "—" : formatScoreValue(cell.score)}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="rep-legend">
            <span className="rep-legend__item">
              <span className="rep-heat rep-heat--good">4</span>сильная зона
            </span>
            <span className="rep-legend__item">
              <span className="rep-heat rep-heat--watch">3</span>рядом с целью
            </span>
            <span className="rep-legend__item">
              <span className="rep-heat rep-heat--risk">2</span>ниже цели
            </span>
            {rows.length > MATRIX_LIMIT ? (
              <span className="rep-legend__note">Показаны {MATRIX_LIMIT} из {rows.length} компетенций.</span>
            ) : null}
          </p>
        </>
      ) : (
        <EmptyState icon={ClipboardCheck} title="Пока нет оценок" description="Отчёты по компетенциям появятся после кейс-интервью." />
      )}
    </Card>
  );
}

/* ------------------------------------------------------ Последние оценки людей */

export function LatestAssessments({ items, isAdmin, onImportToLpr, onDeleteAssessment }) {
  const [pendingDelete, setPendingDelete] = useState(null);

  if (!items.length) return null;

  return (
    <Card className="rep-card" padded={false}>
      <div className="rep-card__head">
        <CardHeader icon={UsersRound} title="Последние оценки по участникам" subtitle="По одному свежему отчёту на человека" />
      </div>
      <ListGroup inset={false}>
        {items.map(({ person, assessment }) => {
          const gaps = (assessment.competencies || []).filter((competency) => Number(competency.score) < Number(competency.targetScore || 3)).slice(0, 3);
          const tone = assessmentTone(assessment);
          return (
            <ListRow
              key={assessment.id}
              leading={
                <ProgressRing value={Number(assessment.averageScore) || 0} max={5} size={36} stroke={4} tone={tone} label={`Средний балл ${formatScoreValue(assessment.averageScore)} из 5`}>
                  <span className="rep-ring-num num">{formatScoreValue(assessment.averageScore)}</span>
                </ProgressRing>
              }
              title={person.name}
              subtitle={`${competencyGradeLabel[assessment.grade] || assessment.grade} · ${competencySourceLabel[assessment.source] || assessment.source} · ${assessment.title} · ${String(assessment.validatedAt || assessment.createdAt || "").slice(0, 10)}`}
            >
              <span className="rep-gaps">
                {gaps.length > 0 ? (
                  gaps.map((gap) => (
                    <Badge key={`${assessment.id}-${gap.id}`} tone="warning" size="sm">
                      {gap.name} {formatScoreValue(gap.score)}→{formatScoreValue(gap.targetScore)}
                    </Badge>
                  ))
                ) : (
                  <Badge tone="success" size="sm" icon={CheckCircle2}>
                    без явных просадок
                  </Badge>
                )}
              </span>
              {isAdmin && (
                <span className="rep-actions">
                  <Button variant="tinted" size="sm" icon={ClipboardCheck} onClick={() => onImportToLpr(assessment)}>
                    В ЛПР
                  </Button>
                  <IconButton label="Удалить отчёт" icon={Trash2} size="sm" onClick={() => setPendingDelete(assessment)} />
                </span>
              )}
            </ListRow>
          );
        })}
      </ListGroup>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        tone="danger"
        title={pendingDelete ? `Удалить отчёт «${pendingDelete.title}»?` : ""}
        description="Оценки из этого отчёта пропадут из матрицы компетенций."
        confirmLabel="Подтвердить удаление"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const id = pendingDelete?.id;
          setPendingDelete(null);
          if (id) onDeleteAssessment(id);
        }}
      />
    </Card>
  );
}

/* --------------------------------------------------------------- Форма отчёта */

export function CompetencyForm({ people, draft, onDraftChange, error, onSubmit }) {
  const patch = (key) => (event) => onDraftChange((current) => ({ ...current, [key]: event.target.value }));
  return (
    <Card className="rep-card">
      <CardHeader icon={ClipboardList} title="Добавить отчёт кейс-интервью" subtitle="Оценки пойдут в матрицу, CSV и импорт ЛПР" />
      <form className="rep-form" onSubmit={onSubmit}>
        <div className="rep-form__pair">
          <Field label="Участник">
            <Select value={draft.personId} onChange={patch("personId")} placeholder="Выберите участника">
              {people.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Роль / контекст">
            <TextInput value={draft.roleContext} onChange={patch("roleContext")} placeholder="Например: Support L2 · CRM, база знаний, эскалации" />
          </Field>
        </div>
        <Field label="Название отчёта">
          <TextInput value={draft.title} onChange={patch("title")} />
        </Field>
        <Field label="Компетенции" hint="Одна строка на компетенцию, шкала 0–5. Этот формат затем уходит в матрицу, CSV и импорт ЛПР.">
          <TextArea rows={6} value={draft.rows} onChange={patch("rows")} placeholder="Категория | Компетенция | Балл | Цель | Наблюдение | Следующий шаг" />
        </Field>
        {error ? (
          <p className="rep-form__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="rep-form__actions">
          <Button type="submit" icon={Plus} disabled={!people.length}>
            Сохранить отчёт
          </Button>
        </div>
      </form>
    </Card>
  );
}
