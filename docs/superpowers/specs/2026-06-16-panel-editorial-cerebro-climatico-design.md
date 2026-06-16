# Panel Editorial + Cérebro Climático — Design (Incremento 1)

- **Data:** 2026-06-16
- **Status:** Aprovado (design) — aguardando revisão do spec antes do plano
- **Branch:** `feat/panel-editorial-v1`
- **Repositório:** https://github.com/EliteIA26/geoloc.ia (público, deployado na Vercel)

---

## 1. Objetivo

Tirar o painel da cara "sistema 2009" e da pobreza de informação. Dois movimentos juntos:
1. **Mastigar o dado** — toda tela abre com uma frase em espanhol claro (insight-first); o índice cru (NDVI etc.) vira *evidência secundária*, não protagonista.
2. **Enriquecer** — de ~2 sinais para **~9 sinais reais**, a maioria saindo do Open-Meteo (fonte gratuita que já chamamos), sintetizados por IA.

Vale para as **duas vistas**: Gestión (governo) e Productor (finca).

### Critério de sucesso
As duas vistas abrem com uma frase que qualquer pessoa não-técnica entende, sintetizando ~9 sinais reais. O número cru aparece como evidência discreta, não como protagonista. Visual editorial (conforme mockup aprovado). Funciona e fica atual mesmo se a IA cair (fallback por regra). Gestión entrega resumen territorial; Productor entrega recomendação da finca.

---

## 2. Escopo

### Dentro (Incremento 1)
- Redesign editorial (insight-first, linguagem mastigada, tokens novos) nas **2 vistas**.
- **Sinais do Open-Meteo** (ao vivo, fonte já usada): clima 7d, helada/calor, balance hídrico, **humedad de suelo**, **déficit de lluvia acumulado**, **viento + ventana de aplicación**, **riesgo de incendio**, **grados-día (GDD)**.
- **NDMI** (umidade da vegetação) sobre a cena Sentinel-2 de Aimogasta **que já temos** (extensão barata do pipeline).
- **Resumen de gestión territorial por IA** (Gestión) + recomendação por finca (Productor), aterrados nos sinais.

### Fora (Incremento 2 / fase 2)
- Tendência de NDVI (exige 2ª captura Sentinel-2) e cobertura de neve na cordilheira — **Incremento 2**.
- Anomalia vs. média histórica ("peor que lo normal"), níveis de represas, monitor nacional de seca — **fase 2** (precisam de histórico/integração).
- Auth, multi-tenant, app mobile.

---

## 3. Modelo de informação (o que cada vista entrega)

Agrupado em 4 temas + a coroa. Todos os sinais são **reais**; os limiares por cultivo são defaults de demo.

| Tema | Sinais | Fonte | Novo? |
|---|---|---|---|
| Salud del cultivo | NDVI · NDMI (umidade vegetação) | Sentinel-2 (cena Aimogasta) | NDMI novo |
| Agua | balance hídrico (ET₀−lluvia) · humedad de suelo · déficit de lluvia 30d | Open-Meteo | suelo + déficit novos |
| Clima 7d | temp/lluvia · helada · calor · viento · ventana de aplicación | Open-Meteo | viento/ventana novos |
| Riesgos | riesgo de incendio · sequía sostenida · GDD (estágio) | Open-Meteo | incendio + GDD novos |
| 👑 Coroa | **resumen IA** (territorial p/ governo, finca p/ produtor) | IA aterrada | — |

Princípio de apresentação: **cérebro rico, cara calma.** Ingerimos todos os sinais; a tela mostra o resumen + camadas que se expandem. Nunca um paredão de números (o erro do Copernicus).

---

## 4. Arquitetura

### Dados / lógica
- `src/lib/open-meteo.ts` — estende `fetchForecast` para trazer também vento (`windspeed_10m_max`, `windgusts_10m_max`), e os campos para humedad de suelo e humidade relativa. **Nota:** soil moisture e humidade são horários no Open-Meteo, não diários — agregar para diário (ex.: média de soil moisture, mínima de humidade) ou usar o bloco `current`. Confirmar os nomes exatos dos campos na doc oficial antes de codar. Tipos: estender `Forecast` com os novos campos por dia + um resumo agregado (`ClimaResumen`).
- `src/lib/agroclimate.ts` — novas funções **puras (TDD):**
  - `fireRisk(tmaxC, windMax, humedadMin, lluvia7)` → Riesgo|null (calor + vento + seco).
  - `soilMoistureStatus(fraccion)` → nível + label.
  - `growingDegreeDays(tmin[], tmax[], base)` → número acumulado + label de estágio.
  - `applicationWindow(windByDay[])` → dias bons para aplicar/regar.
  - `rainDeficit(precip30, normalRef)` → déficit + nível.
  - (mantém `frostRisk`/`heatRisk`/`waterDeficitRisk`/`ruleBasedRecommendation`.)
