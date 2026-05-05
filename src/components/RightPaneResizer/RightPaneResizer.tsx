import { useEffect, useRef } from 'react';
import { useSettings } from '../../store/settingsStore';

const DEFAULT = 360;

export function RightPaneResizer() {
  const setRightPaneWidth = useSettings(s => s.setRightPaneWidth);
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
      const w = window.innerWidth - ev.clientX;
      setRightPaneWidth(w);
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

  const onDoubleClick = () => setRightPaneWidth(DEFAULT);

  return (
    <div
      className="right-pane-resizer"
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize · Double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    />
  );
}
