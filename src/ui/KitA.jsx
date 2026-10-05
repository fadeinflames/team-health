import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  Download,
  Ellipsis,
  Flame,
  HeartPulse,
  Inbox,
  MessageSquare,
  Pencil,
  Plus,
  Settings,
  Smile,
  Sparkles,
  Target,
  Trash2,
  Users
} from "lucide-react";
import {
  Avatar,
  AvatarGroup,
  BarMini,
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  IconButton,
  Kbd,
  ListGroup,
  ListRow,
  PageHeader,
  ProgressBar,
  ProgressRing,
  Section,
  Skeleton,
  Sparkline,
  Stat,
  StatusDot
} from "./a/index.js";

// Каталог набора A. Hover и нажатие статично не показать: проверяйте мышью, а
// видимый фокус клавишей Tab (кнопки, строки и интерактивная карточка достижимы).

const PEOPLE = [
  { name: "Анна Орлова" },
  { name: "Борис Ким" },
  { name: "Виктория Лебедева" },
  { name: "Георгий Соколов" },
  { name: "Дарья Мельник" },
  { name: "Егор Фомин" },
  { name: "Жанна Белова" }
];

// Маленькая картинка для демонстрации src: data-URI, без сети.
const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4b183"/><stop offset="1" stop-color="#7a5cc0"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/><circle cx="40" cy="32" r="14" fill="#fff" fill-opacity=".85"/><path d="M12 80c3-18 15-26 28-26s25 8 28 26z" fill="#fff" fill-opacity=".85"/></svg>'
  );

const WEEK = [
  { label: "Пн", value: 3 },
  { label: "Вт", value: 5 },
  { label: "Ср", value: 2 },
  { label: "Чт", value: 6 },
  { label: "Пт", value: 4 },
  { label: "Сб", value: 0 },
  { label: "Вс", value: 1 }
];

function Sample({ caption, children }) {
  return (
    <div className="kit-a-cell">
      {children}
      <span className="kit-a-caption">{caption}</span>
    </div>
  );
}

function ButtonsDemo() {
  const [saving, setSaving] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const save = () => {
    setSaving(true);
    timer.current = window.setTimeout(() => setSaving(false), 1600);
  };

  return (
    <section className="kit-section" aria-labelledby="kit-a-buttons">
      <h2 id="kit-a-buttons">Кнопки</h2>
      <p className="kit-note">
        Пять вариантов и три размера. Нажатие сжимает кнопку, загрузка не меняет ширину, на сенсорных экранах зона касания не меньше 44px.
      </p>

      <div className="kit-row">
        <Button>Основная</Button>
        <Button variant="tinted">Тонированная</Button>
        <Button variant="plain">Текстовая</Button>
        <Button variant="neutral">Нейтральная</Button>
        <Button variant="danger">Удалить</Button>
      </div>

      <div className="kit-row">
        <Button size="sm">Маленькая</Button>
        <Button>Обычная</Button>
        <Button size="lg">Крупная</Button>
        <Button size="sm" variant="tinted">Маленькая</Button>
        <Button variant="tinted">Обычная</Button>
        <Button size="lg" variant="tinted">Крупная</Button>
      </div>

      <div className="kit-row">
        <Button icon={Plus}>Добавить шаг</Button>
        <Button variant="tinted" icon={<CalendarDays />}>Запланировать</Button>
        <Button variant="neutral" iconRight={ArrowRight}>Продолжить</Button>
        <Button variant="plain" icon={Download}>Скачать</Button>
        <Button variant="danger" icon={Trash2}>Удалить встречу</Button>
        <Button size="sm" icon={Plus}>Добавить</Button>
      </div>

      <div className="kit-row">
        <Button disabled>Отключена</Button>
        <Button variant="tinted" disabled>Отключена</Button>
        <Button variant="plain" disabled>Отключена</Button>
        <Button variant="neutral" disabled>Отключена</Button>
        <Button variant="danger" disabled>Отключена</Button>
        <Button loading data-testid="kit-a-btn-loading">Сохраняем</Button>
        <Button loading icon={Plus} variant="tinted">Добавляем</Button>
        <Button loading={saving} onClick={save} data-testid="kit-a-btn-demo">
          Сохранить
        </Button>
      </div>

      <div className="kit-row">
        <div className="kit-a-narrow">
          <Button fullWidth size="lg">Во всю ширину</Button>
        </div>
        <Button href="#ui-kit" variant="tinted" iconRight={ArrowRight}>Ссылка-кнопка</Button>
      </div>

      <p className="kit-note">Кнопки-иконки: круглые, с обязательной подписью для читалок. Область нажатия 44px даже у маленьких.</p>
      <div className="kit-row">
        <IconButton label="Добавить" icon={Plus} />
        <IconButton label="Изменить" icon={Pencil} variant="tinted" />
        <IconButton label="Настройки" icon={Settings} variant="neutral" />
        <IconButton label="Ещё" icon={Ellipsis} size="sm" />
        <IconButton label="Уведомления" icon={Bell} size="sm" variant="tinted" />
        <IconButton label="Удалить" icon={Trash2} size="sm" variant="neutral" />
        <IconButton label="Недоступно" icon={Pencil} disabled />
      </div>
    </section>
  );
}