- `src/lib/ai-narrative.ts` — estende o prompt aterrado para o conjunto rico de sinais (produtor); novo `buildTerritorialPrompt(deps, riesgosPorDep)` para o resumen de gestión. Mantém cache + fallback.

### Rotas
- `src/app/api/pronostico/route.ts` — estende a resposta com os sinais ricos (por finca).
- **`src/app/api/resumen-territorial/route.ts` (novo)** — busca previsão por centroide dos 18 departamentos (em paralelo, `fetch` com `next: { revalidate: 10800 }`), computa riscos por departamento, e gera o resumen territorial por IA. Retorna `{ resumen, fuenteIA, señales: [...], deptosEnRiesgo: [...], actualizado }`. Lê `ANTHROPIC_API_KEY` no servidor.

### Pipeline offline
- `scripts/ndvi_snapshot.py` — além do NDVI, computar **NDMI** = (B8A−B11)/(B8A+B11) (ou B8/B11) sobre a mesma cena de Aimogasta; gravar valor por finca em `series-ndvi.json`/um JSON de sinais, ou um 2º raster. Reaproveita a cena já baixada.

### UI (redesign editorial — as 2 vistas)
- Tokens editoriais novos em `globals.css` (paleta calma, escala tipográfica, respiro) — mantendo compatibilidade com o existente.
- Novos componentes:
  - `src/components/insight-hero.tsx` — o card herói (resumen IA + sinais-chave em chips + "qué hacer").
  - `src/components/signal-grid.tsx` / `signal-row.tsx` — sinais digeridos (label claro + valor cru discreto).
- Restyle: `department-detail.tsx`, `aggregate-indicators.tsx` (lista), `forecast-panel.tsx`, `producer-view.tsx`, header em `panel/page.tsx` — para a linguagem editorial e o modelo insight-first.
- Gestión monta `InsightHero` com o resumen territorial; Productor monta `InsightHero` com a recomendação da finca + `SignalGrid`.

### Segredos
`ANTHROPIC_API_KEY` só no servidor (já configurada na Vercel pelo usuário). Nunca commitada (repo público).

---

## 5. Honestidade & riscos

| Ponto | Tratamento |
|---|---|
| Resumen territorial = 18 chamadas Open-Meteo | Paralelas + cache ~3h; ok no free tier. Se uma falhar, segue com as demais |
| NDVI por depto ainda é "referencia" (só Arauco satelital) | O resumen e os cards deixam claro o que é medido vs. referência |
| Limiares (incendio/helada/GDD/suelo) | Defaults de demo, rotulados; calibração = fase 2 (INTA) |
| IA pode cair | Núcleo (sinais + recomendação por regra) independente; fallback sempre |
| Soil moisture/humidade são horários no Open-Meteo | Agregação documentada em `open-meteo.ts`; funções de sinal recebem valores já agregados (puras/testáveis) |
| Tela virar paredão de números | Insight-first; sinais agrupados e expansíveis; resumen é o protagonista |

---

## 6. Testes
- **TDD** em todas as novas funções puras de `agroclimate.ts` (limiares de incendio, soil moisture, GDD, ventana, déficit) + parser estendido de `open-meteo.ts` (sem rede).
- Rotas (`/api/pronostico`, `/api/resumen-territorial`) e IA: verificação ao vivo (curl + preview) pelo controller — o núcleo funciona sem chave (fallback) e com dado real do Open-Meteo.
- UI: verificação visual por preview/screenshot.

---

## 7. Critério de aceitação (resumo)
1. As 2 vistas abrem com frase-insight clara sintetizando ~9 sinais reais.
2. Índice cru demovido a evidência discreta; linguagem mastigada por departamento/finca.
3. Visual editorial conforme mockup aprovado.
4. Resumen territorial (Gestión) e recomendação de finca (Productor) por IA, aterrados, com fallback.
5. Sinais novos (incendio, humedad suelo, GDD, viento, déficit, NDMI) reais e rotulados.
6. Build limpo, testes verdes, sem segredo no repo.
