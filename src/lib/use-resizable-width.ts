"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useResizableWidth(initial = 320, min = 300, max = 560) {
  const [width, setWidth] = useState(initial);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!dragging.current) return;
      // Sidebar is on the right; dragging its left edge: width grows as cursor moves left.
      setWidth(Math.min(max, Math.max(min, window.innerWidth - e.clientX)));
    }
    function up() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [min, max]);

  return { width, onPointerDown };
}