function CardsDemo() {
  const [taps, setTaps] = useState(0);
  return (
    <section className="kit-section" aria-labelledby="kit-a-cards">
      <h2 id="kit-a-cards">Карточки</h2>
      <p className="kit-note">
        Поверхность, радиус 20, тень вместо рамки. Карточка в карточке запрещена: внутри используйте сгруппированный список.
      </p>

      <div className="kit-a-grid kit-a-grid--cards">
        <Card>
          <CardHeader
            icon={CalendarDays}
            title="Ближайшая встреча"
            subtitle="Завтра, 11:00"
            action={<IconButton label="Ещё про встречу" icon={Ellipsis} size="sm" />}
          />
          <p>Обсудим цели на квартал и договорённости с прошлой встречи.</p>
        </Card>

        <Card interactive onClick={() => setTaps((n) => n + 1)} data-testid="kit-a-card-interactive">
          <CardHeader icon={Target} title="Интерактивная" subtitle="Наведите или нажмите Tab" />
          <p>
            Нажатий: <strong className="num">{taps}</strong>
          </p>
        </Card>

        <Card tone="accent">
          <CardHeader icon={Sparkles} title="Акцентная" subtitle="Мягкий тон" />
          <p>Для важного, но не тревожного.</p>
        </Card>

        <Card tone="success">
          <CardHeader icon={ClipboardCheck} iconTone="success" title="Успех" subtitle="Всё в срок" />
          <p>Цели закрыты, договорённости выполнены.</p>
        </Card>

        <Card tone="warning">
          <CardHeader icon={Flame} iconTone="warning" title="Внимание" subtitle="Нужен разговор" />
          <p>Нагрузка выросла третий месяц подряд.</p>
        </Card>

        <Card tone="danger">
          <CardHeader icon={HeartPulse} iconTone="danger" title="Риск" subtitle="Срочно" />
          <p>Две встречи подряд отменены.</p>
        </Card>
      </div>

      <div className="kit-a-grid kit-a-grid--cards">
        <Card padded={false}>
          <div className="kit-a-cardpad">
            <CardHeader title="Список внутри карточки" subtitle="Без карточки в карточке" />
          </div>
          <ListGroup inset={false}>
            <ListRow icon={Users} title="Команда" subtitle="12 человек" chevron onClick={() => {}} />
            <ListRow icon={Target} iconTone="success" title="Цели" subtitle="8 из 11 в срок" chevron onClick={() => {}} />
            <ListRow icon={MessageSquare} iconTone="info" title="Обратная связь" meta="3 новых" chevron onClick={() => {}} />
          </ListGroup>
        </Card>
        <Card as="div" padded={false}>
          <EmptyState icon={Inbox} title="Пока пусто" description="Здесь появятся договорённости после первой встречи." />
        </Card>
      </div>
    </section>
  );
}

