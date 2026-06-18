"use client";

import { motion, type Variants } from "framer-motion";
import type { DepartamentoProps } from "@/lib/departamentos";
import { vegetationStatus, vegetationSentence, vegetationDotClass } from "@/lib/vegetation";
import { buildSparklinePath } from "@/lib/sparkline";
import type { ProvinciaNdvi, Satelital } from "@/lib/satelital";
import { MapPin, Leaf, Droplets, Calendar } from "lucide-react";
import TrendBadge from "@/components/premium/trend-badge";

export default function RadialDepartmentView({
  dep,
  serie,
  prov,
  sat,
  onClear,
}: {
  dep: DepartamentoProps | null;
  serie: number[];
  prov: ProvinciaNdvi | null;
  sat: Satelital | null;
  onClear: () => void;
}) {
  if (!dep) return null;

  const modisNdvi = prov?.deptos[dep.nombre];
  const ndvi = modisNdvi !== undefined ? modisNdvi : dep.ndvi;
  const status = vegetationStatus(ndvi);
  const showSparkline = dep.nombre === "Arauco" && serie.length > 1;

  // Animation variants
  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.6, delay: 0.8, ease: "easeOut" } // appear near end of line animation
    },
    exit: {
      opacity: 0,
      y: 10,
      scale: 0.95,
      transition: { duration: 0.4, ease: "easeIn" }
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.8 } },
    exit: { opacity: 0, transition: { duration: 0.6, delay: 0.4 } }
  };

  return (
    <motion.div 
      className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Removed the circular CSS mask blur so the map polygon is 100% sharp inside its boundaries, handled purely by MapLibre's vector layer */}
 
      {/* Floating Cards - Top Left */}
      <motion.div 
        className="absolute top-[10%] left-[8%] w-[320px] pointer-events-auto"
        variants={cardVariants} initial="hidden" animate="visible" exit="exit"
      >
        <div className="glass-panel p-5 rounded-2xl border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl bg-card/80">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm uppercase tracking-wider font-semibold">Departamento alvo</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground mb-4">{dep.nombre}</h2>
          
          <div className="flex items-center gap-3 bg-black/30 p-3 rounded-xl border border-white/5">
            <div className={`flex items-center justify-center h-10 w-10 shrink-0 rounded-full ${vegetationDotClass[status]} shadow-lg`}>
              <Leaf className="w-5 h-5 text-white drop-shadow-md" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Diagnóstico IA</p>
              <p className="text-sm leading-tight text-foreground font-semibold">
                {vegetationSentence[status]}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating Cards - Top Right */}
      <motion.div 
        className="absolute top-[10%] right-[8%] w-[280px] pointer-events-auto"
        variants={cardVariants} initial="hidden" animate="visible" exit="exit"
      >
        <div className="glass-panel p-6 rounded-2xl border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.15)] relative overflow-hidden group backdrop-blur-3xl bg-card/80">
          <div className="absolute -right-4 -top-4 opacity-10">
            <Leaf className="w-24 h-24 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <Leaf className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Índice Vegetação (NDVI)</span>
          </div>
          <span className="text-5xl font-bold text-foreground tabular-nums tracking-tighter block mb-3 drop-shadow-md">{ndvi.toFixed(2)}</span>
          <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" style={{ width: `${Math.max(0, ndvi * 100)}%` }} />
          </div>
        </div>
      </motion.div>

      {/* Floating Cards - Bottom Left */}
      <motion.div 
        className="absolute bottom-[10%] left-[8%] w-[280px] pointer-events-auto"
        variants={cardVariants} initial="hidden" animate="visible" exit="exit"
      >
        <div className="glass-panel p-6 rounded-2xl border-blue-500/20 shadow-[0_0_40px_rgba(59,130,246,0.15)] relative overflow-hidden group backdrop-blur-3xl bg-card/80">
          <div className="absolute -right-4 -top-4 opacity-10">
            <Droplets className="w-24 h-24 text-blue-400" />
          </div>
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <Droplets className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Estresse Hídrico (NDWI)</span>
          </div>
          <span className="text-5xl font-bold text-foreground tabular-nums tracking-tighter block mb-3 drop-shadow-md">{dep.ndwi.toFixed(2)}</span>
          <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ width: `${Math.max(0, (dep.ndwi + 1) * 50)}%` }} />
          </div>
        </div>
      </motion.div>

      {/* Floating Cards - Bottom Right */}
      <motion.div 
        className="absolute bottom-[10%] right-[8%] w-[320px] pointer-events-auto flex flex-col gap-4"
        variants={cardVariants} initial="hidden" animate="visible" exit="exit"
      >
        {showSparkline && (
          <div className="glass-panel p-5 rounded-2xl border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl bg-card/80">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Evolução Histórica
            </p>
            <svg viewBox="0 0 120 30" className="w-full h-12 mt-2" aria-hidden>
              <path d={buildSparklinePath(serie, 120, 30)} fill="none" stroke="var(--primary)" strokeWidth={2} className="drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
            </svg>
          </div>
        )}
        {sat?.ndviTrend && dep.nombre === "Arauco" && (
          <div className="glass-panel rounded-2xl p-1 bg-card/90 shadow-xl border-white/5">
             <TrendBadge actual={sat.ndviTrend.actual} anterior={sat.ndviTrend.anterior} />
          </div>
        )}
      </motion.div>

      {/* Central Floating Button to Clear */}
      <motion.button 
        variants={cardVariants} initial="hidden" animate="visible" exit="exit"
        onClick={onClear}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/50 backdrop-blur-md border border-white/20 px-8 py-3 text-white font-medium hover:bg-white hover:text-black transition-colors shadow-2xl pointer-events-auto flex items-center gap-2"
      >
        Retornar à Visão Global
      </motion.button>
    </motion.div>
  );
}
