import { Search } from "lucide-react";
import { Avatar, Badge, EmptyState, ListGroup, ListRow, ProgressBar, SearchInput } from "../../ui";
import { countLabel } from "../../lib/shared.jsx";
import { pulseOf, scoreTone } from "./helpers.js";

// Список участников 1:1: сводка по пульсу, поиск и сгруппированный список.
// Один и тот же компонент стоит в левой колонке (широкий экран) и в шторке выбора (узкий).
//
// people: участники после фильтра поиска; selectedId: открытый сейчас;
// search / onSearch(value): строка поиска; onSelect(personId): выбор человека.
// teamScore, riskCount, openTopicsCount: сводка команды (для не-админа это «Мой пульс»).
export default function PeoplePanel({
  isAdmin,
  workspace,
  people,
  totalPeople,
  selectedId,
  search,
  onSearch,
  onSelect,
  teamScore,
  riskCount,
  openTopicsCount,
  className = ""
}) {
  const tone = scoreTone(teamScore);
  return (
    <div className={`meet-people ${className}`.trim()}>
      <div className="meet-people__pulse">
        <div className="meet-people__pulse-head">
          <span className="meet-people__pulse-label">{isAdmin ? "Пульс команды" : "Мой пульс"}</span>
          <span className="meet-people__pulse-value num">{teamScore}</span>
        </div>
        <ProgressBar value={teamScore} tone={tone} size="sm" aria-label={isAdmin ? "Пульс команды" : "Мой пульс"} />
        <p className="meet-people__pulse-note">
          {countLabel(riskCount, ["открытый риск", "открытых риска", "открытых рисков"])},{" "}
          {countLabel(openTopicsCount, ["тема в работе", "темы в работе", "тем в работе"])}
        </p>
      </div>

      <SearchInput
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        onClear={() => onSearch("")}
        placeholder={isAdmin ? "Найти участника" : "Ваш профиль"}
        aria-label="Поиск участника"
        disabled={!isAdmin && totalPeople < 2}
      />

      <nav aria-label="Участники 1:1">
        {people.length > 0 ? (
          <ListGroup>
            {people.map((person) => {
              const score = pulseOf(workspace, person.id);
              return (
                <ListRow
                  key={person.id}
                  leading={<Avatar name={person.name} size={36} decorative />}
                  title={person.name}
                  subtitle={person.role}
                  active={person.id === selectedId}
                  onClick={() => onSelect(person.id)}
                  trailing={
                    <Badge tone={scoreTone(score)} size="sm" className="num">
                      <span className="sr-only">Пульс </span>
                      {score}
                    </Badge>
                  }
                />
              );
            })}
          </ListGroup>
        ) : (
          <EmptyState
            className="meet-people__empty"
            icon={Search}
            title="Никого не нашли"
            description="Попробуйте другое имя, роль или название команды."
          />
        )}
      </nav>
    </div>
  );
}
