# Incremento 3 — Auto-update + cores fluidas (MODIS) + polish — Design

- **Data:** 2026-06-17
- **Status:** Aprovado (design) — aguardando revisão do spec antes do plano
- **Branch:** `feat/inc3-modis-cron-polish`
- **Repositório:** https://github.com/EliteIA26/geoloc.ia (público, deployado na Vercel)

---

## 1. Objetivo
Cinco melhorias pedidas pelo usuário:
1. **Atualização automática** da imagem de satélite (cron) — hoje é um snapshot manual de ~1 mês atrás.
2. **Cores fluidas** no mapa da Gestión (fade real por pixel dentro de cada departamento, mantendo as demarcações) — via MODIS, que também torna **todos os 18 deptos com dado real** (resolve o "só 1 satelital").
3. **Fix do chat:** a IA devolve markdown (`**...**`) que aparece cru.
4. **Design** do balão de recomendação (está um blocão).
5. **Sidebar redimensionável** (arrastar pra alargar/estreitar).

### Critério de sucesso
O mapa da Gestión mostra um gradiente NDVI contínuo (fade) clipado à província com as bordas dos 18 deptos por cima; todos os deptos exibem NDVI real (média MODIS). A recomendação da IA aparece em texto limpo (sem asteriscos), enxuta e bem diagramada. A sidebar arrasta pra redimensionar. Um cron mantém as imagens atualizadas sozinho. Build/lint/testes verdes.

---

## 2. Escopo (dentro)
- GitHub Action agendada que roda o pipeline e commita assets quando mudam.
- `scripts/modis_ndvi.py`: NDVI MODIS province-wide → raster fluido (PNG) + médias zonais por depto.
- UI Gestión: raster fluido + bordas + camada clicável; cards/detalhe com NDVI real (MODIS) p/ todos os deptos.
- ai-narrative: prompts em texto plano + `stripMarkdown` defensivo.
- Redesign do balão de recomendação.
- Sidebar redimensionável (2 vistas).

## Fora (fase 2)
- Mosaico Sentinel-2 alta-res province-wide (pesado).
- Tiles dinâmicos / WMS ao vivo (Sentinel Hub / Titiler).
- Anomalia vs. histórico, represas.

---

## 3. Decisões técnicas

### Cron (GitHub Action)
- `.github/workflows/satelital.yml`: `schedule: cron diário` (+ `workflow_dispatch` manual). Runner Ubuntu: setup Python, `pip install` (rasterio, pystac-client, planetary-computer, numpy, pillow, requests), roda `ndvi_snapshot.py`, `snow_snapshot.py`, `modis_ndvi.py`. Depois: `git add public/ ; git commit` **só se houver diff** (`git diff --quiet || git commit ...`), `git push`. O push na main dispara o redeploy da Vercel.
- Sem segredo: Planetary Computer assina anônimo; o push usa o `GITHUB_TOKEN` padrão do Action.
- **Caveat git-bloat:** commit só-quando-muda atenua; long-term mover rasters p/ storage (fase 2). Aceitável p/ demo.

### MODIS NDVI province-wide (`scripts/modis_ndvi.py`)
- Fonte: Planetary Computer, coleção MODIS NDVI 16-day 250m. **Confirmar na doc/STAC o id exato da coleção (`modis-13Q1-061`), o nome do asset de NDVI e o fator de escala (×0.0001) antes de codar** — não confiar na memória.
- Recorte: bbox de La Rioja `[-69.6, -32.0, -65.4, -27.7]` (derivado dos limites). Reprojeta/clipa p/ EPSG:4326 (reusar helpers de `s2_common.py`).
- Saídas:
  - `public/raster/larioja-ndvi.png` (RGBA colorizado, mesma rampa NDVI; transparente fora de dado) + `larioja-ndvi-bounds.json` (coordinates [TL,TR,BR,BL] + `captura`).
  - `public/data/provincia-ndvi.json`: `{ fecha, deptos: { "<nombre>": <ndviMedio>, ... } }` — média zonal por departamento (rasterizar cada polígono de `departamentos.geojson` contra o grid MODIS via `rasterio.features.geometry_mask`; fallback: amostrar no centroide).
