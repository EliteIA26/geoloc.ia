"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Activity, Droplets } from "lucide-react";

const ALERTS = [
  { id: 1, text: "Arauco: Caída de NDVI del 5% detectada", icon: AlertTriangle, color: "text-amber-400" },
  { id: 2, text: "Capital: Humedad estable en las últimas 48hs", icon: Activity, color: "text-emerald-400" },
  { id: 3, text: "Chilecito: Riesgo hídrico moderado", icon: Droplets, color: "text-blue-400" },
  { id: 4, text: "Felipe Varela: Vegetación en niveles óptimos", icon: Activity, color: "text-emerald-400" },
];

export default function LiveTicker() {
  return (
    <div className="w-full bg-black/60 border-b border-white/10 backdrop-blur-md overflow-hidden flex items-center h-8 pointer-events-auto">
      <div className="shrink-0 bg-primary text-primary-foreground px-3 font-bold text-[10px] uppercase tracking-widest flex items-center h-full z-10 shadow-[10px_0_20px_rgba(0,0,0,0.8)]">
        <span className="relative flex h-2 w-2 mr-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
        Alertas IA
      </div>
      <div className="flex-1 relative overflow-hidden flex items-center h-full">
        {/* We use two sets of alerts for seamless infinite scrolling */}
        <motion.div
          className="flex whitespace-nowrap gap-12 absolute left-0"
          animate={{ x: [0, -1000] }}
          transition={{ repeat: Infinity, ease: "linear", duration: 30 }}
        >
          {[...ALERTS, ...ALERTS, ...ALERTS].map((alert, i) => {
            const Icon = alert.icon;
            return (
              <div key={i} className="flex items-center gap-2 text-xs font-medium text-gray-300">
                <Icon className={`w-3.5 h-3.5 ${alert.color}`} />
                {alert.text}
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
