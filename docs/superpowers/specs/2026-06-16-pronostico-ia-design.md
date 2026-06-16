# Pronóstico IA — Design (v1)

- **Data:** 2026-06-16
- **Status:** Aprovado (design) — aguardando revisão do spec antes do plano
- **Branch:** `feat/pronostico-ia`
- **Repositório:** https://github.com/EliteIA26/geoloc.ia (projeto separado, público)

---

## 1. Objetivo

Transformar o painel de **descritivo/reativo** (NDVI = foto do passado) em **proativo**: na Vista Productor, a "mi finca" ganha uma **previsão de 7 dias + recomendação acionável** ("regá antes del miércoles; helada leve el jueves"). É o recurso que faz o painel *ajudar de verdade* o produtor, e o maior "wow" de pitch ("IA que prevé y recomienda").

### Critério de sucesso
O produtor seleciona a finca → vê previsão de 7 dias **atual**, selos de risco (helada / déficit hídrico / calor) e uma recomendação clara em linguagem simples. **Funciona e fica atual mesmo se a IA cair** (degrada para recomendação por regra). Fonte e hora de atualização sempre visíveis.

---

## 2. Princípio (honestidade)

A "IA" **não adivinha o clima**. O sistema combina três coisas:
1. **Previsão meteorológica real** — Open-Meteo (gratuito, sem chave, global, diário).
2. **Modelos agroclimáticos** — funções puras que derivam risco dos números.
3. **IA (Claude)** — camada de *narrativa*: transforma números + riscos em recomendação localizada em linguagem natural.

**Os modelos decidem o risco; a IA narra.** Rejeitada a alternativa de deixar a IA "raciocinar o risco" sozinha (sujeita a alucinação, não-testável). A IA é **aterrada**: recebe os números reais no prompt e é instruída a usar só esses dados — nunca inventar temperatura/data.

**Resiliência:** o núcleo (previsão + risco + recomendação por regra) não depende da IA. Se a chamada à IA falhar/atrasar, retorna a recomendação por regra. O painel nunca fica sem resposta nem desatualizado.

---

## 3. Riscos modelados (v1)

Os três que mais importam em La Rioja (clima árido):
- **Déficit hídrico / necessidade de rega** — balanço entre ET₀ (evapotranspiração de referência) acumulada e chuva prevista, modulado pelo NDVI atual da finca.
- **Helada** — temperatura mínima diária prevista abaixo do limiar do cultivo.
- **Estresse térmico / ola de calor** — temperatura máxima diária prevista acima do limiar.

Cada risco vira um objeto `{ tipo, dia, nivel: "bajo"|"medio"|"alto", detalle }` → renderizado como selo.

> Limiares por cultivo (olivo/vid) são **defaults de demo** e precisam de calibração agronômica (idealmente com o INTA). Documentado no código.

---

## 4. Arquitetura (primeiro backend do geoloc.ia)

```
ProducerView (lat/lon do centroide da "mi finca", crop)
   └─ GET /api/pronostico?lat&lon&crop
        ├─ open-meteo.ts: fetch AO VIVO (cache ~3h via Next revalidate) + zod-parse → Forecast (7 dias)
        ├─ agroclimate.ts (funções PURAS, testáveis): riscos + recomendación por regra
        └─ ai-narrative.ts: prompt aterrado + Claude (AI SDK) → narrativa; cache; fallback p/ regra
   ← JSON { dias[], riesgos[], recomendacion, fuenteIA: boolean, actualizado: ISO }
   └─ ForecastPanel renderiza
```

### Arquivos
- `src/lib/open-meteo.ts` — `fetchForecast(lat, lon)`: chama a forecast API do Open-Meteo (daily: `temperature_2m_min`/`max`, `precipitation_sum`, `et0_fao_evapotranspiration`), valida com zod, retorna `Forecast` tipado. Server-usable.
- `src/lib/agroclimate.ts` — funções puras (**TDD**): `frostRisk(minTemps, crop)`, `waterDeficitRisk(et0[], precip[], ndvi)`, `heatRisk(maxTemps, crop)`, e `ruleBasedRecommendation(risks)` → string. Limiares por cultivo num mapa de config.
- `src/lib/ai-narrative.ts` — server-only: monta o prompt aterrado (números + riscos), chama Claude via AI SDK; retorna `string | null` (null em erro/timeout). Modelo rápido/barato (Claude Haiku).
- `src/app/api/pronostico/route.ts` — Route Handler que orquestra os três acima e devolve o JSON. Lê `process.env.ANTHROPIC_API_KEY` (server). Cache da resposta (Next revalidate). Timeout curto na IA com fallback.
- `src/components/forecast-panel.tsx` — client: faz fetch de `/api/pronostico`, renderiza chips diários + selos de risco + recomendação + rodapé de fonte/atualização. Estados de loading/erro.
- Modificar `src/components/producer-view.tsx` — montar `<ForecastPanel>` com o centroide da "mi finca".

### Dependências novas
`ai` + `@ai-sdk/anthropic`. (APIs do AI SDK confirmadas na doc oficial antes de codar — versão muda rápido.)

### Segurança / segredos
- `ANTHROPIC_API_KEY` **só no servidor**, via env var (Vercel) + `.env.local` local (já no `.gitignore`). **Nunca** no cliente, nunca commitada. Repo é público.
- A rota não expõe a chave; o cliente só vê o JSON de resultado.

---

## 5. UI (na "mi finca", Vista Productor)

Painel "Pronóstico 7 días":
- **Linha de chips diários:** dia (abreviado), ícone, mín/máx °C, chuva mm.
- **Selos de risco:** aparecem só quando disparam ("Helada · jue · alto", "Déficit hídrico · esta semana · medio").
- **Recomendação:** bloco de texto da IA ("Esta semana: ..."), ou a recomendação por regra se a IA caiu (sem alarde).
- **Rodapé:** "Clima: Open-Meteo · análisis: IA · actualizado [hora]". Se `fuenteIA===false`, omite "IA" e mostra "recomendación automática".

---

## 6. Testes
- **TDD** em `agroclimate.ts`: limiares de helada/déficit/calor e a recomendação por regra (vitest, funções puras).
- `open-meteo.ts`: teste do parser zod com um payload de exemplo (não bate na rede no teste).
- Rota + integração IA: verificadas por preview/manual (não unit).

---

## 7. Fora de escopo (YAGNI — v2+)
- Pronóstico por departamento na Vista Gestión (mesma engine, fase 2).
- Calibração agronômica fina por cultivo / multi-cultivo.
- Histórico e acurácia do pronóstico ao longo do tempo.
- Alertas push / notificações.
- Auth, multi-tenant, app mobile.

---

## 8. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| IA cai/atrasa no pitch | Núcleo ao vivo independente + fallback por regra; timeout curto |
| Previsão desatualizada | Open-Meteo ao vivo (cache só ~3h); rodapé com hora |
| IA alucina números | Prompt aterrado nos dados reais; instrução de usar só o fornecido |
| Chave vazar (repo público) | Só server-side, env var, nunca commitada |
| Limiares errados por cultivo | Rotulados como defaults de demo; calibração com INTA na fase 2 |
| Custo da IA | Modelo barato (Haiku) + cache da narrativa |
