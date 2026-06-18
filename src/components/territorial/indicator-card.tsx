import type { Indicador } from "@/lib/territorial";
import SourceBadge from "./source-badge";

type IndicatorCardProps = {
  ind: Indicador;
};

export default function IndicatorCard({ ind }: IndicatorCardProps) {
  return (
    <div className="glass-panel space-y-1 p-3">
      <div className="text-[11px] text-muted-foreground">{ind.etiqueta}</div>
      <div className="text-sm text-[var(--foreground)]">{ind.valor}</div>
      {ind.nota ? (
        <div className="text-[11px] text-muted-foreground">{ind.nota}</div>
      ) : null}
      <SourceBadge
        fonte={ind.fonte}
        fecha={ind.fecha}
        confianza={ind.confianza}
        url={ind.url}
      />
    </div>
  );
}
