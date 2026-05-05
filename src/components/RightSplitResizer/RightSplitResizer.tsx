import { useEffect, useRef } from 'react';
import { useSettings } from '../../store/settingsStore';

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
}

export function RightSplitResizer({ containerRef }: Props) {
  const setRightTopHeight = useSettings(s => s.setRightTopHeight);
  const draggingRef = useRef(false);

  useEffect(() => () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = ev.clientY - rect.top;
      const max = Math.max(80, rect.height - 80 - 5);
      const clamped = Math.max(80, Math.min(max, top));
      setRightTopHeight(clamped);
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
  };

  const onDoubleClick = () => {
    const el = containerRef.current;
    if (el) setRightTopHeight(Math.round(el.getBoundingClientRect().height * 0.75));
  };

  return (
    <div
      className="right-split-resizer"
      role="separator"
      aria-orientation="horizontal"
      title="Drag to resize · Double-click to reset to 75/25"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    />
  );
}
