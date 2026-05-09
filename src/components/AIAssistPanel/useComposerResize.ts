// Shared hook for the Chat / Agent composer drag-to-resize handle.
// The handle sits at the top edge of the composer; dragging it upward
// grows the composer (so the textarea gets taller). Height is persisted
// to localStorage per storageKey so it survives reloads.

import { useCallback, useEffect, useRef, useState } from 'react';

const MIN = 56;
const MAX = 400;

export function useComposerResize(storageKey: string, defaultHeight = 72) {
  const [height, setHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultHeight;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultHeight;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(MIN, Math.min(MAX, n)) : defaultHeight;
  });

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, String(height)); } catch { /* ignore */ }
  }, [storageKey, height]);

  // Cleanup body styles if unmounted mid-drag.
  useEffect(() => () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const draggingRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    const startY = e.clientY;
    const startH = height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      // Drag up (clientY decreases) → composer grows.
      const next = Math.max(MIN, Math.min(MAX, startH + (startY - ev.clientY)));
      setHeight(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [height]);

  const reset = useCallback(() => setHeight(defaultHeight), [defaultHeight]);

  return { height, onPointerDown, reset };
}
