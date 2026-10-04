// Приведение таблицы к состоянию входящего набора строк без её перезаписи.
//
// Раньше любая мутация делала `delete from <table>` плюс построчный insert по
// шестнадцати таблицам. Замер на PATCH /api/me с тем же именем: n_tup_ins +9
// и n_tup_del +9 по одной только cards, и сброшенный там created_at. Мёртвых
// версий строк в базе накапливалось в три-пять раз больше живых.
//
// Здесь то же самое делается двумя запросами на таблицу вместо 1 + N:
//   1. insert ... select from unnest(...) on conflict do update — с условием,
//      что строка действительно изменилась;
//   2. delete по тем ключам, которых во входящем наборе нет.
//
// Условие на первом шаге важнее, чем кажется. Без него update отрабатывает на
// каждой строке, триггер бампает updated_at, и оптимистичная блокировка
// начинает ловить конфликты там, где никто ничего не менял.
//
// Формат спецификации таблицы:
//   {
//     table: "cards",
//     key: "id",                       // или ["person_id", "captured_at"]
//     immutable: ["created_at"],       // не перетирается при обновлении
//     columns: [
//       { name: "id", type: "text", value: (row) => row.id },
//       // expr — если колонку надо получить не напрямую из массива
//       { name: "tags", type: "jsonb", value: ..., expr: "array(select jsonb_array_elements_text(src.tags))" }
//     ]
//   }

function keysOf(spec) {
  return Array.isArray(spec.key) ? spec.key : [spec.key];
}

// Колонки, которые обновляются при конфликте: всё, кроме ключа и того, что
// объявлено неизменяемым. created_at сюда попадает всегда — время создания
// строки не может меняться при её обновлении, и именно на этом ловилась
// потеря created_at у карточек и договорённостей.
function updatableColumns(spec) {
  const frozen = new Set([...keysOf(spec), ...(spec.immutable || [])]);
  return spec.columns.filter((column) => !frozen.has(column.name));
}

function upsertStatement(spec) {
  const names = spec.columns.map((column) => column.name);
  const placeholders = spec.columns.map((column, index) => `$${index + 1}::${column.type}[]`).join(", ");
  const projection = spec.columns.map((column) => column.expr || `src.${column.name}`).join(", ");
  const source = `select ${projection} from unnest(${placeholders}) as src(${names.join(", ")})`;
  const updatable = updatableColumns(spec);

  if (!updatable.length) {
    return `insert into ${spec.table} (${names.join(", ")}) ${source} on conflict (${keysOf(spec).join(", ")}) do nothing`;
  }

  const tuple = (prefix) => updatable.map((column) => `${prefix}.${column.name}`).join(", ");
  return `
    insert into ${spec.table} (${names.join(", ")})
    ${source}
    on conflict (${keysOf(spec).join(", ")}) do update set
      ${updatable.map((column) => `${column.name} = excluded.${column.name}`).join(",\n      ")}
    where (${tuple(spec.table)}) is distinct from (${tuple("excluded")})
  `;
}

export async function upsertRows(client, spec, rows) {
  if (!rows.length) return;
  await client.query(
    upsertStatement(spec),
    spec.columns.map((column) => rows.map(column.value))
  );
}

function columnOf(spec, name) {
  const column = spec.columns.find((item) => item.name === name);
  if (!column) throw new Error(`В спецификации ${spec.table} нет колонки ${name}`);
  return column;
}

// Полный цикл для таблицы с одним ключом.
//
// spec.scope — обязательное сужение удаления, если таблица синхронизируется
// не целиком. Без него `delete ... where id <> all($1)` это ровно тот же
// `delete from`, только записанный иначе.
export async function syncRows(client, spec, rows) {
  await upsertRows(client, spec, rows);
  const key = columnOf(spec, keysOf(spec)[0]);
  const scopeParams = spec.scopeParams || [];
  const scopeClause = spec.scope ? `${spec.scope} and ` : "";
  await client.query(
    `delete from ${spec.table} where ${scopeClause}${key.name} <> all($${scopeParams.length + 1}::${key.type}[])`,
    [...scopeParams, rows.map(key.value)]
  );
}

