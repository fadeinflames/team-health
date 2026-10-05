import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, Search, X } from "lucide-react";
import { cx, joinIds, mergeRefs, renderIcon } from "./util.js";

const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true };

// Клик по полю вне самого <input> (по иконке, отступу) переводит фокус в поле.
function focusOnWrapPress(event) {
  if (event.target !== event.currentTarget) return;
  const control = event.currentTarget.querySelector(".ui-input, .ui-textarea, .ui-select__native");
  if (control && !control.disabled) {
    event.preventDefault();
    control.focus();
  }
}

function isInvalid(invalid, props) {
  return Boolean(invalid) || props["aria-invalid"] === true || props["aria-invalid"] === "true";
}

/* ---------------------------------------------------------------- TextInput */

// Однострочное поле. className уходит на оболочку, остальные свойства и ref: на <input>.
export function TextInput({
  leading,
  trailing,
  invalid,
  size = "md",
  type = "text",
  revealable = false,
  className,
  disabled,
  ref,
  ...input
}) {
  const [shown, setShown] = useState(false);
  const inputRef = useRef(null);
  const isPassword = type === "password";
  const canReveal = revealable && isPassword;
  const bad = isInvalid(invalid, input);

  return (
    <div
      className={cx(
        "ui-input-wrap",
        size === "sm" && "ui-input-wrap--sm",
        bad && "ui-input-wrap--invalid",
        disabled && "ui-input-wrap--disabled",
        className
      )}
      onMouseDown={focusOnWrapPress}
    >
      {leading ? <span className="ui-input__adorn ui-input__adorn--leading">{renderIcon(leading, ICON)}</span> : null}
      <input
        {...input}
        ref={mergeRefs(ref, inputRef)}
        className="ui-input"
        type={canReveal && shown ? "text" : type}
        disabled={disabled}
        aria-invalid={bad ? true : input["aria-invalid"]}
      />
      {trailing ? <span className="ui-input__adorn ui-input__adorn--trailing">{renderIcon(trailing, ICON)}</span> : null}
      {canReveal ? (
        <button
          type="button"
          className="ui-input__action"
          aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          disabled={disabled}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? <EyeOff {...ICON} /> : <Eye {...ICON} />}
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- SearchInput */

// Поиск: лупа слева, кнопка очистки справа, role="search" на оболочке.
// Работает и как управляемое (value), и как неуправляемое (defaultValue) поле.
export function SearchInput({
  onClear,
  value,
  defaultValue,
  onChange,
  onKeyDown,
  size = "md",
  invalid,
  disabled,
  className,
  placeholder = "Поиск",
  ref,
  ...input
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value !== undefined ? value : inner;
  const inputRef = useRef(null);
  const label = input["aria-label"] || (typeof placeholder === "string" ? placeholder : "Поиск");

  const clear = () => {
    setInner("");
    onClear?.();
    inputRef.current?.focus();
  };

  const handleChange = (event) => {
    setInner(event.target.value);
    onChange?.(event);
  };

  const handleKeyDown = (event) => {
    onKeyDown?.(event);
    if (!event.defaultPrevented && event.key === "Escape" && String(current).length > 0) {
      event.preventDefault();
      event.stopPropagation();
      clear();
    }
  };

  const bad = isInvalid(invalid, input);

  return (
    <div
      role="search"
      aria-label={label}
      className={cx(
        "ui-input-wrap",
        "ui-input-wrap--search",
        size === "sm" && "ui-input-wrap--sm",
        bad && "ui-input-wrap--invalid",
        disabled && "ui-input-wrap--disabled",
        className
      )}
      onMouseDown={focusOnWrapPress}
    >
      <span className="ui-input__adorn ui-input__adorn--leading">
        <Search {...ICON} />
      </span>
      <input
        autoComplete="off"
        {...input}
        ref={mergeRefs(ref, inputRef)}
        className="ui-input"
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        value={current}
        disabled={disabled}
        aria-label={label}
        aria-invalid={bad ? true : input["aria-invalid"]}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {String(current).length > 0 && !disabled ? (
        <button type="button" className="ui-input__action" aria-label="Очистить поиск" onClick={clear}>
          <X {...ICON} />
        </button>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- TextArea */

// Многострочное поле. autoGrow растит высоту по тексту без прыжков (замер и
// установка высоты идут до отрисовки кадра), showCount показывает «n / maxLength».
export function TextArea({
  autoGrow = false,
  rows = 3,
  maxLength,
  showCount = false,
  invalid,
  disabled,
  className,
  value,
  defaultValue,
  onChange,
  onInput,
  ref,
  ...input
}) {
  const areaRef = useRef(null);
  const countId = useId();
  const [innerLength, setInnerLength] = useState(String(defaultValue ?? "").length);
  const length = value !== undefined ? String(value).length : innerLength;
  const bad = isInvalid(invalid, input);

  const fit = useCallback(() => {
    const el = areaRef.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [autoGrow]);

  useLayoutEffect(fit, [fit, value, length]);

  useEffect(() => {
    const el = areaRef.current;
    if (!autoGrow || !el || typeof ResizeObserver === "undefined") return undefined;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoGrow, fit]);

  const counting = showCount;
  const nearLimit = maxLength && length >= maxLength * 0.9;

  return (
    <div
      className={cx(
        "ui-input-wrap",
        "ui-input-wrap--area",
        bad && "ui-input-wrap--invalid",
        disabled && "ui-input-wrap--disabled",
        className
      )}
      onMouseDown={focusOnWrapPress}
    >
      <textarea
        {...input}
        ref={mergeRefs(ref, areaRef)}
        className={cx("ui-textarea", autoGrow && "ui-textarea--grow")}
        rows={rows}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={bad ? true : input["aria-invalid"]}
        aria-describedby={joinIds(input["aria-describedby"], counting ? countId : undefined)}
        onChange={(event) => {
          setInnerLength(event.target.value.length);
          onChange?.(event);
        }}
        onInput={(event) => {
          fit();
          onInput?.(event);
        }}
      />
      {counting ? (
        <span id={countId} className={cx("ui-textarea__count", "num", nearLimit && "is-near")}>
          {maxLength ? `${length} / ${maxLength}` : length}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Select */

// Нативный <select> в оформлении поля: клавиатура и мобильные пикеры остаются системными.
export function Select({
  options,
  children,
  placeholder,
  invalid,
  size = "md",
  disabled,
  className,
  value,
  defaultValue,
  onChange,
  ref,
  ...select
}) {
  const initial = value ?? defaultValue ?? (placeholder ? "" : undefined);
  const [inner, setInner] = useState(initial);
  const current = value !== undefined ? value : inner;
  const empty = Boolean(placeholder) && (current === "" || current === undefined || current === null);
  const bad = isInvalid(invalid, select);

  const controlled = value !== undefined;
  const valueProps = controlled ? { value } : { defaultValue: defaultValue ?? (placeholder ? "" : undefined) };

  return (
    <div
      className={cx(
        "ui-input-wrap",
        "ui-select",
        size === "sm" && "ui-input-wrap--sm",
        bad && "ui-input-wrap--invalid",
        disabled && "ui-input-wrap--disabled",
        empty && "ui-select--empty",
        className
      )}
      onMouseDown={focusOnWrapPress}
    >
      <select
        {...select}
        {...valueProps}
        ref={ref}
        className="ui-select__native"
        disabled={disabled}
        aria-invalid={bad ? true : select["aria-invalid"]}
        onChange={(event) => {
          setInner(event.target.value);
          onChange?.(event);
        }}
      >
        {placeholder ? (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        ) : null}
        {options
          ? options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))
          : children}
      </select>
      <span className="ui-select__chevron" aria-hidden="true">
        <ChevronDown {...ICON} />
      </span>
    </div>
  );
}
