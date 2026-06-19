"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import { X } from "lucide-react";
import type { Punto } from "@/lib/bermejo-puntos";

const EJE_LABEL: Record<Punto["eje"], string> = {
  turismo: "Turismo",
  logistica: "Logística · conexión con Chile",
  poblacion: "Población",
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: "easeOut" } },
  exit: { opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.3, ease: "easeIn" } },
};

export default function PointHud({ punto, onClose }: { punto: Punto | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {punto && (
        <motion.div
          key={punto.id}
          className="pointer-events-auto absolute right-4 top-4 bottom-4 z-30 w-[min(420px,85%)]"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="glass-panel flex h-full flex-col overflow-hidden rounded-2xl border-white/10 bg-card/85 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
            <div className="relative h-48 shrink-0 bg-gradient-to-br from-emerald-900/40 to-stone-900/70">
              {punto.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={punto.foto} alt={punto.nombre} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl text-white/40" aria-hidden>
                  {punto.tipo === "atractivo" ? "★" : "●"}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white backdrop-blur-md hover:bg-black/70"
              >
                <X className="h-4 w-4" />
              </button>
              {punto.foto && punto.credito && (
                <span className="absolute bottom-1 right-2 max-w-[90%] truncate text-[9px] text-white/70">
                  {punto.credito}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-primary">{EJE_LABEL[punto.eje]}</p>
                <h2 className="text-xl font-semibold text-foreground">{punto.nombre}</h2>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{punto.descripcion}</p>
              {punto.datos.length > 0 && (
                <ul className="space-y-1">
                  {punto.datos.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground">
                      <span className="text-primary">·</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px] text-muted-foreground">
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-800">{punto.confianza}</span>
                <span>{punto.fonte}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
