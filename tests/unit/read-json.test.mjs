import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { HttpError } from "../../lib/http-error.js";
import { readJson } from "../../lib/read-json.js";

// Поддельный запрос: читатель подписывается на data/end/error, а чанки мы
// отдаём сами, чтобы резать тело в точке, которую выбираем мы, а не сеть.
function fakeRequest(chunks) {
  const request = new EventEmitter();
  request.destroyed = false;
  request.destroy = () => {
    request.destroyed = true;
  };
  setImmediate(() => {
    for (const chunk of chunks) {
      if (request.destroyed) return;
      request.emit("data", chunk);
    }
    if (!request.destroyed) request.emit("end");
  });
  return request;
}

const isHttpError = (status, message) => (error) =>
  error instanceof HttpError && error.status === status && (message === undefined || error.message === message);

test("кириллица и эмодзи, разрезанные чанками посреди символа, не портятся", async () => {
  const text = "Привет, команда 😀 Жизнь хороша 🚀 конец";
  const body = Buffer.from(JSON.stringify({ text }), "utf8");

  // Режем в каждой возможной точке: половина точек попадает внутрь
  // двухбайтовой буквы или четырёхбайтового эмодзи.
  for (let at = 1; at < body.length; at += 1) {
    const result = await readJson(fakeRequest([body.subarray(0, at), body.subarray(at)]));
    assert.equal(result.text, text, `разрез на байте ${at}`);
    assert.ok(!result.text.includes("�"), `U+FFFD при разрезе на байте ${at}`);
  }
});

test("побайтовая нарезка тоже даёт исходный текст", async () => {
  const text = "Ёжик 🦔 и ёлка";
  const body = Buffer.from(JSON.stringify({ text }), "utf8");
  const chunks = Array.from(body, (byte) => Buffer.from([byte]));
  const result = await readJson(fakeRequest(chunks));
  assert.equal(result.text, text);
});

test("лимит считается в байтах, а не в символах", async () => {
  const body = Buffer.from(JSON.stringify({ t: "я".repeat(100) }), "utf8");
  const chars = body.toString("utf8").length;
  assert.ok(body.length > chars, "кириллица должна занимать больше байт, чем символов");

  // По символам тело влезает в лимит, по байтам нет.
  const request = fakeRequest([body]);
  await assert.rejects(readJson(request, { limitBytes: chars }), isHttpError(413));
  assert.equal(request.destroyed, true, "запрос должен быть оборван");

  await assert.rejects(readJson(fakeRequest([body]), { limitBytes: body.length - 1 }), isHttpError(413));
  const ok = await readJson(fakeRequest([body]), { limitBytes: body.length });
  assert.equal(ok.t.length, 100);
});

test("лимит работает и на теле из нескольких чанков", async () => {
  const body = Buffer.from(JSON.stringify({ t: "x".repeat(500) }), "utf8");
  await assert.rejects(
    readJson(fakeRequest([body.subarray(0, 100), body.subarray(100, 300), body.subarray(300)]), { limitBytes: 400 }),
    isHttpError(413)
  );
});

test("пустое тело даёт пустой объект", async () => {
  assert.deepEqual(await readJson(fakeRequest([])), {});
  assert.deepEqual(await readJson(fakeRequest([Buffer.alloc(0)])), {});
});

test("невалидный JSON даёт 400", async () => {
  await assert.rejects(readJson(fakeRequest([Buffer.from("{bad")])), isHttpError(400));
  await assert.rejects(readJson(fakeRequest([Buffer.from('{"a":')])), isHttpError(400));
});

test("null, массив и примитивы дают 400 «Тело запроса должно быть объектом»", async () => {
  for (const raw of ["null", "[]", '[{"a":1}]', "42", '"строка"', "true"]) {
    await assert.rejects(
      readJson(fakeRequest([Buffer.from(raw)])),
      isHttpError(400, "Тело запроса должно быть объектом"),
      raw
    );
  }
});

test("обычный объект разбирается как есть", async () => {
  assert.deepEqual(await readJson(fakeRequest([Buffer.from('{"a":1,"b":[2]}')])), { a: 1, b: [2] });
});

test("ошибка потока отклоняет промис", async () => {
  const request = new EventEmitter();
  request.destroy = () => {};
  setImmediate(() => request.emit("error", new Error("сокет закрыт")));
  await assert.rejects(readJson(request), /сокет закрыт/);
});
