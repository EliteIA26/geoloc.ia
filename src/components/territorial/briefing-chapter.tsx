import type { Indicador } from "@/lib/territorial";
import IndicatorCard from "./indicator-card";

type BriefingChapterProps = {
  numero: number;
  titulo: string;
  indicadores: Indicador[];
  collapsible?: boolean;
  defaultOpen?: boolean;
};

export default function BriefingChapter({
  numero,
  titulo,
  indicadores,
  collapsible = false,
  defaultOpen = true,
}: BriefingChapterProps) {
  if (indicadores.length === 0) return null;

  const heading = (
    <h3 className="text-sm text-foreground">
      <span className="text-muted-foreground">{numero}.</span> {titulo}
    </h3>
  );

  const cards = indicadores.map((ind, index) => (
    <IndicatorCard
      key={`${ind.etiqueta}-${ind.fonte}-${ind.fecha}-${index}`}
      ind={ind}
    />
  ));

  if (collapsible) {
    return (
      <details open={defaultOpen} className="group space-y-2">
        <summary className="cursor-pointer list-none">{heading}</summary>
        <div className="space-y-2">{cards}</div>
      </details>
    );
  }

  return (
    <section className="space-y-2">
      {heading}
      {cards}
    </section>
  );
}