// Таблицы с составным ключом. Отдельная функция, а не флаг у общей: условие
// удаления принципиально другое, и попытка выразить оба случая одним
// генератором читается хуже, чем две штуки рядом.
export async function syncCompositeRows(client, spec, rows) {
  await upsertRows(client, spec, rows);
  const [first, second] = keysOf(spec).map((name) => columnOf(spec, name));
  const scopeClause = spec.scope ? `${spec.scope} and ` : "";
  const scopeParams = spec.scopeParams || [];
  await client.query(
    `
      delete from ${spec.table} t
      where ${scopeClause}not exists (
        select 1 from unnest($${scopeParams.length + 1}::${first.type}[], $${scopeParams.length + 2}::${second.type}[]) as kept(a, b)
        where kept.a = t.${first.name} and kept.b = t.${second.name}
      )
    `,
    [...scopeParams, rows.map(first.value), rows.map(second.value)]
  );
}

// Запись разностью.
//
// Полный снимок («что пришло, то и должно лежать в таблице») безопасен только
// тогда, когда между чтением снимка и его записью никто больше не писал.
// В реальности пишут: ответ на опрос, созданная сессия, смена пароля,
// карточка соседа. Снимок про них не знает, и «чего нет — удалить» стирает
// чужую строку, а upsert всех строк подряд откатывает чужие правки в
// значения, прочитанные раньше.
//
// Поэтому при чтении запоминается база: ключ -> подпись значений колонок. При
// записи upsert получают только строки, чья подпись изменилась или чьего
// ключа в базе не было, а удаляются только ключи, которые снимок видел при
// чтении и которых в нём больше нет. Всё остальное — чужое, его не трогаем.

// Разделитель составного ключа. NUL не встречается ни в id, ни в датах.
const KEY_SEP = "\u0000";

function keyColumns(spec) {
  return keysOf(spec).map((name) => columnOf(spec, name));
}

// Колонки, которые попадают в подпись: всё, кроме неизменяемых. created_at
// не обновляется никогда, а его формат на чтении (Date против строки) мог
// бы дать расхождение подписей на строке, которую никто не менял, — и
// ложный конфликт версий. Новая строка (ключа нет в базе) пишется целиком в
// любом случае, поэтому созданию это не мешает.
export function signedColumns(spec) {
  const frozen = new Set(spec.immutable || []);
  return spec.columns.filter((column) => !frozen.has(column.name));
}

export function rowKey(spec, row) {
  return keyColumns(spec)
    .map((column) => String(column.value(row)))
    .join(KEY_SEP);
}

// spec.extraSignature — то, что влияет на запись строки, но не едет через
// upsert (у users это lead_user_id: он проставляется вторым проходом).
export function rowSignature(spec, row) {
  const values = signedColumns(spec).map((column) => canonicalValue(column, column.value(row)));
  return JSON.stringify(spec.extraSignature ? [...values, ...spec.extraSignature(row)] : values);
}

// Подпись должна совпадать у одних и тех же данных, как бы они ни были
// записаны. Читаемая из jsonb строка отдаёт ключи в порядке jsonb (короткие
// раньше длинных), а sanitize-функции собирают объект в своём порядке; без
// канонизации каждая оценка компетенций, опрос и ответ выглядели бы
// «изменёнными» при каждой записи, и разностный режим перезаписывал бы
// устаревшей копией чужую параллельную правку этих таблиц. Так же с
// моментами времени: Date и ISO-строка с миллисекундами и без — одно значение.
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

const EXPLICIT_ZONE = /(?:Z|[+-]\d\d:?\d\d)$/;

function canonicalValue(column, value) {
  if (column.type === "jsonb" && typeof value === "string") {
    try {
      return JSON.stringify(sortKeys(JSON.parse(value)));
    } catch {
      return value;
    }
  }
  if (column.type === "timestamptz") {
    // Строки без часового пояса не трогаем: их смысл задаёт сессия базы, а не JS.
    const instant = value instanceof Date ? value : typeof value === "string" && EXPLICIT_ZONE.test(value) ? new Date(value) : null;
    if (instant && !Number.isNaN(instant.getTime())) return instant.toISOString();
  }
  return value;
}

