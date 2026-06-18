"use client";

export default function ExportReportButton() {
  return (
    <button
      type="button"
      onClick={() => alert("Informe en preparación (demo). La exportación PDF llega en la fase 2.")}
      className="w-full rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
    >
      Exportar informe
    </button>
  );
}
