import { HttpError } from "./http-error.js";

// Чанки копятся как Buffer и декодируются один раз в конце: склейка строк
// `body += chunk` рвала многобайтную кириллицу на границе чанка в U+FFFD, а
// JSON при этом оставался валидным, то есть порча молча сохранялась.
// Лимит считается в байтах, а не в символах.
export function readJson(request, { limitBytes = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limitBytes) {
        settled = true;
        request.destroy();
        reject(new HttpError(413, "Слишком большой запрос"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      const body = Buffer.concat(chunks).toString("utf8");
      if (!body) {
        resolve({});
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        reject(new HttpError(400, "Некорректный JSON"));
        return;
      }
      // Обработчики читают поля тела напрямую: null, массив или примитив
      // дали бы TypeError и 500 вместо понятного 400.
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        reject(new HttpError(400, "Тело запроса должно быть объектом"));
        return;
      }
      resolve(parsed);
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}
