import { useEffect, useRef } from 'react';
import { useSettings } from '../../store/settingsStore';

const MIN = 140;
const MAX = 600;
const DEFAULT = 220;

export function SidebarResizer() {
  const setSidebarWidth = useSettings(s => s.setSidebarWidth);
  const draggingRef = useRef(false);

  useEffect(() => () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const w = Math.max(MIN, Math.min(MAX, ev.clientX));
      setSidebarWidth(w);
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

  const onDoubleClick = () => setSidebarWidth(DEFAULT);

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize · Double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    />
  );
}
