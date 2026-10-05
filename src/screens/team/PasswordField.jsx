import { useState } from "react";
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button, IconButton, TextInput, useToast } from "../../ui";
import { copyText, generatePassword } from "./clipboard.js";

// Поле пароля с «глазом», генератором и копированием.
//
// Подписи кнопок намеренно без слова «пароль»: тесты и читалки находят поле по
// подписи «Пароль» (getByLabel ищет и по aria-label), и кнопка с тем же словом
// в имени делала бы поиск неоднозначным. «Показать символы» читалка озвучивает
// так же понятно.
//
// Props: value, onValueChange(string); tools (показывать «Сгенерировать» и
// «Копировать»); остальное (id, aria-*) уходит в <input>.
export default function PasswordField({ value, onValueChange, tools = false, placeholder, ...input }) {
  const [shown, setShown] = useState(false);
  const { toast } = useToast();

  const generate = () => {
    onValueChange(generatePassword());
    setShown(true);
  };

  const copy = async () => {
    if (!value) return;
    const ok = await copyText(value);
    toast(
      ok
        ? { title: "Пароль скопирован", tone: "success" }
        : { title: "Не удалось скопировать", description: "Выделите текст в поле и скопируйте вручную.", tone: "danger" }
    );
  };

  return (
    <div className="team-pw">
      <div className="team-pw__box">
        <TextInput
          {...input}
          className="team-pw__input"
          type={shown ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete="new-password"
          spellCheck={false}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <IconButton
          className="team-pw__eye"
          size="sm"
          label={shown ? "Скрыть символы" : "Показать символы"}
          aria-pressed={shown}
          icon={shown ? EyeOff : Eye}
          onClick={() => setShown((current) => !current)}
        />
      </div>
      {tools ? (
        <div className="team-pw__tools">
          <Button variant="plain" size="sm" icon={RefreshCw} onClick={generate}>
            Сгенерировать
          </Button>
          <Button variant="plain" size="sm" icon={Copy} disabled={!value} onClick={copy}>
            Копировать
          </Button>
        </div>
      ) : null}
    </div>
  );
}