- Honesto: 250m, composto 16 dias → mapa provincial atualiza ~quinzenal; rótulo com a data.

### UI Gestión (mapa fluido)
- Em `handleReady`: adicionar source `image` com `larioja-ndvi.png` (sob as bordas). **Remover/transparentar** o fill chapado `dep-ndvi`/`dep-ndwi` — manter `dep-borders` + `dep-highlight` + uma camada `fill` quase-transparente (opacity ~0.01) só pra capturar clique/hover. (Toggle NDVI/NDWI: na v3, o NDWI por-depto pode sumir ou virar overlay simples; manter NDVI como o mapa fluido. Decidir no plano: simplificar pra "NDVI fluido" + manter o toggle só se o NDWI tiver raster; senão, esconder o toggle de NDWI.)
- Carregar `provincia-ndvi.json`; usar a média real por depto nos cards/`DepartmentDetail`, marcando **fuente "satelital"** pra todos. Atualizar `aggregate-indicators` p/ ler do provincia-ndvi (com fallback ao `departamentos.geojson` se ausente).
- Legenda permanece.

### Chat (markdown + escrita)
- `ai-narrative.ts`: nos dois system prompts, acrescentar "Responde en **texto plano**: sin markdown, sin asteriscos (*), sin almohadillas (#), sin viñetas. Máximo 2-3 frases." Adicionar `stripMarkdown(s)` puro (remove `*`, `_`, `#`, backticks; colapsa espaços) aplicado à narrativa **e** ao resumen territorial antes de retornar. (TDD em `stripMarkdown`.)

### Design do balão de recomendação (`InsightHero`)
- Reduzir o `titulo` de 20px → ~16px com `leading-relaxed`, p/ recomendações de 2-3 frases caberem elegantes (não um blocão). Manter eyebrow/chips/footer. Ajuste de espaçamento. (Puramente visual.)

### Sidebar redimensionável
- Hook `useResizableWidth(key, initial, min, max)` (estado + persist em localStorage) + uma alça `<div>` arrastável na borda esquerda da `<aside>`. Aplicar nas asides de Gestión e Productor. min 300 / max 560 / default 320px.

---

## 4. Honestidade & riscos
| Ponto | Tratamento |
|---|---|
| "Diária" impossível | Cron checa diário; imagem nova ~5d (Aimogasta) / ~16d (MODIS província). Rótulos com data |
| MODIS grosseiro (250m) | Ótimo p/ visão provincial fluida; detalhe fino segue Sentinel-2 Aimogasta. Rotulado |
| git-bloat de rasters | Commit só-quando-muda; storage = fase 2 |
| MODIS API (id/escala) | Confirmar coleção/asset/escala na STAC antes de codar |
| Cron quebrar silenciosamente | `workflow_dispatch` p/ rodar manual; logs no Actions |

---

## 5. Testes
- **TDD:** `stripMarkdown` (asteriscos/headings/bullets → limpo); zonal-mean helper se for TS (mas é Python → verificado rodando).
- Pipeline (modis_ndvi.py): offline, verificado rodando + inspeção (controller).
- UI (mapa fluido, chat, sidebar): preview/DOM (controller).
- Cron: `workflow_dispatch` manual + checar o run no Actions (controller/usuário).

## 6. Critério de aceitação
1. `.github/workflows/satelital.yml` roda o pipeline e commita-se-mudou (testável via dispatch manual).
2. Gestión: raster NDVI fluido (fade) + bordas dos 18 deptos + clique funcionando; cards com NDVI real MODIS (todos "satelital").
3. Recomendação IA em texto plano, enxuta, bem diagramada.
4. Sidebar arrasta (mín/máx, persiste).
5. Build + lint + testes verdes; sem segredo no repo.
