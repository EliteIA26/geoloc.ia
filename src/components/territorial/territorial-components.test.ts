import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Confianza, Indicador } from "@/lib/territorial";
import BriefingChapter from "./briefing-chapter";
import IndicatorCard from "./indicator-card";
import SourceBadge from "./source-badge";

const indicator: Indicador = {
  etiqueta: "Población 2022",
  valor: "2.500 habitantes",
  fonte: "INDEC Censo 2022",
  fecha: "2022",
  confianza: "oficial",
};

function visibleText(markup: string) {
  return markup.replace(/<[^>]+>/g, "");
}

describe("SourceBadge", () => {
  const confidenceTones: Array<[Confianza, string]> = [
    ["oficial", "bg-emerald-50 text-emerald-800"],
    ["observado", "bg-sky-50 text-sky-800"],
    ["estimado", "bg-amber-50 text-amber-800"],
    ["declarado", "bg-stone-100 text-stone-700"],
  ];

  it.each(confidenceTones)(
    "renders visible provenance with the %s confidence tone",
    (confianza, tone) => {
      const markup = renderToStaticMarkup(
        createElement(SourceBadge, {
          fonte: "Secretaría de Agricultura",
          fecha: "2026-05-24",
          confianza,
        }),
      );

      expect(markup).toContain(`class="rounded-full px-1.5 py-0.5 font-medium ${tone}"`);
      expect(markup).toContain(`>${confianza}</span>`);
      expect(markup).toContain("Secretaría de Agricultura");
      expect(markup).toContain("2026-05-24");
      expect(markup).toContain('aria-hidden="true"');
    },
  );
});

describe("IndicatorCard", () => {
  it("renders the indicator and its optional note", () => {
    const markup = renderToStaticMarkup(
      createElement(IndicatorCard, {
        ind: { ...indicator, nota: "Variación intercensal" },
      }),
    );

    expect(markup).toContain(
      '<div class="text-[11px] text-muted-foreground">Población 2022</div>',
    );
    expect(markup).toContain(
      '<div class="text-sm text-[var(--foreground)]">2.500 habitantes</div>',
    );
    expect(markup).toContain(
      '<div class="text-[11px] text-muted-foreground">Variación intercensal</div>',
    );
    expect(markup).toContain("INDEC Censo 2022");
  });

  it("omits note markup when the indicator has no note", () => {
    const markup = renderToStaticMarkup(createElement(IndicatorCard, { ind: indicator }));

    expect(markup).not.toContain("Variación intercensal");
    expect(markup).not.toContain("<p");
  });
});

describe("BriefingChapter", () => {
  it("renders nothing when there are no indicators", () => {
    const markup = renderToStaticMarkup(
      createElement(BriefingChapter, {
        numero: 1,
        titulo: "Contexto territorial",
        indicadores: [],
      }),
    );

    expect(markup).toBe("");
  });

  it("renders its numbered title and indicator cards", () => {
    const markup = renderToStaticMarkup(
      createElement(BriefingChapter, {
        numero: 2,
        titulo: "Lectura satelital",
        indicadores: [indicator],
      }),
    );

    expect(visibleText(markup)).toContain("2. Lectura satelital");
    expect(markup).toContain("Población 2022");
  });
});
