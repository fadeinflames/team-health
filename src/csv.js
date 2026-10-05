// CSV для выгрузок. Файл открывают в Excel и Google Sheets, а в ячейках лежит
// текст, который вводят люди (ответы опросов, цитаты, названия), поэтому
// значение, начинающееся с = + - @, табуляции или CR, станет формулой при
// открытии. Префикс «'» превращает его в обычный текст, а сам апостроф
// Excel и Sheets в ячейке не показывают.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  // Настоящие числа формулой не бывают, а отрицательные (разрыв компетенции
  // «-0.5») от префикса перестали бы быть числами.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  let text = String(value ?? "");
  if (FORMULA_START.test(text)) text = `'${text}`;
  // «;» тоже в кавычках: в русской локали Excel разделитель — точка с запятой.
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
