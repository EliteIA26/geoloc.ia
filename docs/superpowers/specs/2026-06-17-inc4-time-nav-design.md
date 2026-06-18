# Incremento 4 — Navegação temporal + estrés hídrico fluido — Design

- **Data:** 2026-06-17
- **Status:** Aprovado (design) — aguardando revisão do spec antes do plano
- **Branch:** `feat/inc4-time-nav`
- **Repositório:** https://github.com/EliteIA26/geoloc.ia (público, deployado na Vercel)

---

## 1. Objetivo
Três melhorias:
1. **Navegar pelos dias** das cenas Sentinel-2 de Aimogasta — ver o NDVI de 24/mai (limpo), 03/jun, 10/jun, etc. (seletor de datas).
2. **Estrés hídrico fluido:** o toggle "Estrés hídrico" passa a mostrar um raster contínuo (mesmo fade do "Salud vegetación"), via índice de humedad do MODIS.
3. **Afrouxar o filtro de nuvem** (<10% → ≤60%) pra habilitar mais datas.

### Critério de sucesso
Na Vista Productor há um seletor de datas (chips) das últimas ~6 cenas de Aimogasta; clicar troca o raster NDVI e mostra a data + % de nuvem. O toggle "Estrés hídrico" da Gestión mostra um raster fluido de humedad. Cenas nubladas são rotuladas honestamente. Build/lint/testes verdes; cron continua leve (incremental).

---

## 2. Escopo (dentro)
- Pipeline `ndvi_snapshot.py`: janela das últimas ~6 cenas de Aimogasta (nuvem ≤60%), **incremental** (baixa só datas novas), manifesto `aimogasta-series.json`.
- UI: seletor de datas (chips) na Productor que troca o raster + label + badge de nuvem.
- Pipeline `modis_ndvi.py`: +índice de humedad province-wide → `larioja-ndwi.png` + média por depto.
- UI: toggle "Estrés hídrico" mostra o raster de humedad fluido.
- Cloud relax ≤60%.

## Fora (fase 2)
- Navegação temporal do mapa MODIS da província (composto 16 dias, poucas datas).
- Tiles dinâmicos / qualquer-data via WMS (Sentinel Hub/Titiler).

---

## 3. Decisões técnicas

### Multi-data Aimogasta (`ndvi_snapshot.py`)
- Buscar as últimas N=6 cenas Sentinel-2 L2A sobre o bbox de Aimogasta (tile 19JGK), **nuvem ≤60%**, desc por data.
- Para cada cena **ainda não no manifesto**: computar NDVI (mesma lógica/offset BOA), salvar `public/raster/aimogasta-ndvi-<fecha>.png` (PNG pequeno, ~30KB). **Não rebaixar** cenas já existentes (incremental).
- Manifesto `public/data/aimogasta-series.json`:
```json
{ "escenas": [ { "fecha": "2026-05-24", "nubes": 6.7, "png": "aimogasta-ndvi-2026-05-24.png", "coordinates": [[W,N],[E,N],[E,S],[W,S]] }, ... ] }
```
  (newest first; manter top 6; podar PNGs de datas que saíram da janela.)
- Compat: a entrada `escenas[0]` (mais recente) é a default; a Gestión passa a ler o manifesto (a `escenas[0]`) em vez de `aimogasta-ndvi.png`/`-bounds.json`. (Pode manter os arquivos antigos como alias da mais recente pra não quebrar nada durante a transição, ou migrar ambos — decidir no plano; preferir migrar ambos pro manifesto.)

### Estrés hídrico fluido (`modis_ndvi.py`)
- Índice de humedad = (NIR − MIR) / (NIR + MIR) das bandas MODIS 13Q1 `250m_16_days_NIR_reflectance` e `250m_16_days_MIR_reflectance` (**confirmar nomes/escala na STAC antes de codar**; escala 0.0001).
- Saída: `public/raster/larioja-ndwi.png` (mesma rampa/colorização contínua) + média zonal por depto em `provincia-ndvi.json` como chave `deptosNdwi` (ao lado de `deptos`).

### UI
- **`src/components/scene-picker.tsx` (novo):** chips de data (fecha curta + badge "X% nubes"; nublado = tom de aviso) a partir de `aimogasta-series.json`; `selected`/`onSelect`.
- **Productor:** monta o ScenePicker; `selectedFecha` em estado (default escenas[0]); um efeito troca o raster da finca via `map.getSource("finca-ndvi").updateImage({ url, coordinates })` ao mudar a data; o label/“captura” reflete a data + nuvem selecionada.
- **Gestión:** o toggle "Estrés hídrico" → mostra `larioja-ndwi.png` (raster fluido) em vez do flat `dep-ndwi`; "Salud vegetación" → `larioja-ndvi.png`. Legenda já é layer-aware (rótulos NDWI). A Gestión também usa `escenas[0]` pro overlay de Aimogasta.
- **Lib:** `fetchAimogastaSeries()` + schema zod em `satelital.ts` (TDD); estender `ProvinciaNdvi`/loader p/ `deptosNdwi` opcional.

### Cloud relax
`MAX_CLOUD = 60` em `ndvi_snapshot.py` (multi-data). O snow/MODIS seguem seus próprios limiares.

---

## 4. Honestidade & riscos
| Ponto | Tratamento |
|---|---|
| Cenas nubladas têm artefatos (nuvem no NDVI) | Badge "X% nubes" por data; 24/mai (6,7%) segue a mais limpa |
| Cron mais pesado (várias cenas) | Incremental: baixa só datas novas; poda a janela |
| Git-bloat | PNGs de Aimogasta são minúsculos (~30KB); janela de 6 = ~180KB |
| MODIS NDWI asset/escala | Confirmar na STAC antes de codar |
| Navegação só Aimogasta | Província MODIS = composto 16d; navegação dela = fase 2 (rotulado) |
| Trocar raster sem recriar layer | `ImageSource.updateImage` (API MapLibre v5 — confirmar) |

---

## 5. Testes
- **TDD:** `AimogastaSerieSchema` + `fetchAimogastaSeries` (zod, sample sem rede); `deptosNdwi` opcional no ProvinciaNdvi.
- Pipelines (ndvi_snapshot multi-data, modis_ndvi humedad): offline, verificado rodando + inspeção (controller).
- UI (scene-picker, swap de raster, toggle humedad): preview/DOM (controller).

## 6. Critério de aceitação
1. `aimogasta-series.json` com ~6 datas reais (≤60% nuvem) + PNGs; pipeline incremental.
2. Productor: chips de data trocam o raster + label + badge de nuvem.
3. Gestión: "Estrés hídrico" mostra raster fluido de humedad; "Salud" mostra NDVI fluido.
4. App não quebra se manifesto/raster faltar (graceful).
5. Build + lint + testes verdes; sem segredo no repo.
