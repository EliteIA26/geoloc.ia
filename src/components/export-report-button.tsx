"use client";

export default function ExportReportButton() {
  return (
    <button
      onClick={() => alert("Informe en preparación (demo). La exportación PDF llega en la fase 2.")}
      className="w-full rounded bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800"
    >
      Exportar informe
    </button>
  );
}
