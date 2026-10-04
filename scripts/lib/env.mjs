// Определение окружения для скриптов. Логика обязана совпадать с server.js
// (там тот же однострочник у appEnv): на Railway APP_ENV не задают, и
// production там определяется по RAILWAY_ENVIRONMENT. Скрипты, которые
// читали APP_ENV напрямую, на Railway считали окружение local и пропускали
// защиты от отката и демо-сидинга.
export function appEnv(env = process.env) {
  return env.APP_ENV || (env.RAILWAY_ENVIRONMENT ? "production" : "local");
}

export function isProductionEnv(env = process.env) {
  return appEnv(env) === "production";
}