function ListsDemo() {
  const [picked, setPicked] = useState(0);
  const [active, setActive] = useState("people");
  return (
    <section className="kit-section" aria-labelledby="kit-a-lists">
      <h2 id="kit-a-lists">Секции и сгруппированные списки</h2>
      <p className="kit-note">
        Подпись секции серая, обычного регистра. Строка с onClick или href становится кнопкой или ссылкой; разделитель начинается под текстом.
      </p>

      <div className="kit-a-grid kit-a-grid--wide">
        <div className="kit-a-stack">
          <Section title="Настройки" action={<Button variant="plain" size="sm">Изменить</Button>}>
            <ListGroup>
              <ListRow icon={Bell} title="Уведомления" subtitle="Напоминать за день до встречи" meta="Вкл." chevron onClick={() => {}} />
              <ListRow icon={CalendarDays} iconTone="info" title="Календарь" subtitle="Рабочий, по умолчанию" chevron onClick={() => {}} />
              <ListRow icon={Settings} iconTone="neutral" title="Внешний вид" meta="Светлая" chevron onClick={() => {}} />
              <ListRow
                icon={Flame}
                iconTone="warning"
                title="Серия встреч"
                subtitle="Четыре недели подряд"
                trailing={<Badge tone="warning" size="sm">Рекорд</Badge>}
              />
              <ListRow icon={Trash2} iconTone="danger" title="Очистить историю" subtitle="Это действие нельзя отменить" chevron onClick={() => {}} />
            </ListGroup>
          </Section>
          <Section title="Состояния строки" hint="Нажмите Tab, затем Enter или пробел.">
            <ListGroup>
              <ListRow
                icon={ClipboardCheck}
                iconTone="success"
                title="Кнопка-строка"
                subtitle={`Нажато: ${picked}`}
                chevron
                onClick={() => setPicked((n) => n + 1)}
                data-testid="kit-a-row-button"
              />
              <ListRow icon={ArrowRight} title="Ссылка-строка" subtitle="Тот же вид, но тег <a>" href="#ui-kit" chevron />
              <ListRow icon={Inbox} iconTone="neutral" title="Просто строка" subtitle="Без действия: не кнопка и без hover" />
              <ListRow
                icon={Users}
                title="Выбрана"
                subtitle="active: тонированный фон"
                active={active === "people"}
                onClick={() => setActive(active === "people" ? "" : "people")}
              />
            </ListGroup>
          </Section>
        </div>

        <div className="kit-a-stack">
          <Section title="Команда" hint="Аватар стоит в слоте 36px.">
            <ListGroup>
              {PEOPLE.slice(0, 4).map((person, index) => (
                <ListRow
                  key={person.name}
                  leading={<Avatar name={person.name} size={36} decorative status={index === 0 ? "online" : index === 1 ? "away" : undefined} />}
                  title={person.name}
                  subtitle={["Тимлид", "Дизайнер", "Аналитик", "Разработчик"][index]}
                  meta={["вчера", "3 дня", "неделя", "месяц"][index]}
                  chevron
                  onClick={() => {}}
                />
              ))}
            </ListGroup>
          </Section>
          <Section title="Без иконок">
            <ListGroup>
              <ListRow title="Только заголовок" />
              <ListRow title="Заголовок и подзаголовок" subtitle="Разделитель начинается от края поля" />
              <ListRow title="С мета-текстом" meta="14 мая" />
            </ListGroup>
          </Section>
          <Section title="На всю ширину">
            <ListGroup inset={false}>
              <ListRow icon={Users} title="Команда" chevron onClick={() => {}} />
              <ListRow icon={Target} title="Цели" chevron onClick={() => {}} />
            </ListGroup>
          </Section>
        </div>
      </div>
    </section>
  );
}

