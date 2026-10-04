// Список скомпрометированных значений хранится только хэшами (lib/burned-secrets.js),
// а scripts/check-burned.mjs ищет их следы в дереве без открытого текста.
// Тесты не содержат самих значений: проверяются форма списка и поведение.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { burnedHashes, isBurnedSecret, leakedHashes, sha256Hex } from "../../lib/burned-secrets.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HEX64 = /^[0-9a-f]{64}$/;

test("isBurnedSecret: пустая строка и произвольное значение не считаются скомпрометированными", () => {
  assert.equal(isBurnedSecret(""), false);
  assert.equal(isBurnedSecret("definitely-not-in-the-list-123"), false);
});

test("sha256Hex стабилен: известное значение для abc", () => {
  const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(sha256Hex("abc"), expected);
  assert.equal(sha256Hex("abc"), sha256Hex("abc"));
  // Пустая строка тоже имеет известный хэш: проверка не должна падать на ней.
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("burnedHashes и leakedHashes непусты и состоят из sha256 в hex", () => {
  for (const [name, set] of [
    ["burnedHashes", burnedHashes],
    ["leakedHashes", leakedHashes]
  ]) {
    assert.ok(set.size > 0, `${name} пуст`);
    for (const hash of set) assert.match(hash, HEX64, `${name}: «${hash}» не sha256 в hex`);
  }
});

test("isBurnedSecret согласован со множеством: значение с хэшем из списка находится", () => {
  // Самих значений в тесте нет, поэтому проверяем механику на подмене: любой
  // хэш из списка, поданный как значение, сам скомпрометированным не является
  // (isBurnedSecret хэширует вход), а значение, чей sha256 добавлен, находится.
  const [anyHash] = burnedHashes;
  assert.equal(isBurnedSecret(anyHash), false);
  const probe = `probe-${Date.now()}`;
  assert.equal(isBurnedSecret(probe), false);
  burnedHashes.add(sha256Hex(probe));
  try {
    assert.equal(isBurnedSecret(probe), true);
  } finally {
    burnedHashes.delete(sha256Hex(probe));
  }
  assert.equal(isBurnedSecret(probe), false);
});

function gitAvailable() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test(
  "scripts/check-burned.mjs завершается кодом 0 на текущем дереве",
  { skip: gitAvailable() ? false : "git недоступен или каталог не репозиторий" },
  () => {
    // execFileSync бросает при ненулевом коде выхода: stderr скрипта (файл и
    // строка, без значения) попадёт в сообщение провала.
    const output = execFileSync(process.execPath, ["scripts/check-burned.mjs"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    assert.match(output, /Дерево чисто/);
  }
);
