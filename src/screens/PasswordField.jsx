import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Поле пароля с кнопкой «показать/скрыть». Собрано на классах поля из src/ui
// (ui-input-wrap / ui-input / ui-input__action), чтобы подпись кнопки можно было
// задать самому: на экране входа она не должна содержать слово «пароль», иначе
// getByLabel("Пароль") в тестах находит два элемента.
//
//   <Field label="Пароль">{(p) => <PasswordInput {...p} value={v} onChange={...} />}</Field>
//
// Свойства Field (id, aria-describedby, aria-invalid) приходят в ...input.
// toggleNoun: что именно показываем; кнопка читается «Показать <toggleNoun>».
export function PasswordInput({ toggleNoun = "пароль", invalid, className, disabled, ...input }) {
  const [shown, setShown] = useState(false);
  const bad = Boolean(invalid) || input["aria-invalid"] === true || input["aria-invalid"] === "true";
  const icon = { size: 18, strokeWidth: 1.75, "aria-hidden": true };

  const focusOnPress = (event) => {
    if (event.target !== event.currentTarget) return;
    const control = event.currentTarget.querySelector("input");
    if (control && !control.disabled) {
      event.preventDefault();
      control.focus();
    }
  };

  const classes = ["ui-input-wrap", bad && "ui-input-wrap--invalid", disabled && "ui-input-wrap--disabled", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} onMouseDown={focusOnPress}>
      <input {...input} className="ui-input" type={shown ? "text" : "password"} disabled={disabled} aria-invalid={bad ? true : input["aria-invalid"]} />
      <button
        type="button"
        className="ui-input__action"
        aria-label={`${shown ? "Скрыть" : "Показать"} ${toggleNoun}`}
        aria-pressed={shown}
        disabled={disabled}
        onClick={() => setShown((value) => !value)}
      >
        {shown ? <EyeOff {...icon} /> : <Eye {...icon} />}
      </button>
    </div>
  );
}

// Оценка надёжности нового пароля: только подсказка, сервер требует лишь 8 символов.
export function passwordStrength(password) {
  if (!password) return { level: 0, label: "", tone: "neutral" };
  if (password.length < 8) return { level: 1, label: "Слишком короткий", tone: "danger" };
  let points = 0;
  if (password.length >= 12) points += 1;
  if (/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^\p{L}\p{N}]/u.test(password)) points += 1;
  if (points <= 1) return { level: 2, label: "Простой", tone: "warning" };
  if (points === 2) return { level: 3, label: "Хороший", tone: "info" };
  return { level: 4, label: "Надёжный", tone: "success" };
}
