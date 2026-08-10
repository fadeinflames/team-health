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
  const { rows: stale } = await client.query(
    `
      select t.${key} as id
      from unnest($1::text[], $2::timestamptz[]) as src(id, expected)
      join ${spec.table} t on t.${key} = src.id
      where t.updated_at is distinct from src.expected
    `,
    [versioned.map((row) => row.id), versioned.map((row) => row.updatedAt)]
  );
  return stale.map((row) => row.id);
}
