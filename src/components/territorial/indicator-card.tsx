import type { Indicador } from "@/lib/territorial";
import SourceBadge from "./source-badge";

type IndicatorCardProps = {
  ind: Indicador;
};

export default function IndicatorCard({ ind }: IndicatorCardProps) {
  return (
    <div className="glass-panel space-y-1 p-3">
      <p className="text-[11px] text-muted-foreground">{ind.etiqueta}</p>
      <p className="text-sm text-foreground">{ind.valor}</p>
      {ind.nota ? (
        <p className="text-[11px] text-muted-foreground">{ind.nota}</p>
      ) : null}
      <SourceBadge
        fonte={ind.fonte}
        fecha={ind.fecha}
        confianza={ind.confianza}
      />
    </div>
  );
}
