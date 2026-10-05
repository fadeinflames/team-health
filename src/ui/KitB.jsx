import { useRef, useState } from "react";
import {
  Archive,
  AtSign,
  Calendar,
  Copy,
  Heart,
  LayoutGrid,
  List,
  Lock,
  Mail,
  Pencil,
  Settings,
  Share,
  Target,
  Trash2,
  Users
} from "lucide-react";
import {
  Checkbox,
  ConfirmDialog,
  Dialog,
  Field,
  Menu,
  Popover,
  SearchInput,
  Segmented,
  Select,
  Sheet,
  Slider,
  Switch,
  TabPanel,
  Tabs,
  TextArea,
  TextInput,
  ToastProvider,
  useToast
} from "./b/index.js";

const TEAMS = [
  { value: "platform", label: "Платформа" },
  { value: "mobile", label: "Мобильное приложение" },
  { value: "data", label: "Данные и аналитика" },
  { value: "design", label: "Дизайн", disabled: true }
];

function Section({ title, note, children }) {
  return (
    <section className="kit-section">
      <h2>{title}</h2>
      {note ? <p className="kit-note">{note}</p> : null}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------- Форма-образец */

function FormSample() {
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState("");
  const [about, setAbout] = useState("Хочу обсудить рост до тимлида и нагрузку в этом квартале.");
  const [agree, setAgree] = useState(true);
  const [notify, setNotify] = useState(true);
  const [digest, setDigest] = useState(false);
  const [mood, setMood] = useState(70);
  const [channels, setChannels] = useState({ mail: true, chat: false, push: true });

  const all = Object.values(channels).every(Boolean);
  const some = Object.values(channels).some(Boolean);
  const emailError = email && !email.includes("@") ? "В адресе не хватает знака «@»" : undefined;

  return (
    <div className="kit-b-panel">
      <div className="kit-b-grid">
        <div className="kit-b-stack">
          <Field label="Рабочая почта" hint="Мы пришлём на неё приглашение" error={emailError} required>
            {(fieldProps) => (
              <TextInput
                {...fieldProps}
                type="email"
                autoComplete="email"
                placeholder="name@company.ru"
                leading={<AtSign />}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
          <Field label="Пароль" hint="Не короче 10 символов">
            {(fieldProps) => (
              <TextInput
                {...fieldProps}
                type="password"
                revealable
                autoComplete="new-password"
                placeholder="Придумайте пароль"
                defaultValue="correct-horse-battery"
                leading={<Lock />}
              />
            )}
          </Field>
          <Field label="Команда">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                placeholder="Выберите команду"
                options={TEAMS}
                value={team}
                onChange={(event) => setTeam(event.target.value)}
              />
            )}
          </Field>
          <Field label="О чём поговорить на встрече" hint="Видно только вам и руководителю">
            {(fieldProps) => (
              <TextArea
                {...fieldProps}
                autoGrow
                rows={3}
                maxLength={280}
                showCount
                value={about}
                onChange={(event) => setAbout(event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="kit-b-stack">
          <div>
            <p className="kit-b-label">Каналы уведомлений</p>
            <div className="kit-b-stack" style={{ gap: "var(--sp-3)" }}>
              <Checkbox
                label="Все каналы"
                checked={all}
                indeterminate={some && !all}
                onChange={(event) => setChannels({ mail: event.target.checked, chat: event.target.checked, push: event.target.checked })}
              />
              <div className="kit-b-stack" style={{ gap: "var(--sp-3)", paddingLeft: "var(--sp-8)" }}>
                <Checkbox
                  label="Почта"
                  description="Письмо с итогами встречи"
                  checked={channels.mail}
                  onChange={(event) => setChannels({ ...channels, mail: event.target.checked })}
                />
                <Checkbox label="Чат" checked={channels.chat} onChange={(event) => setChannels({ ...channels, chat: event.target.checked })} />
                <Checkbox label="Push на телефон" checked={channels.push} onChange={(event) => setChannels({ ...channels, push: event.target.checked })} />
              </div>
            </div>
          </div>
          <div className="kit-b-sep" />
          <Switch label="Напоминать о встречах" description="За час до начала" checked={notify} onChange={setNotify} />
          <Switch label="Недельная сводка" checked={digest} onChange={setDigest} />
          <div className="kit-b-sep" />
          <Slider label="Настроение за неделю" showValue unit="%" value={mood} onChange={setMood} />
          <Checkbox
            label="Я согласен с правилами обработки данных"
            checked={agree}
            onChange={(event) => setAgree(event.target.checked)}
          />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Состояния */

function FieldStates() {
  const [query, setQuery] = useState("");
  return (
    <div className="kit-b-panel">
      <div className="kit-b-grid">
        <Field label="Ошибка" error="Укажите имя участника" required>
          {(fieldProps) => <TextInput {...fieldProps} defaultValue="" placeholder="Имя и фамилия" />}
        </Field>
        <Field label="Недоступно" hint="Поле заполняет руководитель">
          {(fieldProps) => <TextInput {...fieldProps} disabled defaultValue="Анна Соколова" />}
        </Field>
        <Field label="С иконками">
          {(fieldProps) => (
            <TextInput {...fieldProps} type="email" placeholder="Почта" leading={<Mail />} trailing={<span className="num">@team</span>} />
          )}
        </Field>
        <Field label="Компактное поле">
          {(fieldProps) => <TextInput {...fieldProps} size="sm" placeholder="Короткий ответ" />}
        </Field>
        <Field label="Поиск">
          {(fieldProps) => (
            <SearchInput
              {...fieldProps}
              placeholder="Найти участника"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery("")}
            />
          )}
        </Field>
        <Field label="Список с ошибкой" error="Выберите команду">
          {(fieldProps) => <Select {...fieldProps} placeholder="Не выбрано" options={TEAMS} />}
        </Field>
        <Field label="Многострочное, недоступно">
          {(fieldProps) => <TextArea {...fieldProps} disabled rows={2} defaultValue="Комментарий закрыт для правок" />}
        </Field>
        <div className="kit-b-stack" style={{ gap: "var(--sp-3)" }}>
          <p className="kit-b-label">Недоступные переключатели</p>
          <Checkbox label="Флажок выключен" disabled />
          <Checkbox label="Флажок включён" disabled defaultChecked />
          <Switch label="Переключатель" disabled defaultChecked />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Сегменты */

function SegmentedDemo() {
  const [period, setPeriod] = useState("week");
  const [view, setView] = useState("list");
  const [scope, setScope] = useState("all");
  const [size, setSize] = useState("month");

  return (
    <div className="kit-b-panel">
      <div className="kit-b-stack">
        <div>
          <p className="kit-b-label">Три варианта</p>
          <Segmented
            ariaLabel="Период"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "week", label: "Неделя" },
              { value: "month", label: "Месяц" },
              { value: "quarter", label: "Квартал" }
            ]}
          />
        </div>
        <div>
          <p className="kit-b-label">Пять вариантов на всю ширину, один недоступен</p>
          <Segmented
            ariaLabel="Раздел"
            fullWidth
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: "Все" },
              { value: "mine", label: "Мои", badge: 4 },
              { value: "team", label: "Команда", badge: 12 },
              { value: "archive", label: "Архив", disabled: true },
              { value: "draft", label: "Черновики" }
            ]}
          />
        </div>
        <div>
          <p className="kit-b-label">С иконками</p>
          <Segmented
            ariaLabel="Вид"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "Список", icon: <List /> },
              { value: "grid", label: "Плитки", icon: <LayoutGrid /> },
              { value: "calendar", label: "Календарь", icon: <Calendar /> }
            ]}
          />
        </div>
        <div>
          <p className="kit-b-label">Компактный размер</p>
          <Segmented
            size="sm"
            ariaLabel="Масштаб"
            value={size}
            onChange={setSize}
            options={[
              { value: "day", label: "День" },
              { value: "week", label: "Неделя" },
              { value: "month", label: "Месяц" },
              { value: "year", label: "Год" }
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Вкладки */

function TabsDemo() {
  const [underline, setUnderline] = useState("overview");
  const [pill, setPill] = useState("goals");

  return (
    <div className="kit-b-panel">
      <div className="kit-b-stack" style={{ gap: "var(--sp-8)" }}>
        <Tabs
          variant="underline"
          ariaLabel="Профиль участника"
          value={underline}
          onChange={setUnderline}
          tabs={[
            { id: "overview", label: "Обзор" },
            { id: "meetings", label: "Встречи", count: 8 },
            { id: "goals", label: "Цели", count: 3 },
            { id: "notes", label: "Заметки" },
            { id: "archive", label: "Архив", disabled: true }
          ]}
        >
          <TabPanel id="overview">
            <p>Состояние команды спокойное: две встречи на этой неделе, одна цель близка к завершению.</p>
          </TabPanel>
          <TabPanel id="meetings">
            <p>Восемь встреч за квартал. Следующая во вторник в 11:00.</p>
          </TabPanel>
          <TabPanel id="goals">
            <p>Три активные цели. Ближайший срок: конец месяца.</p>
          </TabPanel>
          <TabPanel id="notes">
            <p>Личные заметки видны только вам.</p>
          </TabPanel>
        </Tabs>

        <Tabs
          variant="pill"
          ariaLabel="Развитие"
          value={pill}
          onChange={setPill}
          tabs={[
            { id: "goals", label: "Цели", icon: <Target /> },
            { id: "skills", label: "Навыки", icon: <Heart />, count: 5 },
            { id: "people", label: "Команда", icon: <Users /> }
          ]}
        >
          <TabPanel id="goals">
            <p>Цели на квартал и их прогресс.</p>
          </TabPanel>
          <TabPanel id="skills">
            <p>Пять навыков в развитии: от наставничества до работы с данными.</p>
          </TabPanel>
          <TabPanel id="people">
            <p>Люди, с которыми вы работаете чаще всего.</p>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Диалоги и шторки */

function OverlaysDemo() {
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [bottom, setBottom] = useState(false);
  const nameRef = useRef(null);
  const { toast } = useToast();

  return (
    <>
      <div className="kit-row">
        <button type="button" className="ui-b-btn ui-b-btn--primary" onClick={() => setDialog(true)}>
          Открыть диалог
        </button>
        <button type="button" className="ui-b-btn ui-b-btn--danger" onClick={() => setConfirm(true)}>
          <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
          Удалить участника
        </button>
        <button type="button" className="ui-b-btn ui-b-btn--tinted" onClick={() => setSheet(true)}>
          Шторка справа
        </button>
        <button type="button" className="ui-b-btn ui-b-btn--neutral" onClick={() => setBottom(true)}>
          Шторка снизу
        </button>
      </div>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        size="md"
        title="Новая встреча 1:1"
        description="Договоритесь о времени и заранее напишите, что хотите обсудить."
        initialFocusRef={nameRef}
        footer={
          <>
            <button type="button" className="ui-b-btn ui-b-btn--neutral" onClick={() => setDialog(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="ui-b-btn ui-b-btn--primary"
              onClick={() => {
                setDialog(false);
                toast({ tone: "success", title: "Встреча запланирована", description: "Участник получит приглашение." });
              }}
            >
              Запланировать
            </button>
          </>
        }
      >
        <div className="kit-b-stack" style={{ gap: "var(--sp-4)" }}>
          <Field label="Участник" required>
            {(fieldProps) => <TextInput {...fieldProps} ref={nameRef} placeholder="Например, Анна Соколова" />}
          </Field>
          <Field label="Команда">
            {(fieldProps) => <Select {...fieldProps} placeholder="Выберите команду" options={TEAMS} />}
          </Field>
          <Field label="Повестка">
            {(fieldProps) => <TextArea {...fieldProps} rows={3} placeholder="Что важно обсудить" />}
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirm}
        tone="danger"
        title="Удалить участника?"
        description="Вместе с ним удалятся встречи, цели и заметки. Это действие нельзя отменить."
        confirmLabel="Удалить"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast({ tone: "default", title: "Участник удалён", action: { label: "Отменить", onClick: () => {} } });
        }}
      />

      <Sheet
        open={sheet}
        side="right"
        onClose={() => setSheet(false)}
        title="Фильтры"
        description="Покажем только то, что подходит."
        footer={
          <>
            <button type="button" className="ui-b-btn ui-b-btn--neutral" onClick={() => setSheet(false)}>
              Сбросить
            </button>
            <button type="button" className="ui-b-btn ui-b-btn--primary" onClick={() => setSheet(false)}>
              Показать результаты
            </button>
          </>
        }
      >
        <div className="kit-b-stack" style={{ gap: "var(--sp-5)" }}>
          <Field label="Команда">
            {(fieldProps) => <Select {...fieldProps} placeholder="Любая" options={TEAMS} />}
          </Field>
          <Slider label="Не менее встреч" showValue defaultValue={3} min={0} max={12} />
          <Switch label="Только с открытыми целями" defaultChecked />
          <Checkbox label="Скрыть архивные" defaultChecked />
        </div>
      </Sheet>

      <Sheet
        open={bottom}
        onClose={() => setBottom(false)}
        title="Поделиться отчётом"
        description="Ссылка откроется только для участников вашей команды."
        footer={
          <button type="button" className="ui-b-btn ui-b-btn--primary" onClick={() => setBottom(false)}>
            Скопировать ссылку
          </button>
        }
      />
    </>
  );
}

/* ------------------------------------------------------------ Меню, поповер */

function MenuDemo() {
  const { toast } = useToast();
  const items = [
    { id: "edit", label: "Изменить", icon: <Pencil />, shortcut: "⌘E", onSelect: () => toast({ title: "Открыли редактор" }) },
    { id: "copy", label: "Копировать ссылку", icon: <Copy />, shortcut: "⌘C", onSelect: () => toast({ title: "Ссылка скопирована" }) },
    { id: "share", label: "Поделиться", icon: <Share />, disabled: true },
    "separator",
    { id: "archive", label: "В архив", icon: <Archive /> },
    { id: "delete", label: "Удалить", icon: <Trash2 />, tone: "danger" }
  ];

  return (
    <div className="kit-row">
      <Menu
        items={items}
        trigger={
          <button type="button" className="ui-b-btn ui-b-btn--neutral">
            Действия
          </button>
        }
      />
      <Menu
        align="end"
        items={items}
        trigger={({ ref, props, open }) => (
          <button ref={ref} {...props} type="button" className="ui-b-btn ui-b-btn--tinted" data-open={open || undefined}>
            <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
            Выравнивание по правому краю
          </button>
        )}
      />
      <Popover
        label="Быстрая оценка"
        trigger={
          <button type="button" className="ui-b-btn ui-b-btn--neutral">
            Поповер
          </button>
        }
      >
        {({ close }) => (
          <div className="kit-b-stack" style={{ gap: "var(--sp-4)" }}>
            <Slider label="Как прошла неделя?" showValue unit="%" defaultValue={60} />
            <Switch label="Показать команде" defaultChecked />
            <button type="button" className="ui-b-btn ui-b-btn--primary" onClick={close}>
              Готово
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}

/* ----------------------------------------------------------------- Уведомления */

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className="kit-row">
      <button type="button" className="ui-b-btn ui-b-btn--neutral" onClick={() => toast({ title: "Черновик сохранён" })}>
        Обычное
      </button>
      <button
        type="button"
        className="ui-b-btn ui-b-btn--tinted"
        onClick={() => toast({ tone: "success", title: "Встреча сохранена", description: "Участник увидит её в календаре." })}
      >
        Успех
      </button>
      <button
        type="button"
        className="ui-b-btn ui-b-btn--neutral"
        onClick={() => toast({ tone: "warning", title: "Цель без срока", description: "Добавьте дату, чтобы отслеживать прогресс." })}
      >
        Предупреждение
      </button>
      <button
        type="button"
        className="ui-b-btn ui-b-btn--danger"
        onClick={() =>
          toast({
            tone: "danger",
            title: "Не удалось сохранить",
            description: "Проверьте соединение и повторите.",
            action: { label: "Повторить", onClick: () => {} }
          })
        }
      >
        Ошибка
      </button>
      <button
        type="button"
        className="ui-b-btn ui-b-btn--plain"
        onClick={() => {
          toast({ title: "Первое уведомление" });
          toast({ tone: "success", title: "Второе уведомление" });
          toast({ tone: "warning", title: "Третье уведомление" });
          toast({ title: "Четвёртое вытесняет первое" });
        }}
      >
        Стопка из четырёх
      </button>
    </div>
  );
}

export default function KitB() {
  return (
    <ToastProvider>
      <Section
        title="Формы"
        note="Подпись всегда над полем, подсказка и ошибка под ним; Field сам связывает их с контролом. Нажмите «@» в адресе, чтобы снять ошибку."
      >
        <FormSample />
      </Section>

      <Section title="Состояния полей" note="Ошибка, недоступное поле, иконки по краям, компактный размер, поиск с очисткой.">
        <FieldStates />
      </Section>

      <Section title="Сегментированный контроль" note="Стрелки меняют выбор, Home и End прыгают к краям. На узком экране прокручивается по горизонтали.">
        <SegmentedDemo />
      </Section>

      <Section title="Вкладки" note="Подчёркивание и пилюли. Стрелки переключают сразу, Tab переходит к панели.">
        <TabsDemo />
      </Section>

      <Section title="Диалоги и шторки" note="Фокус уходит внутрь и возвращается на кнопку, Escape закрывает, страница не прокручивается. На узких экранах диалог становится нижней шторкой.">
        <OverlaysDemo />
      </Section>

      <Section title="Меню и поповер" note="Стрелки, Home, End, Escape; открывается вверх, если снизу мало места, и не вылезает за край окна.">
        <MenuDemo />
      </Section>

      <Section title="Уведомления" note="Не больше трёх сразу. Ошибка не исчезает сама, пока её не закроют; таймер останавливается при наведении и фокусе.">
        <ToastDemo />
      </Section>
    </ToastProvider>
  );
}
