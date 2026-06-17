# Camadas Satelitais (Incremento 2) — Design

- **Data:** 2026-06-16
- **Status:** Aprovado (design) — aguardando revisão do spec antes do plano
- **Branch:** `feat/satelital-inc2`
- **Repositório:** https://github.com/EliteIA26/geoloc.ia (público, deployado na Vercel)

---

## 1. Objetivo

Enriquecer o painel com três camadas satelitais reais, todas **snapshots por zona** (não província inteira), datadas e rotuladas:
1. **NDMI** (umidade da vegetação) sobre Aimogasta — novo sinal de umidade.
2. **Tendência de NDVI** sobre Aimogasta — a dimensão temporal que falta ("a vegetação melhorou/piorou vs. ~1 mês atrás?").
3. **Cobertura de neve na cordilheira (Sierra de Famatina)** — indicador de reserva hídrica de montanha (neve que derrete → rios → riego).

### Critério de sucesso
Vista Productor mostra NDMI + um badge de tendência real ("vegetación empeoró/mejoró X% vs. hace ~1 mes"); Vista Gestión mostra "Nieve en la cordillera (Famatina): X%". Tudo real (Sentinel-2), datado e honestamente rotulado como snapshot por zona. Build/lint/testes verdes.

---

## 2. Escopo

### Dentro (Incremento 2)
- NDMI sobre a cena Sentinel-2 de Aimogasta.
- Tendência de NDVI: 2ª cena (~4-6 semanas antes) sobre Aimogasta → delta vs. atual.
- Cobertura de neve: Sentinel-2 NDSI sobre bbox da Sierra de Famatina → % de neve.
- Pequenas adições de UI (editorial existente): sinal NDMI + badge de tendência no Productor e no detalhe de Arauco; indicador de neve no herói/sidebar da Gestión.

### Fora (fase 2)
- Tendência por departamento (exigiria ~18 pares de cena — pesado demais).
- Anomalia de neve vs. média histórica ("más/menos que lo normal") — precisa de série histórica.
- Níveis de represas / caudal de rios; integração de monitor nacional de seca.

---

## 3. Decisões de approach (fechadas no brainstorm)
- **Neve = Sentinel-2 NDSI** = (B03 − B11) / (B03 + B11), limiar `NDSI > 0.4` para classificar pixel como neve → % de cobertura no bbox. Reusa a infra do pipeline existente (download de bandas + reproject), só com bbox + bandas diferentes. (Alternativa MODIS descartada para manter consistência com o stack.)
- **Região da neve = Sierra de Famatina** (dentro da província; alimenta os vales irrigados de Chilecito/Famatina).
- **Tendência real só em Aimogasta/Arauco** (onde temos cenas reais). Department-wide trend = fase 2.
- **Snapshots datados** — neve sem baseline histórico (anomalia = fase 2).

---

## 4. Arquitetura

### Pipeline offline (Python; `.venv` já em cache)
- `scripts/ndvi_snapshot.py` — estender para:
  - Computar **NDMI** = (B08 − B11) / (B08 + B11) na cena atual de Aimogasta (baixar B11, reusar o reproject existente). Média da zona-núcleo do olival.
  - **Tendência:** buscar uma 2ª cena Sentinel-2 L2A sobre o mesmo bbox/tile (19JGK) com data ~4-6 semanas anterior e baixo nuvem; computar NDVI médio da zona; expor `{ actual, anterior, fechaAnterior }`.
- `scripts/snow_snapshot.py` (novo) — Sentinel-2 NDSI sobre um bbox da Sierra de Famatina: baixar B03 + B11, reprojetar, computar NDSI, % de pixels com NDSI>0.4; expor `{ cobertura, fecha, sceneId }`. (Pode reaproveitar funções de download/reproject de `ndvi_snapshot.py` — extrair helpers comuns se ficar limpo.)
- **Saída consolidada:** `public/data/satelital.json`:
```json
{
  "ndmiAimogasta": 0.18,
  "ndviTrend": { "actual": 0.50, "anterior": 0.46, "fechaAnterior": "2026-04-20" },
  "nieve": { "cobertura": 12, "fecha": "2026-06-10", "region": "Sierra de Famatina" }
}
```

### Lógica pura (TDD) — `src/lib/satelital.ts`
- `ndviTrend(actual: number, anterior: number)` → `{ delta: number; pct: number; label: "mejoró" | "empeoró" | "estable" }` (limiar de "estable" ~±3%).
- `snowCoverStatus(pct: number)` → `{ valor: string; nivel: "ok" | "atencion" | "alerta" }` (ex.: <5% alerta de baixa reserva; rótulos honestos).
- Loader zod `fetchSatelital()` para `satelital.json`.

### UI (adições pequenas ao editorial existente)
- `src/components/trend-badge.tsx` (novo) — badge ↑/↓/→ + "mejoró/empeoró X% vs. hace ~1 mes".
- **Productor:** TrendBadge na "mi finca" + NDMI como sinal no `SignalGrid`.
- **Gestión:** TrendBadge no detalhe de **Arauco** (onde a tendência é real); indicador **"Nieve en la cordillera"** no herói/sidebar (snapshot %, datado).
- Carregar `satelital.json` client-side com fallback gracioso (se ausente, omite as adições — sem erro).

### Segredos / runtime
Tudo offline → assets estáticos. Sem novo segredo, sem novo backend. (A `ANTHROPIC_API_KEY` do Inc 1 segue só no servidor.)

---

## 5. Honestidade & riscos

| Ponto | Tratamento |
|---|---|
| Cobertura limitada (snapshots por zona) | Rótulos explícitos: vegetação = Aimogasta; neve = Famatina; com data |
| Neve sem baseline | "captura DD/MM"; anomalia vs. normal = fase 2 |
| Nuvem na montanha | Pipeline escolhe a cena recente de menor nuvem; data pode ser mais antiga, rotulada |
| 2ª cena para trend (custo) | `.venv` em cache reduz custo; ~3 downloads de banda total |
| App não pode quebrar se asset faltar | `satelital.json` carregado com fallback; UI omite a peça ausente |

---

## 6. Testes
- **TDD** em `src/lib/satelital.ts` (`ndviTrend`, `snowCoverStatus`) + loader zod (sample, sem rede).
- Pipeline (`ndvi_snapshot.py`, `snow_snapshot.py`): offline; verificado rodando + inspeção dos valores/PNG (controller).
- UI: verificação por preview/DOM (controller).

---

## 7. Critério de aceitação
1. `satelital.json` gerado com NDMI real, par de NDVI (atual+anterior) real, e % de neve real de Famatina — todos datados.
2. Productor: NDMI no grid + TrendBadge ("vegetación mejoró/empeoró vs. hace ~1 mes").
3. Gestión: TrendBadge no detalhe de Arauco + indicador "Nieve en la cordillera (Famatina): X%".
4. Funções puras testadas; app não quebra se `satelital.json` faltar.
5. Build + lint + testes verdes; sem segredo no repo.
