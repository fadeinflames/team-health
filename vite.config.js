import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
