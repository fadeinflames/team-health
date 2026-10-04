#!/usr/bin/env node
// Ищет в репозитории скомпрометированные значения, не храня их открытым
// текстом: каждое слово из файлов хешируется и сравнивается со списком
// lib/burned-secrets.js. Нужен CI вместо grep по литералам: сами значения в
// дереве лежать не должны.
//
//   node scripts/check-burned.mjs            дерево (git ls-files)
//   node scripts/check-burned.mjs --history  вся история (git log -p, долго)
//
// Код выхода 1, если что-то найдено. Найденное значение не печатается:
// только файл (или коммит) и номер строки.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { leakedHashes, sha256Hex } from "../lib/burned-secrets.js";

const SKIP = new Set(["lib/burned-secrets.js"]);
const WORD = /[^\s"'`<>()[\]{},;:=|\\/*#]+/g;
const ALNUM = /[A-Za-z0-9]+/g;

function hits(line) {
  for (const re of [WORD, ALNUM]) {
    for (const match of line.matchAll(re)) {
      const token = match[0];
      if (token.length < 4 || token.length > 128) continue;
      if (leakedHashes.has(sha256Hex(token)) || leakedHashes.has(sha256Hex(token.toLowerCase()))) return true;
    }
  }
  return false;
}

function checkTree() {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const found = [];
  for (const file of files) {
    if (SKIP.has(file) || /\.(png|jpe?g|gif|ico|woff2?|ttf|pdf|zip|gz)$/i.test(file)) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((line, index) => {
      if (hits(line)) found.push(`${file}:${index + 1}`);
    });
  }
  return found;
}

function checkHistory() {
  return new Promise((resolve, reject) => {
    const found = new Set();
    const child = spawn("git", ["log", "--all", "-p", "--no-color", "--format=commit %H"], { stdio: ["ignore", "pipe", "inherit"] });
    let commit = "";
    let file = "";
    let rest = "";
    child.stdout.setEncoding("utf8");
    const handle = (line) => {
      if (line.startsWith("commit ")) commit = line.slice(7, 19);
      else if (line.startsWith("+++ ") || line.startsWith("--- ")) file = line.slice(4);
      else if (hits(line)) found.add(`${commit} ${file}`);
    };
    child.stdout.on("data", (chunk) => {
      const lines = (rest + chunk).split("\n");
      rest = lines.pop();
      lines.forEach(handle);
    });
    child.on("error", reject);
    child.on("close", () => {
      if (rest) handle(rest);
      resolve([...found]);
    });
  });
}

const found = process.argv.includes("--history") ? await checkHistory() : checkTree();
if (found.length) {
  console.error(`Найдены скомпрометированные значения (${found.length}):`);
  for (const where of found.slice(0, 50)) console.error(`  ${where}`);
  process.exit(1);
}
console.log(process.argv.includes("--history") ? "История чиста." : "Дерево чисто.");
