import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { Dialog, Kbd } from "../ui";

// Палитра команд (⌘K / Ctrl+K): быстрый переход по разделам, к человеку и
// несколько действий. Паттерн «combobox + listbox»: фокус остаётся в поле, а
// активная строка выделяется через aria-activedescendant, поэтому читалка
// озвучивает пункты, не отрывая фокус от ввода.
//
// items: [{ id, group, label, hint, icon, keywords, run }]
export default function CommandPalette({ open, onClose, items }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.label} ${item.hint || ""} ${item.keywords || ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  // Активная строка всегда в зоне видимости.
  useEffect(() => {
    const node = listRef.current?.querySelector('[aria-selected="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  function run(item) {
    if (!item) return;
    onClose();
    // После закрытия, чтобы фокус успел вернуться и не перебил переход.
    window.setTimeout(() => item.run(), 0);
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[active]);
    }
  }

  let lastGroup = "";
  return (
    <Dialog open={open} onClose={onClose} title="Быстрый переход" size="md" initialFocusRef={inputRef} className="palette">
      <div className="palette-body">
        <label className="palette-field">
          <Search size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Поиск по разделам, людям и действиям</span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Раздел, человек или действие"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>

        <ul id={listId} ref={listRef} role="listbox" aria-label="Результаты" className="palette-list">
          {results.map((item, index) => {
            const Icon = item.icon;
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="palette-group">{header}</p>}
                <div
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={index === active}
                  className="palette-item"
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(item)}
                >
                  {Icon && <Icon size={18} strokeWidth={1.75} aria-hidden="true" />}
                  <span className="palette-item-label">{item.label}</span>
                  {item.hint && <span className="palette-item-hint">{item.hint}</span>}
                  {index === active && <CornerDownLeft size={14} aria-hidden="true" className="palette-item-enter" />}
                </div>
              </li>
            );
          })}
          {results.length === 0 && <li className="palette-empty">Ничего не найдено. Попробуйте другое слово.</li>}
        </ul>

        <p className="palette-foot">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор
          </span>
          <span>
            <Kbd>Enter</Kbd> открыть
          </span>
          <span>
            <Kbd>Esc</Kbd> закрыть
          </span>
        </p>
      </div>
    </Dialog>
  );
}
