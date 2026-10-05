// Ошибка с HTTP-статусом: верхний обработчик в server.js отдаёт status и
// message клиенту, всё остальное превращает в 500.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