function BadgesDemo() {
  const tones = [
    ["neutral", "Нейтральный"],
    ["accent", "Акцент"],
    ["success", "Успех"],
    ["warning", "Внимание"],
    ["danger", "Ошибка"],
    ["info", "Инфо"]
  ];
  return (
    <section className="kit-section" aria-labelledby="kit-a-badges">
      <h2 id="kit-a-badges">Плашки и статусы</h2>
      <p className="kit-note">Мягкие плашки: смысл несёт текст, цвет только помогает. Размеры 24px и 20px.</p>
      <div className="kit-row">
        {tones.map(([tone, text]) => (
          <Badge key={tone} tone={tone}>{text}</Badge>
        ))}
      </div>
      <div className="kit-row">
        {tones.map(([tone, text]) => (
          <Badge key={tone} tone={tone} size="sm">{text}</Badge>
        ))}
      </div>
      <div className="kit-row">
        <Badge tone="success" dot>В срок</Badge>
        <Badge tone="warning" dot>Под вопросом</Badge>
        <Badge tone="danger" dot>Просрочено</Badge>
        <Badge tone="accent" icon={Sparkles}>Новое</Badge>
        <Badge tone="info" icon={MessageSquare} size="sm">3 комментария</Badge>
      </div>
      <div className="kit-row">
        <span className="kit-a-flex"><StatusDot tone="success" label="В сети" /> В сети</span>
        <span className="kit-a-flex"><StatusDot tone="warning" pulse label="Ожидает" /> Ожидает</span>
        <span className="kit-a-flex"><StatusDot tone="danger" label="Ошибка" /> Ошибка</span>
        <span className="kit-a-flex"><StatusDot tone="info" label="Инфо" /> Инфо</span>
        <span className="kit-a-flex"><StatusDot tone="accent" pulse label="Идёт запись" /> Идёт запись</span>
        <span className="kit-a-flex"><StatusDot tone="neutral" label="Не активен" /> Не активен</span>
      </div>
    </section>
  );
}

function AvatarsDemo() {
  return (
    <section className="kit-section" aria-labelledby="kit-a-avatars">
      <h2 id="kit-a-avatars">Аватары</h2>
      <p className="kit-note">Цвет выбирается из имени, поэтому у человека он всегда один. Инициалы контрастны в обеих темах.</p>
      <div className="kit-row">
        <Avatar name="Анна Орлова" size={24} />
        <Avatar name="Борис Ким" size={32} />
        <Avatar name="Виктория Лебедева" size={40} />
        <Avatar name="Георгий Соколов" size={56} />
        <Avatar name="Дарья Мельник" size={72} />
        <Avatar size={40} />
        <Avatar name="Артём" src={PHOTO} size={56} />
      </div>
      <div className="kit-row">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Avatar key={n} name={`Человек ${n}`} tone={n} size={44} />
        ))}
        <Avatar name="Акцент" tone="accent" size={44} />
        <Avatar name="Нейтрально" tone="neutral" size={44} />
      </div>
      <div className="kit-row">
        <Avatar name="Анна Орлова" size={48} ring />
        <Avatar name="Борис Ким" size={48} status="online" />
        <Avatar name="Виктория Лебедева" size={48} status="away" />
        <Avatar name="Георгий Соколов" size={48} status="busy" />
        <Avatar name="Дарья Мельник" size={48} ring status="online" />
      </div>
      <div className="kit-row">
        <AvatarGroup people={PEOPLE} />
        <AvatarGroup people={PEOPLE.slice(0, 3)} size={40} />
        <AvatarGroup people={PEOPLE} max={3} size={24} />
        <span className="kit-a-flex">
          <Avatar name="Анна Орлова" size={32} decorative />
          <span>Анна Орлова</span>
        </span>
      </div>
    </section>
  );
}

function StatsDemo() {
  return (
    <section className="kit-section" aria-labelledby="kit-a-stats">
      <h2 id="kit-a-stats">Метрики</h2>
      <p className="kit-note">Плитка метрики: подпись, крупное число с табличными цифрами, дельта со стрелкой, подсказка, спарклайн.</p>
      <div className="kit-a-grid">
        <Stat label="Участие в 1:1" value="92%" delta="+4%" deltaTone="success" hint="за 30 дней" icon={Users} trend={[62, 68, 66, 74, 79, 84, 92]} />
        <Stat label="Настроение" value="7,8" delta="−0,3" deltaTone="danger" hint="к прошлому месяцу" icon={Smile} iconTone="warning" trend={[8.4, 8.2, 8.3, 8.0, 7.9, 7.8]} />
        <Stat label="Цели в срок" value="68%" delta="0%" hint="без изменений" icon={Target} iconTone="success" trend={[60, 66, 62, 70, 64, 68]} />
        <Stat label="Открытые договорённости" value="14" hint="3 просрочены" icon={ClipboardCheck} iconTone="info" />
      </div>
      <div className="kit-a-grid">
        <Stat tone="accent" label="Встреч в неделю" value="9" delta="+2" deltaTone="success" hint="лучше цели" icon={CalendarDays} trend={[3, 4, 4, 6, 5, 7, 9]} />
        <Stat tone="success" label="Закрыто задач" value="128" delta="+18%" deltaTone="success" icon={ChartColumn} iconTone="success" trend={[10, 22, 18, 35, 30, 48, 55]} />
        <Stat tone="warning" label="Риск выгорания" value="3" delta="+1" deltaTone="danger" hint="человека" icon={Flame} iconTone="warning" trend={[1, 1, 2, 2, 2, 3]} />
        <Stat tone="danger" label="Отменено встреч" value="5" delta="+3" deltaTone="danger" hint="за месяц" icon={HeartPulse} iconTone="danger" trend={[1, 0, 2, 1, 3, 5]} />
      </div>
    </section>
  );
}

