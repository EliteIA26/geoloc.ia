"use client";

import MapShell from "@/components/map-shell";

export default function PanelPage() {
  return (
    <div className="flex h-screen w-screen flex-col">
      <header className="bg-emerald-900 px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">
          Panel Territorial Agrícola · La Rioja
        </h1>
      </header>
      <div className="relative flex-1">
        <MapShell center={[-67.2, -29.4]} zoom={6.3} />
      </div>
    </div>
  );
}
