import { useEffect, useRef } from 'react';
import { useSettings } from '../../store/settingsStore';

const MIN = 60;
const MAX = 800;
const DEFAULT = 200;
const STATUS_BAR_PX = 24;

export function OutputResizer() {
  const setOutputHeight = useSettings(s => s.setOutputHeight);
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
      const h = Math.max(MIN, Math.min(MAX, window.innerHeight - ev.clientY - STATUS_BAR_PX));
      setOutputHeight(h);
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

  const onDoubleClick = () => setOutputHeight(DEFAULT);

  return (
    <div
      className="output-resizer"
      role="separator"
      aria-orientation="horizontal"
      title="Drag to resize · Double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    />
  );
}
