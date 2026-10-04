import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, toCsv } from "../../src/csv.js";

test("кавычки, запятые и переводы строк экранируются", () => {
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("a\nb"), '"a\nb"');
  assert.equal(csvCell("a\r\nb"), '"a\r\nb"');
});

test("значения, начинающиеся с = + - @ таб или CR, получают префикс апострофа", () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+7 999"), "'+7 999");
  assert.equal(csvCell("-1+2"), "'-1+2");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\tcmd"), "'\tcmd");
  // CR ещё и требует кавычек, префикс при этом внутри них.
  assert.equal(csvCell("\rcmd"), '"\'\rcmd"');
  // Префикс и экранирование работают вместе.
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
});

test("настоящие числа не получают префикс: отрицательный разрыв компетенции остаётся числом", () => {
  assert.equal(csvCell(-0.5), "-0.5");
  assert.equal(csvCell(-3), "-3");
  // Строка, похожая на число, но пришедшая от человека, префикс получает.
  assert.equal(csvCell("-0.5"), "'-0.5");
});

test("точка с запятой берётся в кавычки (русская локаль Excel)", () => {
  assert.equal(csvCell("a;b"), '"a;b"');
});

test("опасный символ не в начале значения префикса не требует", () => {
  assert.equal(csvCell("a=b"), "a=b");
  assert.equal(csvCell("1-2"), "1-2");
  assert.equal(csvCell("mail@example.com"), "mail@example.com");
});

test("обычные числа и строки остаются как есть", () => {
  assert.equal(csvCell("Привет"), "Привет");
  assert.equal(csvCell("abc def"), "abc def");
  assert.equal(csvCell(42), "42");
  assert.equal(csvCell(3.5), "3.5");
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell("2026-10-04"), "2026-10-04");
});

test("null и undefined дают пустую ячейку", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("toCsv соединяет строки через CRLF, а ячейки запятой", () => {
  const lines = toCsv([
    ["Имя", "Оценка", "Комментарий"],
    ["Анна", 4.5, "хорошо, но"],
    ["Игорь", null, "=cmd"]
  ]).split("\r\n");
  assert.equal(lines[0], "Имя,Оценка,Комментарий");
  assert.equal(lines[1], 'Анна,4.5,"хорошо, но"');
  assert.equal(lines[2], "Игорь,,'=cmd");
});

test("toCsv не использует голый LF как разделитель строк", () => {
  const csv = toCsv([["a"], ["b"]]);
  assert.ok(csv.startsWith("a\r\nb"));
  assert.ok(!/(^|[^\r])\n/.test(csv));
});