function ProgressDemo() {
  const [value, setValue] = useState(72);
  return (
    <section className="kit-section" aria-labelledby="kit-a-progress">
      <h2 id="kit-a-progress">Прогресс</h2>
      <p className="kit-note">Дорожка и заливка со скруглёнными концами, ширина анимируется за 340 мс. Значение всегда есть и в тексте, и в aria.</p>
      <div className="kit-a-grid kit-a-grid--wide">
        <div className="kit-a-panel kit-a-stack">
          <ProgressBar label="Цели квартала" value={value} showValue />
          <ProgressBar label="Успех" tone="success" value={86} showValue />
          <ProgressBar label="Внимание" tone="warning" value={54} showValue />
          <ProgressBar label="Риск" tone="danger" value={21} showValue />
          <ProgressBar label="Тонкая" size="sm" value={38} showValue />
          <ProgressBar label="Пусто" value={0} showValue size="sm" />
          <ProgressBar label="Готово" value={100} tone="success" showValue size="sm" />
          <ProgressBar aria-label="Без подписи" value={45} />
          <div className="kit-row" style={{ marginBottom: 0 }}>
            <Button size="sm" variant="neutral" onClick={() => setValue((v) => (v >= 90 ? 12 : v + 20))}>
              Изменить значение
            </Button>
          </div>
        </div>
        <div className="kit-a-panel">
          <div className="kit-row" style={{ alignItems: "flex-end", gap: "var(--sp-4) var(--sp-5)" }}>
            <Sample caption="96, акцент">
              <ProgressRing value={value} label="Цели квартала">
                <span>{value}%</span>
              </ProgressRing>
            </Sample>
            <Sample caption="128, успех">
              <ProgressRing value={86} size={128} stroke={12} tone="success" label="Выполнено">
                <span>86%</span>
              </ProgressRing>
            </Sample>
            <Sample caption="64, внимание">
              <ProgressRing value={54} size={64} stroke={8} tone="warning" label="Загрузка">
                <span>54</span>
              </ProgressRing>
            </Sample>
            <Sample caption="пусто">
              <ProgressRing value={0} size={64} stroke={8} label="Пусто">
                <span>0</span>
              </ProgressRing>
            </Sample>
            <Sample caption="полное, риск">
              <ProgressRing value={100} size={64} stroke={8} tone="danger" label="Полное">
                <span>100</span>
              </ProgressRing>
            </Sample>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChartsDemo() {
  const shapes = [
    ["Рост", [2, 3, 3, 5, 6, 8, 11], "accent"],
    ["Спад", [11, 9, 9, 6, 4, 3, 2], "danger"],
    ["Ровная", [5, 5, 5, 5, 5, 5], "info"],
    ["Шумная", [4, 9, 3, 8, 2, 9, 5, 10, 4, 8], "accent"],
    ["Две точки", [3, 9], "success"],
    ["Одно значение", [7], "warning"]
  ];
  return (
    <section className="kit-section" aria-labelledby="kit-a-charts">
      <h2 id="kit-a-charts">Спарклайны и столбики</h2>
      <p className="kit-note">Кривая плавная, без «перелётов» между точками; под ней мягкая заливка, последняя точка выделена. У каждого графика есть текстовое описание.</p>
      <div className="kit-a-grid">
        {shapes.map(([title, data, tone]) => (
          <div className="kit-a-sample" key={title}>
            <span className="kit-a-caption">{title}</span>
            <Sparkline data={data} tone={tone} width={200} height={56} />
          </div>
        ))}
        <div className="kit-a-sample">
          <span className="kit-a-caption">Нет данных</span>
          <Sparkline data={[]} width={200} height={56} data-testid="kit-a-spark-empty" />
        </div>
        <div className="kit-a-sample">
          <span className="kit-a-caption">Без заливки</span>
          <Sparkline data={[3, 6, 4, 8, 7, 10]} fill={false} width={200} height={56} tone="info" />
        </div>
      </div>
      <div className="kit-a-grid">
        <div className="kit-a-sample">
          <span className="kit-a-caption">Встречи за неделю</span>
          <BarMini data={WEEK} showLabels height={72} />
        </div>
        <div className="kit-a-sample">
          <span className="kit-a-caption">Без подписей, успех</span>
          <BarMini data={WEEK} tone="success" height={56} />
        </div>
        <div className="kit-a-sample">
          <span className="kit-a-caption">Двенадцать значений</span>
          <BarMini
            data={["Я", "Ф", "М", "А", "М", "И", "И", "А", "С", "О", "Н", "Д"].map((label, i) => ({ label, value: [4, 6, 5, 8, 7, 9, 6, 10, 8, 11, 9, 12][i] }))}
            tone="info"
            showLabels
            height={72}
          />
        </div>
      </div>
    </section>
  );
}

function MiscDemo() {
  return (
    <section className="kit-section" aria-labelledby="kit-a-misc">
      <h2 id="kit-a-misc">Скелетоны, пустые состояния, шапка страницы</h2>
      <p className="kit-note">Мерцание отключается при «Уменьшить движение». Шапка на узких экранах переносит действия вниз.</p>

      <div className="kit-a-grid">
        <Card className="kit-a-stack" aria-busy="true" aria-label="Загрузка карточки">
          <div className="kit-a-skel-head">
            <Skeleton width={40} height={40} radius={999} />
            <div className="kit-a-stack kit-a-stack--tight">
              <Skeleton height={14} width="60%" />
              <Skeleton height={12} width="40%" />
            </div>
          </div>
          <Skeleton lines={3} height={12} />
        </Card>
        <Card className="kit-a-stack" aria-busy="true" aria-label="Загрузка метрики">
          <Skeleton height={14} width="45%" />
          <Skeleton height={36} width="35%" radius={10} />
          <Skeleton height={56} radius={14} />
        </Card>
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Встреч пока нет"
            description="Запланируйте первую встречу, и она появится здесь."
            action={<Button icon={Plus}>Запланировать</Button>}
          />
        </Card>
      </div>

      <div className="kit-a-panel" style={{ marginBottom: "var(--sp-5)" }}>
        <PageHeader
          eyebrow="Команда"
          title="Встречи один на один"
          subtitle="Ближайшие встречи, договорённости и динамика за месяц."
          back={{ label: "Назад", href: "#ui-kit" }}
          actions={
            <>
              <Button variant="neutral" icon={Download}>Экспорт</Button>
              <Button icon={Plus}>Новая встреча</Button>
            </>
          }
        />
      </div>

      <div className="kit-a-panel">
        <div className="kit-a-flex" style={{ marginBottom: "var(--sp-4)" }}>
          <span>Поиск</span>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <span>Закрыть</span>
          <Kbd>Esc</Kbd>
          <span>Выбор</span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <Kbd>Enter</Kbd>
        </div>
        <Divider />
        <p style={{ margin: "var(--sp-4) 0" }}>Разделитель с отступом слева, как у строк списка:</p>
        <Divider inset />
      </div>
    </section>
  );
}

export default function KitA() {
  return (
    <>
      <ButtonsDemo />
      <CardsDemo />
      <ListsDemo />
      <BadgesDemo />
      <AvatarsDemo />
      <StatsDemo />
      <ProgressDemo />
      <ChartsDemo />
      <MiscDemo />
    </>
  );
}
