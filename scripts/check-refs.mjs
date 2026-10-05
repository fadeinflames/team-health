#!/usr/bin/env node
// Находит в .jsx/.js идентификаторы, которые нигде не объявлены и не импортированы.
//
// Зачем: сборка Vite такие места пропускает, ошибка всплывает только в браузере
// на том пути, где переменную используют. Скрипт нужен при переносе кода между
// файлами (экраны выезжают из App.jsx в src/screens): забытый пропс или
// помощник ловится сразу.
//
// Использует @babel/parser и @babel/traverse, которые ставит плагин React для
// Vite; в зависимости проекта они не заявлены, это инструмент разработчика.
//
//   node scripts/check-refs.mjs [путь ...]      (по умолчанию src)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default || traverseModule;

const GLOBALS = new Set(
  (
    "window document navigator location history localStorage sessionStorage console Math JSON Date Number String Boolean Object Array Set Map WeakMap WeakSet Promise Symbol " +
    "RegExp Error TypeError RangeError URL URLSearchParams Blob File FileReader FormData Headers Request Response AbortController fetch setTimeout clearTimeout setInterval clearInterval " +
    "requestAnimationFrame cancelAnimationFrame queueMicrotask structuredClone parseInt parseFloat isNaN isFinite undefined NaN Infinity globalThis Intl encodeURIComponent decodeURIComponent " +
    "encodeURI decodeURI IntersectionObserver ResizeObserver MutationObserver matchMedia getComputedStyle CSS Event CustomEvent KeyboardEvent MouseEvent HTMLElement Node Element " +
    "process import arguments crypto performance atob btoa alert confirm prompt Image Audio TextEncoder TextDecoder Uint8Array Float32Array ArrayBuffer BigInt Reflect Proxy"
  ).split(" ")
);

function* walk(target) {
  const stat = statSync(target);
  if (stat.isFile()) {
    if ([".js", ".jsx", ".mjs"].includes(extname(target))) yield target;
    return;
  }
  for (const name of readdirSync(target)) yield* walk(join(target, name));
}

let problems = 0;
for (const root of process.argv.slice(2).length ? process.argv.slice(2) : ["src"]) {
  for (const file of walk(root)) {
    const ast = parse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx"] });
    const seen = new Set();
    traverse(ast, {
      ReferencedIdentifier(path) {
        const { name } = path.node;
        if (path.parent.type === "JSXAttribute") return;
        if (path.isJSXIdentifier() && /^[a-z]/.test(name)) return; // теги div, span…
        if (path.scope.hasBinding(name) || GLOBALS.has(name)) return;
        const key = `${name}:${path.node.loc.start.line}`;
        if (seen.has(key)) return;
        seen.add(key);
        console.error(`${file}:${path.node.loc.start.line}  не объявлено: ${name}`);
        problems += 1;
      }
    });
  }
}
if (problems) {
  console.error(`Найдено необъявленных идентификаторов: ${problems}`);
  process.exit(1);
}
console.log("Необъявленных идентификаторов нет.");
