import { useState } from "react";
import { LogOut, Menu as MenuIcon, Monitor, Moon, Sun } from "lucide-react";
import { ListGroup, ListRow, Section, Segmented, Sheet } from "../ui";

// Вкладка «Ещё» на нижней панели телефона: остальные разделы, тема и выход.
export default function MoreTab({ active, sections, activeSection, theme, onSetTheme, onNavigate, onLogout }) {
  const [open, setOpen] = useState(false);
  const go = (id) => {
    setOpen(false);
    onNavigate(id);
  };

  return (
    <>
      <button
        type="button"
        className="shell-tab"
        aria-current={active ? "page" : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <MenuIcon size={24} strokeWidth={1.75} aria-hidden="true" />
        <span>Ещё</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Ещё" side="bottom">
        <div className="more-sheet">
          <ListGroup>
            {sections.map((section) => (
              <ListRow
                key={section.id}
                icon={section.icon}
                iconTone={activeSection === section.id ? "accent" : "neutral"}
                title={section.label}
                subtitle={section.hint}
                active={activeSection === section.id}
                chevron
                onClick={() => go(section.id)}
              />
            ))}
          </ListGroup>

          <Section title="Тема">
            <Segmented
              fullWidth
              ariaLabel="Тема интерфейса"
              value={theme}
              onChange={onSetTheme}
              options={[
                { value: "system", label: "Авто", icon: Monitor },
                { value: "light", label: "Светлая", icon: Sun },
                { value: "dark", label: "Тёмная", icon: Moon }
              ]}
            />
          </Section>

          <ListGroup>
            <ListRow
              icon={LogOut}
              iconTone="danger"
              title="Выйти"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            />
          </ListGroup>
        </div>
      </Sheet>
    </>
  );
}
