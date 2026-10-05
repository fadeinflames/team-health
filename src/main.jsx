import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { Button, ToastProvider } from "./ui";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";

// Каталог примитивов интерфейса: /#ui-kit, без входа и без данных.
const Kit = lazy(() => import("./ui/Kit.jsx"));
const showKit = window.location.hash === "#ui-kit";

// Без границы любая ошибка рендера роняет всё дерево в пустой белый экран, и
// человек не понимает, что случилось и что делать. Данные, уже ушедшие на
// сервер автосохранением, перезагрузка не затрагивает.
class ErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Ошибка интерфейса:", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        role="alert"
        style={{ maxWidth: 480, margin: "15vh auto", padding: "0 var(--sp-4)", textAlign: "center", display: "grid", gap: "var(--sp-4)", justifyItems: "center" }}
      >
        <h1 style={{ fontSize: "var(--text-2xl)", letterSpacing: "var(--tracking-tight)" }}>Что-то пошло не так</h1>
        <p style={{ color: "var(--text-2)" }}>
          Произошла непредвиденная ошибка. Перезагрузите страницу: уже сохранённые данные останутся на месте.
        </p>
        <Button onClick={() => window.location.reload()}>Перезагрузить страницу</Button>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      {showKit ? (
        <Suspense fallback={null}>
          <Kit />
        </Suspense>
      ) : (
        <ToastProvider>
          <App />
        </ToastProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
