# F0 Territorial — Briefing 3D de Vinchina (Valle del Bermejo)

**Data:** 2026-06-18 · **Status:** Design aprovado (brainstorming) · **Repo:** geoloc.ia

## 1. Contexto e propósito

Federico (gerente FOGAPLAR) pediu, além do agro, um observatório territorial-produtivo do **Valle del Bermejo** para subsidiar um *plan productivo* a apresentar a futuras autoridades. Audiência **B2G**: planejadores, autoridades, Ministerio — não o produtor individual. Ênfase explícita dele: **Vinchina** e a **conexão com o Chile**; e a dor de a província não ter informação produtiva atualizada ("casi online").

Este é um **demo apresentável** (o "video/hito" que ele pediu) — não a plataforma completa. **Posicionamento-chave:** *atualizar o diagnóstico do POT 2015 do Valle del Bermejo (oficial, horizonte 2020, vencido) com Censo 2022 + observação satelital atual.*

## 2. Escopo

- **Território:** Vinchina em profundidade (o depto citado pelo Federico). Os outros 2 da Região I (Gral. Lamadrid, Cnel. Felipe Varela) aparecem no mapa como **contexto**.
- **Abordagem:** A — Briefing 3D (mapa 3D + briefing "mastigado" em arco).
- **Reúsa** o stack atual: Next 16, MapLibre/`MapShell`, UI premium/glass, pipeline Sentinel-2.

### Não-objetivos (F0)
Mapa de atores, score de "potencial", cadastro de produtores, identificação de cultivo específico, dados em tempo real. Excluídos por honestidade/credibilidade — dependem de validação local do Federico ou são fase 2.

## 3. Arquitetura

- **Rota dedicada** `/bermejo` (client component, mesmo padrão do `/panel-premium`) — entrada limpa para apresentar, sem o painel agrícola junto.
- `src/lib/territorial.ts` — schemas Zod + loaders (espelha `satelital.ts`); degradação graciosa se um arquivo faltar.
- **Dados:**
  - `public/data/territorial-vinchina.json` — indicadores curados (Censo 2022, CEP XXI), cada um com `fonte`, `fecha`, `confianza`.
  - `public/data/bermejo-deptos.geojson` — os 3 deptos (de IGN; reutiliza/filtra o que já temos).
  - `public/data/vinchina-localidades.geojson` — Vinchina, Jagüé.
  - `public/data/corredor-pircas-negras.geojson` — RN76 → Paso Pircas Negras (IGN red vial).
  - `public/raster/vinchina-ndvi.png` (+ `-bounds.json`) — Sentinel-2, gerado pela Action.
- Reúsa `MapShell`, `ResizableAside`, componentes de selo/sinal do premium.

## 4. Telas

Uma tela, dois painéis:

- **Mapa 3D (centro):** os 3 deptos visíveis, **Vinchina destacada**, e o **corredor RN76 → Pircas Negras** traçado até a fronteira com o Chile. Reusa o voo 3D/órbita ao focar Vinchina.
- **Briefing (aside) — arco de 3 capítulos (rolagem):**
  1. **Contexto** ("o que é Vinchina"): população 2010/2022 + variação **−1,2%**, atividade econômica, emprego formal por setor.
  2. **Satélite (o "aha"):** *"área com vegetação ativa observada: X–Y ha, confiança média"* + NDVI/NDMI (vigor/umidade). O que a província não tem atualizado.
  3. **Chile:** corredor a Pircas Negras — distância, status **"incipiente"** (citação do POT), o que habilita.
- **Cada indicador** carrega selo **fonte · data · confiança**. Cabeçalho enquadra como *"atualização do diagnóstico do POT 2015"*.

## 5. Dados, fontes e regras de honestidade

Classificação (selo em cada indicador): **oficial / observado / estimado / declarado**.

| Camada | Fonte | Data | Confiança |
|---|---|---|---|
| População 2010/2022, variação, atividade econômica | INDEC Censo 2022 | 2022 | oficial |
| Emprego formal por setor | CEP XXI | recente | oficial (rotular "formal") |
| Área com vegetação ativa (ha ± faixa) | Sentinel-2 (NDVI>limiar) | ~mensal | observado/estimado |
| NDVI / NDMI (vigor / umidade) | Sentinel-2 | ~mensal | observado |
| RN76 / Pircas Negras / distância | IGN + POT 2015 | atual / 2015 | oficial |

**Regras (inegociáveis):**
- O satélite mede **"vegetação ativa observada"** — pode ser cultivo **ou** vegetação natural. **NUNCA** afirmar "X ha de [cultivo]"; o rótulo deixa claro que distinguir cultivo exige validação local.
- Estimativas **sempre** com faixa + nível de confiança; nunca número único "exato".
- Corredor Chile: status **"incipiente"** (POT 2015) — não prometer fluxo ativo.
- Censo/CEP: snapshots oficiais **estáticos**, claramente datados (não "online"/tempo real).

## 6. Pipeline a gerar

- **Sentinel-2 Vinchina:** script novo (ou bbox extra em `ndvi_snapshot.py`) → raster NDVI de Vinchina + **estimativa de área ativa** (contagem de pixels NDVI>limiar × área/pixel) com **faixa de confiança**. Roda na Action/cron existente; escreve em `public/raster` + `public/data`.
- **Dados oficiais curados:** `territorial-vinchina.json` montado com os números **reais** do Censo 2022 + CEP XXI (buscados/curados na implementação — pop, variação, setores). Estáticos, datados.
- **GeoJSON:** deptos (IGN), localidades de Vinchina, RN76→Pircas Negras.

## 7. Testes

- Zod schema do `territorial-vinchina.json` + loaders (TDD).
- Função pura: estimativa de área ativa (px>limiar → ha) + faixa de confiança; formatação `"X–Y ha (confiança)"`.
- Degradação graciosa (arquivos ausentes → seções somem, sem crash).
- Gate: `npm test` + `npm run lint` (0 erros) + `npm run build` verdes.

## 8. Critério de sucesso

Um planejador (ou o Federico) abre `/bermejo` e entende em ~1 minuto: **quem é Vinchina** (pop/despovoamento/economia), **quanta área tem vegetação produtiva ativa hoje** (com faixa + confiança), e a **conexão logística com o Chile** — com fonte/data/confiança visíveis em tudo, enquadrado como atualização do POT 2015. Apresentável por ele como "video/hito" à equipe do plano produtivo.
