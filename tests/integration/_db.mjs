import pg from "pg";

// Интеграционные тесты стирают таблицы. Единственная защита от запуска на
// живой базе — имя: без "test" в нём мы отказываемся даже подключаться.
// Проверяем и по URL (до подключения), и по current_database() после него,
// потому что в URL имя может прийти через параметры или алиас.
export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL не задан: интеграционные тесты работают только с отдельной тестовой базой");
  }
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  assertTestDatabaseName(name, "TEST_DATABASE_URL");
  return url;
}

function assertTestDatabaseName(name, source) {
  if (!/test/i.test(name)) {
    throw new Error(`Имя базы «${name}» из ${source} не содержит "test": тесты отказываются работать с ней`);
  }
}

export async function connectTestDb() {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
  try {
    const { rows } = await pool.query("select current_database() as name");
    assertTestDatabaseName(rows[0].name, "current_database()");
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
  return pool;
}

// Таблицы со служебным состоянием (журнал миграций, app_meta со схемой)
// не трогаем: без них базу пришлось бы заново мигрировать, а тесты проверяют
// данные, а не схему.
const KEEP_TABLES = new Set(["pgmigrations", "app_meta"]);

// Очистка в той же базе, к которой подключён pool. Имя проверяется ещё раз
// прямо перед truncate: функцию могут вызвать с чужим pool.
export async function truncateDataTables(pool) {
  const { rows: current } = await pool.query("select current_database() as name");
  assertTestDatabaseName(current[0].name, "current_database()");

  const { rows } = await pool.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename"
  );
  const tables = rows.map((row) => row.tablename).filter((name) => !KEEP_TABLES.has(name));
  if (tables.length === 0) return [];
  const list = tables.map((name) => `public."${name.replace(/"/g, '""')}"`).join(", ");
  await pool.query(`truncate table ${list} restart identity cascade`);
  return tables;
}
