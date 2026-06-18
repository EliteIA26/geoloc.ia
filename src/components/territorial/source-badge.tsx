import type { Confianza } from "@/lib/territorial";

const confidenceTones: Record<Confianza, string> = {
  oficial: "bg-emerald-50 text-emerald-800",
  observado: "bg-sky-50 text-sky-800",
  estimado: "bg-amber-50 text-amber-800",
  declarado: "bg-stone-100 text-stone-700",
};

type SourceBadgeProps = {
  fonte: string;
  fecha: string;
  confianza: Confianza;
  url?: string;
};

export default function SourceBadge({
  fonte,
  fecha,
  confianza,
  url,
}: SourceBadgeProps) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
      <span
        className={`rounded-full px-1.5 py-0.5 font-medium ${confidenceTones[confianza]}`}
      >
        {confianza}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${fonte} (abre en una nueva pestaña)`}
          className="rounded-sm underline decoration-current underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {fonte}
        </a>
      ) : (
        <span>{fonte}</span>
      )}
      <span aria-hidden="true">·</span>
      <span>{fecha}</span>
    </div>
  );
}
