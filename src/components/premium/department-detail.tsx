"use client";

import type { DepartamentoProps } from "@/lib/departamentos";
import {
  vegetationStatus,
  vegetationSentence,
  vegetationDotClass,
} from "@/lib/vegetation";
import { buildSparklinePath } from "@/lib/sparkline";
import type { ProvinciaNdvi } from "@/lib/satelital";
import { MapPin, Leaf, Droplets, Calendar, Satellite, Info } from "lucide-react";

function ProvenancePill({ fuente }: { fuente: DepartamentoProps["fuente"] }) {
  const satelital = fuente === "satelital";
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
        satelital 
          ? "bg-primary/10 text-primary border-primary/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]" 
          : "bg-muted text-muted-foreground border-border/50"
      }`}
    >
      {satelital ? <Satellite className="w-3 h-3" /> : <Info className="w-3 h-3" />}
      {satelital ? "Dados de Satélite" : "Referência Local"}
    </div>
  );
}

export default function DepartmentDetail({
  dep,
  serie,
  prov,
}: {
  dep: DepartamentoProps | null;
  serie: number[];
  prov: ProvinciaNdvi | null;
  onClear: () => void;
}) {
  if (!dep) return null;

  // Use real MODIS mean when available (fuente: "satelital"), else fall back to geojson value.
  const modisNdvi = prov?.deptos[dep.nombre];
  const ndvi = modisNdvi !== undefined ? modisNdvi : dep.ndvi;
  const fuente: DepartamentoProps["fuente"] = modisNdvi !== undefined ? "satelital" : dep.fuente;

  const status = vegetationStatus(ndvi);
  const showSparkline = dep.nombre === "Arauco" && serie.length > 1;

  return (
    <div className="glass-panel p-6 flex flex-col gap-6">
      
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm uppercase tracking-wider font-semibold">Departamento</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground truncate">
            {dep.nombre}
          </h2>
        </div>
        <ProvenancePill fuente={fuente} />
      </div>

      {/* Hero Status */}
      <div className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
        <div className={`flex items-center justify-center h-12 w-12 rounded-full ${vegetationDotClass[status]} shadow-lg`}>
          <Leaf className="w-6 h-6 text-white drop-shadow-md" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-0.5">Status Geral</p>
          <p className="text-xl leading-tight text-foreground font-semibold">
            {vegetationSentence[status]}
          </p>
        </div>
      </div>

      {/* Metrics Bento Grid */}
      <div className="grid grid-cols-2 gap-4">
        
        {/* NDVI Card */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10 relative overflow-hidden group hover:bg-white/10 transition-colors">
          <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Leaf className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Leaf className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">Índice NDVI</span>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold text-foreground tabular-nums tracking-tighter">{ndvi.toFixed(2)}</span>
          </div>
          
          {/* Custom Mini Progress Bar for NDVI (-1 to 1, let's normalize 0 to 1 for visuals) */}
          <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
              style={{ width: `${Math.max(0, ndvi * 100)}%` }} 
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-right">Saúde da Vegetação</p>
        </div>

        {/* NDWI Card */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10 relative overflow-hidden group hover:bg-white/10 transition-colors">
           <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Droplets className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Droplets className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">Índice NDWI</span>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold text-foreground tabular-nums tracking-tighter">{dep.ndwi.toFixed(2)}</span>
          </div>
          
          {/* Custom Mini Progress Bar for NDWI (-1 to 1) */}
          <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
              style={{ width: `${Math.max(0, (dep.ndwi + 1) * 50)}%` }} 
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-right">Estresse Hídrico / Umidade</p>
        </div>

      </div>

      {/* Footer Meta Data */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-white/10 pt-4 mt-2">
        {prov && modisNdvi !== undefined && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>Última captura: <strong className="text-foreground">{prov.fecha}</strong></span>
          </div>
        )}
      </div>

      {/* Sparkline (if applicable) */}
      {showSparkline && (
        <div className="mt-2 bg-black/20 p-4 rounded-2xl border border-white/5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Leaf className="w-3 h-3" /> Evolução Histórica (NDVI)
          </p>
          <svg viewBox="0 0 120 30" className="w-full h-12" aria-hidden>
            <path
              d={buildSparklinePath(serie, 120, 30)}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              className="drop-shadow-[0_0_3px_rgba(16,185,129,0.8)]"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
