// Копирование в буфер обмена: современный API, а там, где он недоступен
// (http без localhost, старые браузеры), запасной путь через скрытое поле.
export async function copyText(text) {
  const value = String(text ?? "");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* падаем на запасной путь */
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  } catch {
    return false;
  }
}

// Случайный пароль без похожих символов (0/O, 1/l/I): его удобно диктовать и
// вводить с телефона. Гарантированно есть строчная, заглавная и цифра.
export function generatePassword(length = 14) {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = lower + upper + digits;
  const pick = (set, byte) => set[byte % set.length];
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const chars = [pick(lower, bytes[0]), pick(upper, bytes[1]), pick(digits, bytes[2])];
  for (let i = 3; i < length; i += 1) chars.push(pick(all, bytes[i]));
  // Тасуем, чтобы обязательные символы не стояли всегда в начале.
  const order = new Uint32Array(chars.length);
  crypto.getRandomValues(order);
  return chars
    .map((char, i) => [order[i], char])
    .sort((a, b) => a[0] - b[0])
    .map(([, char]) => char)
    .join("");
}
