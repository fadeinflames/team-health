import { useEffect, useRef, useState } from "react";
import { HeartPulse, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import "../styles/shell.css";

// Подписка на медиазапрос: оболочка сворачивает панель по ширине окна, а
// разметка не должна ждать для этого события прокрутки или ресайза.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function BrandMark({ size = 36 }) {
  return (
    <span className="shell-brandmark" style={{ "--brand-size": `${size}px` }} aria-hidden="true">
      <HeartPulse size={Math.round(size * 0.56)} strokeWidth={2} />
    </span>
  );
}

// Оболочка: боковая панель на широких экранах, свёрнутая «рейка» на средних и
// нижняя панель вкладок на телефоне. Содержимое страницы приходит как children.
//
// sections: [{ id, label, hint, icon }] — уже отфильтрованные по ролям.
// tabIds: какие разделы выносятся на нижнюю панель (остальные уходят под «Ещё»).
export default function Shell({
  sections,
  activeSection,
  onNavigate,
  tabIds,
  collapsed,
  onToggleCollapsed,
  pageTitle,
  sidebarFooter,
  topbarEnd,
  moreSlot,
  children
}) {
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef(null);

  // Тонкая линия под верхней панелью появляется, когда страница прокручена.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const railForMeetings = useMediaQuery("(max-width: 1599px)") && activeSection === "meetings";
  const railForWidth = useMediaQuery("(max-width: 1100px)");
  const isCollapsed = collapsed || railForMeetings || railForWidth;
  const tabSections = tabIds.map((id) => sections.find((section) => section.id === id)).filter(Boolean);
  const moreActive = !tabSections.some((section) => section.id === activeSection);

  return (
    <div className="shell" data-collapsed={isCollapsed ? "true" : "false"} data-section={activeSection}>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>

      <aside className="shell-sidebar" aria-label="Разделы платформы">
        <div className="shell-brand">
          <BrandMark />
          <span className="shell-brand-name">Team Health</span>
          {!railForWidth && !railForMeetings && (
            <button
              type="button"
              className="shell-collapse"
              aria-label={collapsed ? "Развернуть панель" : "Свернуть панель"}
              aria-pressed={collapsed}
              onClick={onToggleCollapsed}
            >
              {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
            </button>
          )}
        </div>

        <nav className="shell-nav" aria-label="Разделы">
          <ul>
            {sections.map((section) => {
              const Icon = section.icon;
              const active = activeSection === section.id;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className="shell-nav-item"
                    aria-current={active ? "page" : undefined}
                    title={section.hint || section.label}
                    onClick={() => onNavigate(section.id)}
                  >
                    <Icon className="shell-nav-icon" size={20} strokeWidth={1.75} aria-hidden="true" />
                    <span className="shell-nav-label">{section.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shell-sidebar-foot">{sidebarFooter}</div>
      </aside>

      <div className="shell-main">
        <div ref={sentinelRef} className="shell-sentinel" aria-hidden="true" />
        <header className="shell-topbar" data-scrolled={scrolled ? "true" : "false"}>
          <div className="shell-topbar-brand" aria-hidden="true">
            <BrandMark size={28} />
          </div>
          <p className="shell-topbar-title">{pageTitle}</p>
          <div className="shell-topbar-end">{topbarEnd}</div>
        </header>

        <main id="main" className="shell-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav className="shell-tabbar" aria-label="Основная навигация">
        {tabSections.map((section) => {
          const Icon = section.icon;
          const active = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              className="shell-tab"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(section.id)}
            >
              <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
              <span>{section.label}</span>
            </button>
          );
        })}
        {moreSlot({ active: moreActive })}
      </nav>
    </div>
  );
}
