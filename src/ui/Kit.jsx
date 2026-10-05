import { useEffect, useState } from "react";
import "../styles/kit.css";
import "./index.js";
import KitA from "./KitA.jsx";
import KitB from "./KitB.jsx";

// «Живой» каталог интерфейса: открывается по адресу /#ui-kit без входа и
// показывает все примитивы во всех режимах. По нему сверяют внешний вид
// компонентов, не поднимая данные.
const THEMES = [
  ["light", "Светлая"],
  ["dark", "Тёмная"]
];
const ACCENTS = ["teal", "blue", "indigo", "violet", "rose", "orange", "graphite"];
const DENSITIES = [
  ["comfortable", "Комфортная"],
  ["compact", "Компактная"]
];
const TEXTS = [
  ["normal", "Обычный"],
  ["large", "Крупный"]
];

function applyAttr(name, value, fallback) {
  const root = document.documentElement;
  if (value === fallback) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

export default function Kit() {
  const [theme, setTheme] = useState(document.documentElement.getAttribute("data-theme") || "light");
  const [accent, setAccent] = useState(document.documentElement.getAttribute("data-accent") || "teal");
  const [density, setDensity] = useState(document.documentElement.getAttribute("data-density") || "comfortable");
  const [text, setText] = useState(document.documentElement.getAttribute("data-text") || "normal");

  useEffect(() => applyAttr("data-theme", theme, "light"), [theme]);
  useEffect(() => applyAttr("data-accent", accent, "teal"), [accent]);
  useEffect(() => applyAttr("data-density", density, "comfortable"), [density]);
  useEffect(() => applyAttr("data-text", text, "normal"), [text]);

  const group = (label, options, value, onChange) => (
    <div className="kit-group" role="group" aria-label={label}>
      <span className="kit-group-label">{label}</span>
      {options.map(([id, title]) => (
        <button key={id} type="button" className="kit-chip" aria-pressed={value === id} onClick={() => onChange(id)}>
          {title}
        </button>
      ))}
    </div>
  );

  return (
    <div className="kit">
      <header className="kit-bar">
        <strong className="kit-title">UI-кит</strong>
        {group("Тема", THEMES, theme, setTheme)}
        <div className="kit-group" role="group" aria-label="Акцент">
          <span className="kit-group-label">Акцент</span>
          {ACCENTS.map((id) => (
            <button
              key={id}
              type="button"
              className="kit-swatch"
              data-accent={id}
              aria-label={id}
              aria-pressed={accent === id}
              onClick={() => setAccent(id)}
            />
          ))}
        </div>
        {group("Плотность", DENSITIES, density, setDensity)}
        {group("Текст", TEXTS, text, setText)}
      </header>
      <main className="kit-body">
        <KitA />
        <KitB />
      </main>
    </div>
  );
}
