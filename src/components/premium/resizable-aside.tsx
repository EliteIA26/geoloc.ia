"use client";
import { useResizableWidth } from "@/lib/use-resizable-width";

export default function ResizableAside({ children }: { children: React.ReactNode }) {
  const { width, onPointerDown } = useResizableWidth();
  return (
    <div className="relative flex shrink-0" style={{ width }}>
      <div
        onPointerDown={onPointerDown}
        className="absolute left-0 top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-[var(--primary)]/30"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar panel"
      />
      <aside className="bg-background text-foreground flex w-full flex-col gap-4 overflow-y-auto border-l border-[var(--border)] p-4">
        {children}
      </aside>
    </div>
  );
}
