// Сессии и учётные записи.
//
// Самый горячий путь в приложении: getAuthContext вызывается на каждый
// запрос. Раньше он вычитывал всю базу — восемнадцать запросов без WHERE —
// ради одной строки сессии, а заодно чистил протухшие сессии через полную
// перезапись таблицы. Отсюда и наблюдаемые фантомные 401: параллельный
// запрос успевал переписать sessions между чтением и записью соседнего.
//
// Теперь это один запрос с джойном, а чистка протухших уехала на логин.

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    personId: row.person_id || null,
    leadUserId: row.lead_user_id || null,
    teamLabel: row.team_label || "",
    salt: row.salt,
    passwordHash: row.password_hash,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

export async function findSessionUser(pool, sessionId) {
  if (!sessionId) return null;
  const { rows } = await pool.query(
    `
      select
        u.id, u.username, u.name, u.role, u.person_id, u.lead_user_id,
        u.team_label, u.salt, u.password_hash, u.created_at,
        s.id as session_id, s.created_at as session_created_at, s.expires_at
      from sessions s
      join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()
    `,
    [sessionId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    user: mapUser(row),
    session: {
      id: row.session_id,
      userId: row.id,
      createdAt: row.session_created_at.toISOString(),
      expiresAt: row.expires_at.toISOString()
    }
  };
}

export async function findUserByUsername(pool, username) {
  const { rows } = await pool.query(
    `
      select id, username, name, role, person_id, lead_user_id, team_label,
             salt, password_hash, created_at
      from users where lower(username) = lower($1)
    `,
    [username]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

// Логин заводит новую сессию и гасит остальные сессии этого же пользователя —
// поведение сохранено с прежней версии. Заодно подчищаются протухшие: раньше
// это делалось на каждом запросе, теперь на одном из самых редких.
export async function createSession(pool, session) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from sessions where user_id = $1", [session.userId]);
    await client.query(
      "insert into sessions (id, user_id, created_at, expires_at) values ($1, $2, $3::timestamptz, $4::timestamptz)",
      [session.id, session.userId, session.createdAt, session.expiresAt]
    );
    await client.query("delete from sessions where expires_at < now()");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteSession(pool, sessionId) {
  await pool.query("delete from sessions where id = $1", [sessionId]);
}

// Все сессии пользователя, кроме текущей: смена собственного пароля не должна
// выкидывать того, кто её делает, но обязана выкинуть всех остальных.
export async function deleteOtherSessions(pool, userId, keepSessionId) {
  await pool.query("delete from sessions where user_id = $1 and id <> $2", [userId, keepSessionId]);
}

export async function updateUserName(pool, userId, name) {
  await pool.query("update users set name = $1 where id = $2 and name is distinct from $1", [name, userId]);
}

export async function updateUserPassword(pool, userId, { salt, passwordHash }) {
  await pool.query("update users set salt = $1, password_hash = $2 where id = $3", [salt, passwordHash, userId]);
}
