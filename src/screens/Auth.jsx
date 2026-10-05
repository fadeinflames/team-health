import { useId, useState } from "react";
import { CircleAlert, Lock, LogOut, ShieldCheck, UserRoundX } from "lucide-react";
import { Badge, Button, Field, Skeleton, TextInput } from "../ui";
import { BrandMark } from "../shell/Shell.jsx";
import { PasswordInput } from "./PasswordField.jsx";
import "../styles/screen-auth.css";

// Экран до входа в рабочее пространство. Три режима (то, что раньше были тремя
// ранними return в App.jsx):
//
//   mode="loading"    проверяем сессию (authState === "loading"): скелетон
//   mode="login"      вход по логину и паролю (нет user)
//   mode="no-profile" вошли, но логин не привязан к профилю 1:1
//
// Свойства:
//   mode        "loading" | "login" | "no-profile"
//   loginError  строка с ошибкой входа от сервера ("" если нет)       (login)
//   onLogin     async ({ username, password }) => void; сам ловит ошибки и
//               кладёт их в loginError, поэтому промис не отклоняется    (login)
//   onLogout    () => void                                          (no-profile)
//
// Логин и пароль в форме и состояние «идёт вход» живут здесь: это локальное
// состояние экрана, наружу уходит только отправка.

function AuthFrame({ children, ...rest }) {
  return (
    <main className="auth" {...rest}>
      {children}
    </main>
  );
}

function LoadingCard() {
  return (
    <AuthFrame aria-busy="true">
      <div className="auth-card auth-card--center" role="status">
        <BrandMark size={56} />
        <h1 className="auth-title">Team Health 1:1</h1>
        <p className="auth-lead">Загружаем данные.</p>
        <div className="auth-skeleton" aria-hidden="true">
          <Skeleton height={44} radius={14} />
          <Skeleton height={44} radius={14} />
          <Skeleton height={52} radius={14} />
        </div>
      </div>
    </AuthFrame>
  );
}

function NoProfileCard({ onLogout }) {
  return (
    <AuthFrame>
      <div className="auth-card auth-card--center">
        <span className="auth-glyph" aria-hidden="true">
          <UserRoundX size={26} strokeWidth={1.75} />
        </span>
        <h1 className="auth-title">Нет доступного профиля</h1>
        <p className="auth-lead">Администратор должен привязать ваш логин к профилю участника 1:1.</p>
        <Button variant="neutral" size="lg" fullWidth icon={LogOut} onClick={onLogout}>
          Выйти
        </Button>
      </div>
    </AuthFrame>
  );
}

function LoginCard({ loginError, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(null); // null | "login" | "demo"
  const errorId = `auth-error-${useId()}`;
  const hasError = Boolean(loginError);

  async function submit(credentials, kind) {
    if (pending) return;
    setPending(kind);
    try {
      await onLogin(credentials);
    } finally {
      setPending(null);
    }
  }

  const fieldExtras = (props) => ({
    ...props,
    "aria-describedby": hasError ? errorId : props["aria-describedby"],
    "aria-invalid": hasError ? true : props["aria-invalid"]
  });

  return (
    <AuthFrame>
      <form
        className="auth-card auth-card--login"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit({ username, password }, "login");
        }}
      >
        <BrandMark size={56} />
        <div className="auth-head">
          <Badge tone="accent" icon={Lock}>
            Доступ только для команды
          </Badge>
          <h1 className="auth-title">
            Войти в <span className="auth-nowrap">Team Health 1:1</span>
          </h1>
          <p className="auth-lead">Данные встреч, пульса и заметок не загружаются в браузер до авторизации.</p>
        </div>

        <div className="auth-fields">
          <Field label="Логин">
            {(props) => (
              <TextInput
                {...fieldExtras(props)}
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Логин"
              />
            )}
          </Field>
          <Field label="Пароль">
            {(props) => (
              <PasswordInput
                {...fieldExtras(props)}
                name="password"
                autoComplete="current-password"
                enterKeyHint="go"
                toggleNoun="символы"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введите пароль"
              />
            )}
          </Field>
        </div>

        {hasError && (
          <div className="auth-alert" id={errorId} role="alert">
            <CircleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{loginError}</span>
          </div>
        )}

        <div className="auth-actions">
          <Button type="submit" size="lg" fullWidth icon={ShieldCheck} loading={pending === "login"} disabled={pending === "demo"}>
            Войти
          </Button>
          <div className="auth-or" aria-hidden="true">
            <span>или</span>
          </div>
          <Button
            variant="neutral"
            size="lg"
            fullWidth
            loading={pending === "demo"}
            disabled={pending === "login"}
            onClick={() => submit({ username: "demo", password: "demo" }, "demo")}
          >
            Войти в демо
          </Button>
        </div>
      </form>
    </AuthFrame>
  );
}

export default function AuthScreen({ mode = "login", loginError = "", onLogin, onLogout }) {
  if (mode === "loading") return <LoadingCard />;
  if (mode === "no-profile") return <NoProfileCard onLogout={onLogout} />;
  return <LoginCard loginError={loginError} onLogin={onLogin} />;
}
