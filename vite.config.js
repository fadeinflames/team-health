import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// NO_LEGACY=1 собирает приложение без старого src/styles.css. Нужно, пока
// экраны переезжают на новую библиотеку: так видно, как экран выглядит сам по
// себе, без протечек старых правил на голые button/input/label. Когда старый
// файл удалят, переключатель уйдёт вместе с ним.
const noLegacy = process.env.NO_LEGACY === "1";

export default defineConfig({
  plugins: [react()],
  resolve: noLegacy
    ? {
        alias: [
          {
            find: /^\.\/styles\.css$/,
            replacement: fileURLToPath(new URL("./src/styles/empty.css", import.meta.url))
          }
        ]
      }
    : undefined,
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // The app calls the API with relative paths, so the dev server has to forward
      // /api to server.js. changeOrigin stays false on purpose: rewriting Origin
      // breaks the SameSite=Lax session cookie.
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:4173",
        changeOrigin: false
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 4173
  }
});
