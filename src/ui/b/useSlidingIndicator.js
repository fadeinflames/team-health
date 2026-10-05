import { useLayoutEffect } from "react";

// Индикатор активного пункта (подложка сегмента, подчёркивание вкладки) едет
// transform-ом и меняет ширину. Хук замеряет активный элемент и кладёт в
// контейнер переменные --ui-ind-x и --ui-ind-w; сам индикатор рисует CSS.
// Первый кадр ставится без анимации (data-ready появляется позже).
export function useSlidingIndicator(rootRef, activeSelector, dep) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const measure = () => {
      const active = root.querySelector(activeSelector);
      if (!active) {
        root.setAttribute("data-indicator", "none");
        return;
      }
      root.removeAttribute("data-indicator");
      root.style.setProperty("--ui-ind-x", `${active.offsetLeft}px`);
      root.style.setProperty("--ui-ind-w", `${active.offsetWidth}px`);
    };

    measure();
    const frame = requestAnimationFrame(() => root.setAttribute("data-ready", "true"));

    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(root);
      Array.from(root.children).forEach((child) => observer.observe(child));
    }
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, activeSelector, dep]);
}
