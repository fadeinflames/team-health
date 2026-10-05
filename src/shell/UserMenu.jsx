import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { Menu } from "../ui";

// Меню пользователя в подвале боковой панели: настройки, тема, выход.
export default function UserMenu({ displayName, roleText, theme, onSetTheme, onOpenSettings, onLogout }) {
  const mark = (value) => (theme === value ? <Check size={14} aria-label="выбрано" /> : undefined);
  const items = [
    { id: "settings", label: "Настройки", icon: Settings, onSelect: onOpenSettings },
    "separator",
    { id: "theme-system", label: "Тема как в системе", icon: Monitor, shortcut: mark("system"), onSelect: () => onSetTheme("system") },
    { id: "theme-light", label: "Светлая тема", icon: Sun, shortcut: mark("light"), onSelect: () => onSetTheme("light") },
    { id: "theme-dark", label: "Тёмная тема", icon: Moon, shortcut: mark("dark"), onSelect: () => onSetTheme("dark") },
    "separator",
    { id: "logout", label: "Выйти", icon: LogOut, onSelect: onLogout }
  ];

  return (
    <Menu
      align="start"
      label="Меню пользователя"
      items={items}
      trigger={
        <button type="button" className="shell-user shell-user-button" aria-label={`Меню пользователя: ${displayName}`}>
          <span className="shell-user-avatar" aria-hidden="true">
            {(displayName || "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="shell-user-text">
            <span className="shell-user-name">{displayName}</span>
            <span className="shell-user-role">{roleText}</span>
          </span>
          <ChevronsUpDown className="shell-user-chevron" size={16} aria-hidden="true" />
        </button>
      }
    />
  );
}
