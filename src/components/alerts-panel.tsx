"use client";

import { useEffect, useState } from "react";
import { fetchJson, AlertasSchema, type Alerta } from "@/lib/data";

const sevColor: Record<Alerta["severidad"], string> = {
  baja: "bg-yellow-100 text-yellow-800",
  media: "bg-orange-100 text-orange-800",
  alta: "bg-red-100 text-red-800",
};

export default function AlertsPanel() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  useEffect(() => {
    fetchJson("/data/alertas.json", AlertasSchema).then(setAlertas);
  }, []);
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-emerald-900">Alertas por zona</h2>
      {alertas.map((a, i) => (
        <div key={i} className={`rounded px-2 py-1 text-xs ${sevColor[a.severidad]}`}>
          <strong className="capitalize">{a.tipo}</strong> · {a.zona}
          <div>{a.detalle}</div>
        </div>
      ))}
    </div>
  );
}
