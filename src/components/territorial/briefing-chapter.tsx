import type { Indicador } from "@/lib/territorial";
import IndicatorCard from "./indicator-card";

type BriefingChapterProps = {
  numero: number;
  titulo: string;
  indicadores: Indicador[];
};

export default function BriefingChapter({
  numero,
  titulo,
  indicadores,
}: BriefingChapterProps) {
  if (indicadores.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm text-foreground">
        <span className="text-muted-foreground">{numero}.</span> {titulo}
      </h3>
      {indicadores.map((ind, index) => (
        <IndicatorCard
          key={`${ind.etiqueta}-${ind.fonte}-${ind.fecha}-${index}`}
          ind={ind}
        />
      ))}
    </section>
  );
}
