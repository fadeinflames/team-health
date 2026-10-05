import { Children, cloneElement, isValidElement, useId } from "react";
import { CircleAlert } from "lucide-react";
import { cx, joinIds } from "./util.js";

// Подпись над полем (всегда видна), подсказка или ошибка под полем. Field сам
// связывает их с контролом: label[for], aria-describedby, aria-invalid.
//
//   <Field label="Почта" hint="Рабочий адрес" error={error} required>
//     {(fieldProps) => <TextInput {...fieldProps} type="email" />}
//   </Field>
//
// Вместо функции можно передать готовый элемент: он будет склонирован с теми же свойствами.
export function Field({ label, hint, error, required, id, children, className, ...rest }) {
  const auto = useId();
  const fieldId = id || `ui-field-${auto}`;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const hasError = Boolean(error);

  const fieldProps = {
    id: fieldId,
    "aria-describedby": hasError ? errorId : hint ? hintId : undefined,
    "aria-invalid": hasError ? true : undefined,
    required: required ? true : undefined
  };

  let control = null;
  if (typeof children === "function") {
    control = children(fieldProps);
  } else if (isValidElement(children)) {
    const own = children.props;
    control = cloneElement(children, {
      id: own.id ?? fieldProps.id,
      "aria-describedby": joinIds(own["aria-describedby"], fieldProps["aria-describedby"]),
      "aria-invalid": fieldProps["aria-invalid"] ?? own["aria-invalid"],
      required: fieldProps.required ?? own.required
    });
  } else {
    control = Children.toArray(children);
  }

  return (
    <div {...rest} className={cx("ui-field", hasError && "ui-field--invalid", className)}>
      {label ? (
        <label className="ui-field__label" htmlFor={fieldId}>
          {label}
          {required ? (
            <>
              <span className="ui-field__star" aria-hidden="true">
                {" *"}
              </span>
              <span className="sr-only"> (обязательно)</span>
            </>
          ) : null}
        </label>
      ) : null}
      <div className="ui-field__control">{control}</div>
      <div className="ui-field__msg" aria-live="polite">
        {hasError ? (
          <p className="ui-field__error" id={errorId}>
            <CircleAlert className="ui-field__error-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p className="ui-field__hint" id={hintId}>
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