// Подписи всех строк таблицы. Дубликат ключа в одном наборе: побеждает
// последняя строка — как при последовательных upsert.
export function snapshotTable(spec, rows) {
  const snapshot = new Map();
  for (const row of rows) snapshot.set(rowKey(spec, row), rowSignature(spec, row));
  return snapshot;
}

// Сравнение набора с базой. base — Map из snapshotTable или undefined
// (тогда всё считается новым и ничего не удаляется).
export function diffRows(spec, rows, base) {
  const known = base instanceof Map ? base : new Map();
  const current = new Map();
  for (const row of rows) current.set(rowKey(spec, row), row);

  const changed = [];
  for (const [key, row] of current) {
    if (known.get(key) !== rowSignature(spec, row)) changed.push(row);
  }
  const removed = [];
  for (const key of known.keys()) {
    if (!current.has(key)) removed.push(key);
  }
  return { changed, removed };
}

// Удаление ровно по перечисленным ключам (в формате rowKey). Каскады FK
// (on delete cascade от people) не конфликтуют с явным удалением: строка,
// которую уже убрал каскад, просто не находится.
export async function deleteKeys(client, spec, keys) {
  if (!keys.length) return;
  const columns = keyColumns(spec);
  if (columns.length === 1) {
    const [column] = columns;
    await client.query(`delete from ${spec.table} where ${column.name} = any($1::${column.type}[])`, [keys]);
    return;
  }
  const parts = keys.map((key) => key.split(KEY_SEP));
  const names = columns.map((_, index) => `k${index}`);
  await client.query(
    `
      delete from ${spec.table} t
      using unnest(${columns.map((column, index) => `$${index + 1}::${column.type}[]`).join(", ")}) as gone(${names.join(", ")})
      where ${columns.map((column, index) => `t.${column.name} = gone.${names[index]}`).join(" and ")}
    `,
    columns.map((_, index) => parts.map((part) => part[index]))
  );
}

// Оптимистичная блокировка.
//
// Без неё потеря обновлений остаётся даже после перехода на точечные запросы:
// двое, редактирующие одну карточку, всё так же затирают друг друга — окно
// становится уже, но не исчезает.
//
// Клиент возвращает updatedAt, который он читал. Если в базе значение другое,
// значит кто-то успел раньше, и запись отклоняется целиком.
//
// Строки без updatedAt пропускаются. Это сознательная уступка совместимости:
// фронтенд начнёт присылать версии отдельным релизом, и до тех пор проверка
// просто не срабатывает, а не ломает сохранение.
export async function findStaleRows(client, spec, rows) {
  const versioned = rows.filter((row) => row.updatedAt);
  if (!versioned.length) return [];

  const key = (Array.isArray(spec.key) ? spec.key : [spec.key])[0];
  // for update of t: проверка и последующая запись должны быть одним целым.
  // Без блокировки между select и upsert успевал вклиниться чужой commit, и
  // проверка версии превращалась в гонку (TOCTOU). Блокируются ВСЕ
  // проверяемые строки, а не только устаревшие: именно неустаревшие мы
  // собираемся перезаписать, и их чужую правку надо удержать до нашего
  // commit. Сравнение вынесено в колонку, а не в where, по той же причине.
  // Если строку успели изменить, пока мы ждали блокировку, Postgres
  // перечитывает её последнюю версию, и updated_at сравнивается уже с ней.
  // order by — единый порядок блокировок у параллельных записей, чтобы они
  // не взаимоблокировались.
  const { rows: checked } = await client.query(
    `
      select t.${key} as id, (t.updated_at is distinct from src.expected) as stale
      from unnest($1::text[], $2::timestamptz[]) as src(id, expected)
      join ${spec.table} t on t.${key} = src.id
      order by t.${key}
      for update of t
    `,
    [versioned.map((row) => row.id), versioned.map((row) => row.updatedAt)]
  );
  return checked.filter((row) => row.stale).map((row) => row.id);
}
