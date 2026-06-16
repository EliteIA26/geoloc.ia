"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { satelliteStyle } from "@/lib/map-style";

export type MapShellProps = {
  center: [number, number];
  zoom: number;
  onReady?: (map: maplibregl.Map) => void;
};

export default function MapShell({ center, zoom, onReady }: MapShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: satelliteStyle,
      center,
      zoom,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    map.on("load", () => onReady?.(map));
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // center/zoom are initial-only by design; onReady is provided by parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
