// Список скомпрометированных и заведомо слабых значений, хранится ТОЛЬКО как
// sha256: сами значения не должны лежать в репозитории (их ищут по истории и
// по дереву). Хеш не защищает слабое значение от подбора, он лишь не даёт
// найти его поиском по тексту: считайте все значения из списка скомпрометированными
// и ротируйте там, где они использовались.
//
// Проверка: isBurnedSecret(значение). Поиск таких значений в дереве репозитория
// без их хранения открытым текстом: scripts/check-burned.mjs.
import { createHash } from "node:crypto";

// Всё, что запрещено как ADMIN_PASSWORD и SURVEY_RESPONSE_SECRET и считается
// слабым в scripts/secrets.mjs: скомпрометированные значения и типичные слабые пароли.
// Всё, что запрещено как ADMIN_PASSWORD и SURVEY_RESPONSE_SECRET и считается
// слабым в scripts/secrets.mjs: скомпрометированные значения и типичные слабые пароли.
const BURNED_SHA256 = new Set([
  "057ba03d6c44104863dc7361fe4578965d1887360f90a0895882e58a6248fc86",
  "1210bb365f950c71128f492608a520986d43a83bd7735aacf7f26a827e500d35",
  "1a644c2a46a45726d4545bd9d472ae0c840b2794f3fc2d7b2d8bb2babdb9b302",
  "2a97516c354b68848cdbd8f54a226a0a55b21ed138e207ad6c5cbb9c00aa5aea",
  "4f2146347154eb3d0d28d47d752c3cc4aab910be2d8ba554c7eb945c2493d837",
  "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
  "8b96eb7ee29243014c75cd3a9df3d4bf29aeda56bdd8e330f185fd60bee04b5e",
  "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
  "e6d5b035c4c6c73e858b8a36f033bc363a3e19b34a4982e274d55ab49fc6af77"
]);

// Только конкретные утёкшие значения (не общеупотребительные слова): по ним
// scripts/check-burned.mjs ищет следы в дереве и истории репозитория.
const LEAKED_SHA256 = new Set([
  "057ba03d6c44104863dc7361fe4578965d1887360f90a0895882e58a6248fc86",
  "1210bb365f950c71128f492608a520986d43a83bd7735aacf7f26a827e500d35",
  "cc8612f47c549caa8f9d66ebde6e02bc77dbba31a531f5cd9bf3555e284ef15c",
  "e6d5b035c4c6c73e858b8a36f033bc363a3e19b34a4982e274d55ab49fc6af77"
]);


export const burnedHashes = BURNED_SHA256;
export const leakedHashes = LEAKED_SHA256;

export function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function isBurnedSecret(value) {
  return BURNED_SHA256.has(sha256Hex(value));
}
