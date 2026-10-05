import { useId, useState } from "react";
import {
  Check,
  CircleAlert,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Rows3,
  RotateCcw,
  Sun,
  Type,
  UserRound,
  Wind,
  Wrench
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  IconTile,
  ListGroup,
  ListRow,
  PageHeader,
  ProgressRing,
  Section,
  Segmented,
  Switch,
  TextInput
} from "../ui";
import { ACCENTS, DEFAULT_APPEARANCE, useAppearance } from "../appearance.js";
import { BrandMark } from "../shell/Shell.jsx";
import { PasswordInput, passwordStrength } from "./PasswordField.jsx";
import "../styles/screen-settings.css";

// Раздел «Настройки». Раньше это был блок `activeSection === "settings"` в App.jsx.
//
// Свойства (состояние и обработчики остаются в App.jsx):
//   user, roleText, displayName       кто вошёл; roleText: «Админ платформы» и т. п.
//   profileName, onProfileNameChange(value)
//   onSaveProfile(event)              submit формы имени (async, сам вызывает preventDefault)
//   profileError                      formErrors.profile
//   currentPassword, onCurrentPasswordChange(value)
//   newPassword, onNewPasswordChange(value)
//   onChangePassword(event)           submit формы смены пароля (async)
//   passwordError                     formErrors.myPassword
//   canResetDemo, onResetDemo()       служебный сброс демо-данных
//   onLogout()
//
// Внешний вид (тема, акцент, плотность, текст, движение) читается и пишется
// напрямую через useAppearance: это настройка устройства, а не профиля.

const THEME_OPTIONS = [
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
  { value: "system", label: "Как в системе", icon: Monitor }
];
const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Комфортная" },
  { value: "compact", label: "Компактная" }
];
const TEXT_OPTIONS = [
  { value: "normal", label: "Обычный" },
  { value: "large", label: "Крупный" }
];
const ACCENT_NAMES = {
  teal: "Бирюзовый",
  blue: "Синий",
  indigo: "Индиго",
  violet: "Фиолетовый",
  rose: "Розовый",
  orange: "Оранжевый",
  graphite: "Графитовый"
};

// Выполняет асинхронный submit и показывает «идёт сохранение» на кнопке.
function usePending() {
  const [pending, setPending] = useState(false);
  const run = (handler) => async (event) => {
    if (pending) {
      event.preventDefault();
      return;
    }
    setPending(true);
    try {
      await handler(event);
    } finally {
      setPending(false);
    }
  };
  return [pending, run];
}

/* ------------------------------------------------------------ Предпросмотр */

