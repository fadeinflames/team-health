import { useState } from "react";
import { User } from "lucide-react";
import { cx, renderIcon, rem } from "./util.js";

const STATUS_LABEL = { online: "в сети", away: "отошёл", busy: "занят" };

// Один и тот же человек всегда получает один и тот же цвет из --cat-1..6.
function hashIndex(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return (hash % 6) + 1;
}

function firstLetter(word) {
  return Array.from(word).find((ch) => /[\p{L}\p{N}]/u.test(ch)) || "";
}

export function initialsOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return (firstLetter(words[0]) + (words.length > 1 ? firstLetter(words[1]) : "")).toUpperCase();
}

// tone: 1..6 (или "cat-3"), "accent", "neutral"; по умолчанию выбирается из имени.
function toneClass(tone, name) {
  if (tone === "accent" || tone === "neutral") return tone;
  const match = /^(?:cat-)?([1-6])$/.exec(String(tone ?? ""));
  if (match) return `cat-${match[1]}`;
  return `cat-${hashIndex(name || "")}`;
}

// Круглый аватар: картинка или инициалы на мягком градиенте тона.
// size в px (выводится в rem). decorative: имя человека рядом в тексте, читалке
// аватар не нужен (aria-hidden); иначе role="img" с именем и статусом.
export function Avatar({ name = "", src, size = 40, tone, ring = false, status, decorative = false, className, style, ...rest }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const initials = initialsOf(name);

  const label = [name, status ? STATUS_LABEL[status] : null].filter(Boolean).join(", ") || "Аватар";
  const hidden = decorative || rest["aria-hidden"];
  const a11y = hidden ? { "aria-hidden": true } : { role: "img", "aria-label": label };

  return (
    <span
      className={cx("ui-avatar", `ui-avatar--${toneClass(tone, name)}`, ring && "ui-avatar--ring", className)}
      style={{ "--ui-av-size": rem(size), ...style }}
      {...a11y}
      {...rest}
    >
      {showImage ? (
        <img className="ui-avatar__img" src={src} alt="" onError={() => setFailedSrc(src)} />
      ) : initials ? (
        <span className="ui-avatar__initials" aria-hidden="true">
          {initials}
        </span>
      ) : (
        <span className="ui-avatar__initials" aria-hidden="true">
          {renderIcon(User)}
        </span>
      )}
      {status ? <span className={cx("ui-avatar__status", `ui-avatar__status--${status}`)} aria-hidden="true" /> : null}
    </span>
  );
}

// Несколько аватаров внахлёст и «+N». Для читалки это одна картинка со списком имён.
export function AvatarGroup({ people = [], max = 4, size = 32, className, style, ...rest }) {
  const shown = people.slice(0, Math.max(0, max));
  const extra = people.length - shown.length;
  const names = people.map((p) => p.name).filter(Boolean);
  const label = names.length ? `Участники: ${names.join(", ")}` : `Участников: ${people.length}`;

  return (
    <span
      className={cx("ui-avatars", className)}
      role="img"
      aria-label={label}
      style={{ "--ui-av-size": rem(size), ...style }}
      {...rest}
    >
      {shown.map((person, index) => (
        <Avatar key={`${person.name}-${index}`} name={person.name} src={person.src} size={size} decorative />
      ))}
      {extra > 0 ? (
        <span className="ui-avatar ui-avatar--neutral ui-avatar--more" style={{ "--ui-av-size": rem(size) }} aria-hidden="true">
          <span className="ui-avatar__initials">+{extra}</span>
        </span>
      ) : null}
    </span>
  );
}
