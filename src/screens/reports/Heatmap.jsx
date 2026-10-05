// Тепловая карта команды: значение числом в каждой ячейке, цвет только усиливает.
// На широком экране таблица, на узком сгруппированный список (строка = участник).
import { Avatar, Badge, ListGroup, ListRow } from "../../ui";
import { countLabel, heatmapTone } from "../../lib/shared.jsx";

const METRICS = [
  ["energy", "Энергия"],
  ["load", "Нагрузка"],
  ["clarity", "Ясность"],
  ["trust", "Доверие"]
];

const TONE_WORD = { good: "норма", watch: "внимание", risk: "риск", empty: "нет данных" };

export function scoreTone(score) {
  if (score < 64) return "danger";
  if (score < 76) return "warning";
  return "success";
}

function Cell({ metric, name, value }) {
  const tone = heatmapTone(metric, value);
  return (
    <span className={`rep-heat rep-heat--${tone}`} title={`${name}: ${value || "нет данных"}`}>
      <span className="num">{value || "—"}</span>
      <span className="sr-only">
        {" "}
        из 10, {TONE_WORD[tone]}
      </span>
    </span>
  );
}

export default function Heatmap({ rows, compact, onOpenPerson }) {
  if (!rows.length) return <p className="rep-empty-text">Участников пока нет.</p>;

  if (compact) {
    return (
      <div className="rep-card-list" aria-label="Heatmap команды">
        <ListGroup inset={false}>
          {rows.map((row) => (
            <ListRow
              key={row.person.id}
              leading={<Avatar name={row.person.name} size={36} decorative />}
              title={row.person.name}
              subtitle={
                <span className="rep-heat-sub">
                  <Badge tone={scoreTone(row.score)} size="sm">
                    пульс {row.score}
                  </Badge>
                  {countLabel(row.openActions, ["шаг", "шага", "шагов"])} в работе
                </span>
              }
              onClick={() => onOpenPerson(row.person.id)}
            >
              <span className="rep-heat-grid">
                {METRICS.map(([metric, name]) => (
                  <span key={metric} className="rep-heat-grid__item">
                    <span className="rep-heat-grid__name">{name}</span>
                    <Cell metric={metric} name={name} value={row[metric]} />
                  </span>
                ))}
              </span>
            </ListRow>
          ))}
        </ListGroup>
      </div>
    );
  }

  return (
    <div className="rep-scroll" role="region" aria-label="Heatmap команды, прокручиваемая таблица" tabIndex={0}>
      <table className="rep-table" aria-label="Heatmap команды">
        <thead>
          <tr>
            <th scope="col">Участник</th>
            <th scope="col">Пульс</th>
            {METRICS.map(([metric, name]) => (
              <th scope="col" key={metric} className="rep-table__num">
                {name}
              </th>
            ))}
            <th scope="col" className="rep-table__num">
              Шаги
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.person.id} className="rep-table__row">
              <th scope="row">
                <button type="button" className="rep-person" onClick={() => onOpenPerson(row.person.id)}>
                  <Avatar name={row.person.name} size={32} decorative />
                  <span className="rep-person__text">
                    <span className="rep-person__name">{row.person.name}</span>
                    <span className="rep-person__sub">{row.person.role}</span>
                  </span>
                </button>
              </th>
              <td>
                <Badge tone={scoreTone(row.score)} className="num">
                  {row.score}
                </Badge>
              </td>
              {METRICS.map(([metric, name]) => (
                <td key={metric} className="rep-table__num">
                  <Cell metric={metric} name={name} value={row[metric]} />
                </td>
              ))}
              <td className="rep-table__num">
                <span className="num rep-table__steps">{row.openActions}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HeatmapLegend() {
  return (
    <p className="rep-legend" aria-label="Как читать цвета">
      <span className="rep-legend__item">
        <span className="rep-heat rep-heat--good">8</span>норма
      </span>
      <span className="rep-legend__item">
        <span className="rep-heat rep-heat--watch">5</span>внимание
      </span>
      <span className="rep-legend__item">
        <span className="rep-heat rep-heat--risk">3</span>риск
      </span>
      <span className="rep-legend__note">Шкала 1–10; у нагрузки наоборот: чем выше, тем хуже.</span>
    </p>
  );
}