// Миниатюра приложения на тех же токенах, что и настоящий интерфейс: меняется
// сразу вместе с темой, акцентом, плотностью и размером текста.
function AppearancePreview() {
  return (
    <div className="set-preview" aria-hidden="true" inert>
      <div className="set-mock">
        <div className="set-mock__side">
          <BrandMark size={24} />
          <span className="set-mock__nav set-mock__nav--on" />
          <span className="set-mock__nav" />
          <span className="set-mock__nav" />
        </div>
        <div className="set-mock__main">
          <div className="set-mock__top">
            <div className="set-mock__heading">
              <strong>Сводка команды</strong>
              <span>Понедельник, 5 октября</span>
            </div>
            <Avatar name="Анна Морозова" size={32} decorative />
          </div>
          <div className="set-mock__card">
            <ProgressRing value={78} size={52} stroke={6} tone="success" label="Пульс 78">
              <span className="set-mock__score num">78</span>
            </ProgressRing>
            <div className="set-mock__card-text">
              <strong>Пульс команды</strong>
              <Badge tone="success" size="sm">
                Всё в порядке
              </Badge>
            </div>
            <Switch checked onChange={() => {}} tabIndex={-1} aria-label="Пример переключателя" />
          </div>
          <div className="set-mock__actions">
            <Button size="sm" tabIndex={-1}>
              Подготовить 1:1
            </Button>
            <Button size="sm" variant="tinted" tabIndex={-1}>
              Позже
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Строка настройки */

// Строка в духе iOS: плитка с иконкой, название и пояснение, ниже на всю ширину
// сам контрол (на узком экране ему нужна вся строка), либо справа trailing.
function Pref({ icon, tone, title, hint, trailing, children, titleId }) {
  return (
    <div className="set-pref" role="group" aria-labelledby={titleId}>
      <div className="set-pref__head">
        <IconTile icon={icon} tone={tone} />
        <div className="set-pref__text">
          <span className="set-pref__title" id={titleId}>
            {title}
          </span>
          {hint ? <span className="set-pref__hint">{hint}</span> : null}
        </div>
        {trailing ? <div className="set-pref__trailing">{trailing}</div> : null}
      </div>
      {children ? <div className="set-pref__control">{children}</div> : null}
    </div>
  );
}

function AccentPicker({ value, onChange }) {
  const name = useId();
  return (
    <div className="set-swatches" role="radiogroup" aria-label="Акцентный цвет">
      {ACCENTS.map((accent) => (
        <label key={accent} className="set-swatch" data-accent={accent} title={ACCENT_NAMES[accent]}>
          <input
            className="set-swatch__input"
            type="radio"
            name={name}
            value={accent}
            checked={value === accent}
            onChange={() => onChange(accent)}
          />
          <span className="set-swatch__dot" aria-hidden="true">
            <Check size={16} strokeWidth={3} />
          </span>
          <span className="sr-only">{ACCENT_NAMES[accent]}</span>
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Внешний вид */

function AppearanceCard() {
  const { appearance, setAppearance, resetAppearance } = useAppearance();
  const id = useId();
  const pristine = Object.keys(DEFAULT_APPEARANCE)
    .filter((key) => key !== "sidebarCollapsed")
    .every((key) => appearance[key] === DEFAULT_APPEARANCE[key]);

  return (
    <Card padded={false} className="set-card set-appearance" aria-label="Внешний вид">
      <div className="set-pad">
        <CardHeader
          icon={Palette}
          title="Внешний вид"
          subtitle="Изменения применяются сразу и хранятся на этом устройстве."
        />
        <AppearancePreview />
        <p className="set-preview__caption">Так выглядит интерфейс с текущими настройками.</p>
      </div>

      <div className="set-prefs">
        <Pref icon={Sun} tone="info" title="Тема" hint="Светлая, тёмная или под настройки системы" titleId={`${id}-theme`}>
          <Segmented
            ariaLabel="Тема интерфейса"
            fullWidth
            options={THEME_OPTIONS}
            value={appearance.theme}
            onChange={(theme) => setAppearance({ theme })}
          />
        </Pref>

        <Pref
          icon={Palette}
          tone="accent"
          title="Акцентный цвет"
          hint={`Сейчас: ${ACCENT_NAMES[appearance.accent]}`}
          titleId={`${id}-accent`}
        >
          <AccentPicker value={appearance.accent} onChange={(accent) => setAppearance({ accent })} />
        </Pref>

        <Pref icon={Rows3} tone="success" title="Плотность" hint="Компактная вмещает больше на экран" titleId={`${id}-density`}>
          <Segmented
            ariaLabel="Плотность интерфейса"
            fullWidth
            options={DENSITY_OPTIONS}
            value={appearance.density}
            onChange={(density) => setAppearance({ density })}
          />
        </Pref>

        <Pref icon={Type} tone="warning" title="Размер текста" hint="Крупный увеличивает весь интерфейс" titleId={`${id}-text`}>
          <Segmented
            ariaLabel="Размер текста"
            fullWidth
            options={TEXT_OPTIONS}
            value={appearance.text}
            onChange={(text) => setAppearance({ text })}
          />
        </Pref>

        <Pref
          icon={Wind}
          tone="neutral"
          title="Уменьшить движение"
          hint="Меньше анимаций и переходов"
          titleId={`${id}-motion`}
          trailing={
            <Switch
              aria-labelledby={`${id}-motion`}
              checked={appearance.motion === "reduced"}
              onChange={(checked) => setAppearance({ motion: checked ? "reduced" : "system" })}
            />
          }
        />
      </div>

      <div className="set-foot">
        <p className="set-foot__text">Тема, акцент, плотность, размер текста и движение.</p>
        <Button variant="neutral" icon={RotateCcw} onClick={resetAppearance} disabled={pristine} aria-label="Сбросить внешний вид">
          Сбросить
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Профиль */

function ProfileCard({ user, displayName, roleText, profileName, onProfileNameChange, onSaveProfile, profileError }) {
  const [pending, run] = usePending();
  const errorId = `${useId()}-profile-error`;

  return (
    // .settings-card: на этот класс опираются тесты (smoke.spec.js ищет карточку по тексту «Как вас зовут»).
    <Card className="set-card set-profile settings-card">
      <CardHeader
        icon={UserRound}
        title="Как вас зовут"
        subtitle={
          <>
            Имя видно в шапке и в списке доступов. Логин (<code>{user?.username}</code>) изменить нельзя.
          </>
        }
      />
      <div className="set-identity">
        <Avatar name={displayName} size={56} decorative />
        <div className="set-identity__text">
          <strong>{displayName}</strong>
          <span>
            <Badge size="sm">{roleText}</Badge>
          </span>
        </div>
      </div>
      <form className="set-form" noValidate onSubmit={run(onSaveProfile)}>
        <Field label="Имя">
          {(props) => (
            <TextInput
              {...props}
              aria-describedby={profileError ? errorId : props["aria-describedby"]}
              aria-invalid={profileError ? true : undefined}
              value={profileName}
              onChange={(event) => onProfileNameChange(event.target.value)}
              autoComplete="name"
            />
          )}
        </Field>
        {profileError ? (
          <div className="set-alert" id={errorId} role="alert">
            <CircleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{profileError}</span>
          </div>
        ) : null}
        <div className="set-form__actions">
          <Button type="submit" icon={Check} loading={pending}>
            Сохранить
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------ Безопасность */

function StrengthHint({ password }) {
  const strength = passwordStrength(password);
  return (
    <span className="set-strength">
      <span className="set-strength__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className="set-strength__bar" data-on={strength.level >= step ? "true" : "false"} data-tone={strength.tone} />
        ))}
      </span>
      <span className="set-strength__text">
        {strength.label ? <strong className={`set-strength__label set-strength__label--${strength.tone}`}>{strength.label}. </strong> : null}
        Не короче 8 символов; добавьте цифры, заглавные буквы и знаки.
      </span>
    </span>
  );
}

function SecurityCard({
  currentPassword,
  onCurrentPasswordChange,
  newPassword,
  onNewPasswordChange,
  onChangePassword,
  passwordError
}) {
  const [pending, run] = usePending();
  const errorId = `${useId()}-password-error`;
  const extras = (props) => ({
    ...props,
    "aria-describedby": passwordError ? [errorId, props["aria-describedby"]].filter(Boolean).join(" ") : props["aria-describedby"],
    "aria-invalid": passwordError ? true : props["aria-invalid"]
  });

  return (
    <Card className="set-card set-security">
      <CardHeader
        icon={KeyRound}
        iconTone="warning"
        title="Сменить пароль"
        subtitle="Все активные сессии этого аккаунта на других устройствах будут закрыты."
      />
      <form className="set-form" noValidate onSubmit={run(onChangePassword)}>
        <Field label="Текущий пароль">
          {(props) => (
            <PasswordInput
              {...extras(props)}
              value={currentPassword}
              onChange={(event) => onCurrentPasswordChange(event.target.value)}
              autoComplete="current-password"
            />
          )}
        </Field>
        <Field label="Новый пароль" hint={<StrengthHint password={newPassword} />}>
          {(props) => (
            <PasswordInput
              {...extras(props)}
              value={newPassword}
              onChange={(event) => onNewPasswordChange(event.target.value)}
              placeholder="минимум 8 символов"
              autoComplete="new-password"
            />
          )}
        </Field>
        {passwordError ? (
          <div className="set-alert" id={errorId} role="alert">
            <CircleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{passwordError}</span>
          </div>
        ) : null}
        <div className="set-form__actions">
          <Button type="submit" icon={KeyRound} loading={pending} disabled={!currentPassword || !newPassword}>
            Сменить пароль
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------ Экран */

export default function SettingsScreen({
  user,
  roleText,
  displayName,
  profileName,
  onProfileNameChange,
  onSaveProfile,
  profileError,
  currentPassword,
  onCurrentPasswordChange,
  newPassword,
  onNewPasswordChange,
  onChangePassword,
  passwordError,
  canResetDemo,
  onResetDemo,
  onLogout
}) {
  return (
    <section className="set" aria-label="Настройки">
      <PageHeader title="Настройки" subtitle="Профиль, внешний вид и безопасность аккаунта" />

      <div className="set-grid">
        <div className="set-col set-col--main">
          <AppearanceCard />
        </div>

        <div className="set-col set-col--side">
          <ProfileCard
            user={user}
            displayName={displayName}
            roleText={roleText}
            profileName={profileName}
            onProfileNameChange={onProfileNameChange}
            onSaveProfile={onSaveProfile}
            profileError={profileError}
          />
          <SecurityCard
            currentPassword={currentPassword}
            onCurrentPasswordChange={onCurrentPasswordChange}
            newPassword={newPassword}
            onNewPasswordChange={onNewPasswordChange}
            onChangePassword={onChangePassword}
            passwordError={passwordError}
          />

          <Section title="Аккаунт" className="set-account">
            <ListGroup>
              <ListRow
                icon={LogOut}
                iconTone="danger"
                title="Выйти"
                subtitle="Завершить сеанс на этом устройстве"
                chevron
                onClick={onLogout}
              />
            </ListGroup>
          </Section>

          {canResetDemo && (
            <Card className="set-card set-service">
              <CardHeader
                icon={Wrench}
                iconTone="neutral"
                title="Сбросить демо-данные"
                subtitle="Удаляет рабочую команду и возвращает seed-аккаунты. Сессия не закрывается."
              />
              <div className="set-form__actions">
                <Button variant="neutral" icon={RotateCcw} onClick={onResetDemo}>
                  Сбросить демо-данные
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
