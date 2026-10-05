import { createContext, useContext, useId, useRef } from "react";
import { cx, mergeRefs, renderIcon } from "./util.js";
import { useSlidingIndicator } from "./useSlidingIndicator.js";

const TabsContext = createContext(null);

// Вкладки по APG: tablist/tab/tabpanel, roving tabindex, стрелки и Home/End с
// автоматической активацией. Панели (TabPanel) кладутся в children.
//
//   <Tabs tabs={[{ id: "a", label: "Обзор" }]} value={v} onChange={setV} ariaLabel="Разделы">
//     <TabPanel id="a">…</TabPanel>
//   </Tabs>
//
// onChange(id: string). className и прочие свойства: на корневой контейнер; ref: на tablist.
export function Tabs({
  tabs = [],
  value,
  onChange,
  variant = "underline",
  ariaLabel,
  children,
  id,
  className,
  ref,
  ...rest
}) {
  const auto = useId();
  const baseId = id || `ui-tabs-${auto}`;
  const listRef = useRef(null);
  const activeTab = tabs.find((tab) => tab.id === value && !tab.disabled);
  const firstEnabled = tabs.find((tab) => !tab.disabled);
  const tabbableId = (activeTab || firstEnabled)?.id;

  useSlidingIndicator(listRef, "[role='tab'][aria-selected='true']", `${value}|${tabs.length}`);

  const handleKeyDown = (event) => {
    const enabled = tabs.filter((tab) => !tab.disabled);
    if (!enabled.length) return;
    const currentId = event.target.closest?.("[data-tab-id]")?.getAttribute("data-tab-id");
    const currentIndex = enabled.findIndex((tab) => tab.id === currentId);
    if (currentIndex < 0) return;
    let next = null;
    if (event.key === "ArrowRight") next = enabled[(currentIndex + 1) % enabled.length];
    else if (event.key === "ArrowLeft") next = enabled[(currentIndex - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    listRef.current?.querySelector(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus();
    if (next.id !== value) onChange?.(next.id);
  };

  return (
    <TabsContext.Provider value={{ baseId, value }}>
      <div {...rest} className={cx("ui-tabs", `ui-tabs--${variant}`, className)}>
        <div
          ref={mergeRefs(ref, listRef)}
          role="tablist"
          aria-label={ariaLabel}
          aria-orientation="horizontal"
          className="ui-tabs__list"
          onKeyDown={handleKeyDown}
        >
          <span className="ui-tabs__indicator" aria-hidden="true" />
          {tabs.map((tab) => {
            const selected = tab.id === value;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.id}`}
                data-tab-id={tab.id}
                className={cx("ui-tabs__tab", selected && "is-selected")}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={tab.id === tabbableId ? 0 : -1}
                disabled={tab.disabled}
                onClick={() => {
                  if (!selected) onChange?.(tab.id);
                }}
              >
                {tab.icon ? (
                  <span className="ui-tabs__icon">{renderIcon(tab.icon, { size: 18, strokeWidth: 1.75, "aria-hidden": true })}</span>
                ) : null}
                <span className="ui-tabs__text">{tab.label}</span>
                {tab.count !== undefined && tab.count !== null ? <span className="ui-tabs__count num">{tab.count}</span> : null}
              </button>
            );
          })}
        </div>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

// Панель вкладки. value можно не передавать: берётся из ближайших Tabs.
export function TabPanel({ id, value, children, className, ...rest }) {
  const ctx = useContext(TabsContext);
  const current = value !== undefined ? value : ctx?.value;
  const active = current === id;
  const baseId = ctx?.baseId;
  return (
    <div
      {...rest}
      role="tabpanel"
      id={baseId ? `${baseId}-panel-${id}` : undefined}
      aria-labelledby={baseId ? `${baseId}-tab-${id}` : undefined}
      tabIndex={active ? 0 : undefined}
      hidden={!active}
      className={cx("ui-tabs__panel", className)}
    >
      {children}
    </div>
  );
}
