# Panel Territorial Agrícola de La Rioja — Design (F0)

- **Data:** 2026-06-15
- **Status:** Aprovado (design) — aguardando revisão do spec antes do plano de implementação
- **Repositório:** https://github.com/EliteIA26/geoloc.ia (projeto separado do fogaplar)
- **Banco (opcional, fase 2):** Supabase `nqkvohhyjmtqhywztokg`

---

## 1. Objetivo

Construir um **artefato de demonstração navegável (F0)** do "Panel Territorial Agrícola de La Rioja": um *cockpit territorial* que transforma dados de satélite gratuitos (Sentinel-2) em um painel de decisão para o governo provincial, com uma prévia da visão do produtor.

O F0 **não é um produto de produção**. É um **instrumento de venda/validação** para usar na frente do canal político (CFI / Ministerio de Producción), cujo único objetivo estratégico é responder à pergunta decisiva: *"O governo financia e adota isto?"*.

### Critério de sucesso (da demo)

Um avaliador (CFI / Ministerio) navega as duas vistas em **menos de 2 minutos**, vê um mapa de satélite **real** de Aimogasta colorido por saúde de cultivo, e entende sem explicação: *"isto roda com dado gratuito e serve governo + produtor"*. **Não pode travar nem depender de rede instável durante a apresentação.**

---

## 2. Posicionamento (informado por pesquisa de mercado)

O mercado tem dois lados que não se conversam:

1. **Precision ag** (Auravant, Kilimo) → mira o **produtor**; incumbentes fortes, especialmente Kilimo (irrigação em semiárido argentino — quase a dor exata de La Rioja).
2. **GIS na nuvem** (Felt, Esri) → mira a **organização/governo**; nível provincial em La Rioja está descoberto.

**Decisão de posicionamento:** o F0 **lidera pela camada de governo** (cockpit territorial), onde os incumbentes são fracos e o acesso político é o moat. A visão do produtor entra como **prévia de fase 2**, para mostrar a ambição sem entrar na briga direta contra Kilimo/Auravant no primeiro pitch.

**O diferencial não é a tecnologia** (NDVI de Sentinel-2 é commodity). É: verticalização na realidade riojana (olivo, água, árido) + enquadramento dois-lados + distribuição B2G via canal CFI/Pedrali + propriedade provincial.

**Decisão em aberto (fase 2, não bloqueia o F0):** competir vs. fazer parceria com Kilimo/Auravant no lado produtor.

---

## 3. Escopo F0

### Dentro
- Página navegável standalone em repo próprio (`geoloc.ia`).
- **Vista Gestión (protagonista):** mapa da província, departamento de Arauco destacado; toggles de camada (saúde da vegetação / estresse hídrico / limites de finca); painel de indicadores agregados + alertas por zona; botão "exportar relatório" (mock).
- **Vista Productor (prévia fase 2):** uma finca sobre Aimogasta; série temporal de NDVI; semáforo de estresse hídrico; recomendação simples de irrigação. Rotulada visivelmente como "preview".
- **Camada real única:** overlay NDVI/NDWI de um *snapshot* pré-computado de Sentinel-2 sobre Aimogasta, com rótulo "Sentinel-2 · captura de [data]".
- Tudo o mais (resto da província, demais fincas, séries temporais) é **sintético-realista**.

### Fora (YAGNI — fase 2+)
- Login / multi-tenant / autenticação.
- Sentinel-2 ao vivo, scrub de datas, cálculo de NDVI em runtime.
- Geração de PDF real do relatório.
- Dados reais fora da zona-âncora de Aimogasta.
- App mobile de campo.
- Integração com Supabase (dados do F0 são estáticos).

---

## 4. Arquitetura & stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript — alinhado ao ecossistema que a equipe já domina (fogaplar).
- **Estilo:** Tailwind CSS 4.
- **Mapa:** **MapLibre GL JS** (open-source, sem token/billing).
- **Basemap:** camada satélite gratuita (Esri World Imagery via raster tiles) + um basemap claro alternativo para a vista de gestão.
- **Dados da demo:** arquivos **estáticos** servidos de `public/data/` (GeoJSON + JSON de séries). **Sem banco de dados no F0.**
- **Camada real:** raster NDVI/NDWI pré-computado (PNG/COG georreferenciado ou tiles) servido como asset estático e desenhado como overlay no MapLibre.
- **Deploy:** Vercel (preview por PR), fase posterior. Não bloqueia o F0 local.

> Nota de implementação: as APIs do Next 16 / MapLibre devem ser confirmadas na documentação oficial antes de codar (não confiar em memória — Next 16 tem mudanças relevantes; MapLibre tem breaking changes entre majors).

---

## 5. Estrutura de dados (estática, F0)

Em `public/data/`:

- `departamentos.geojson` — polígonos dos departamentos de La Rioja (Arauco destacado). Fonte: limites administrativos públicos (IGN Argentina).
- `fincas-aimogasta.geojson` — alguns polígonos de finca na zona de Aimogasta (uma marcada como "minha finca" na vista produtor).
- `indicadores-departamentos.json` — métricas agregadas semeadas por departamento (% área sob estresse, índice médio de vegetação, etc.).
- `series-ndvi.json` — séries temporais semeadas por finca/departamento (para sparklines e o gráfico do produtor). A finca-âncora de Aimogasta usa uma série **real** curta extraída do snapshot.
- `alertas.json` — lista semeada de alertas por zona (seca / helada).

Camada real:
- `public/raster/aimogasta-ndvi.{png|tif}` (+ sidecar de georreferência / bounds) — snapshot Sentinel-2 processado offline.

---

## 6. As duas vistas (componentes)

Estrutura de UI compartilhada: um `MapShell` (MapLibre + controles) com um seletor de vista no topo e um painel lateral que troca de conteúdo por vista.

### Vista Gestión (protagonista)
- `ProvinceMap` — mapa com `departamentos.geojson`, Arauco destacado.
- `LayerToggle` — alterna NDVI (saúde) / NDWI (estresse hídrico) / limites de finca.
- `AggregateIndicators` — cards + sparklines a partir de `indicadores-departamentos.json` e `series-ndvi.json`.
- `AlertsPanel` — `alertas.json`, agrupados por zona/severidade.
- `ExportReportButton` — mock (abre um resumo/placeholder; sem PDF real no F0).

### Vista Productor (prévia fase 2)
- `FincaMap` — finca sobre Aimogasta com o overlay NDVI **real**.
- `NdviTimeSeries` — gráfico de série temporal da finca.
- `WaterStressBadge` — semáforo verde/âmbar/vermelho a partir do índice.
- `IrrigationHint` — regra simples sobre o índice → recomendação textual.
- Banner "Preview — Fase 2".

---

## 7. Fluxo de dados (F0)

```
public/data/*.{geojson,json}  ─┐
                               ├─►  carregados client-side  ─►  MapLibre desenha polígonos
public/raster/aimogasta-ndvi  ─┘                                e colore por índice
                                                                 │
                                  overlay raster real só         ▼
                                  na zona de Aimogasta      painéis (indicadores,
                                                            série, alertas, semáforo)
```

Tudo client-side, sem backend no F0. A exceção é a zona-âncora de Aimogasta, que usa o raster real + uma série temporal real curta; todo o resto é sintético-realista.

---

## 8. A âncora real — pipeline do snapshot Sentinel-2 (offline, uma vez)

Decisão de garfo: **snapshot pré-computado** (não ao vivo) — é dado de satélite real, custo zero, e não quebra durante o pitch.

Pipeline executado **uma vez, offline**, antes da demo:
1. Selecionar uma cena Sentinel-2 L2A recente e com pouca nuvem sobre Aimogasta (fonte gratuita: Copernicus Data Space / Microsoft Planetary Computer).
2. Computar NDVI = (B8 − B4) / (B8 + B4) e NDWI = (B3 − B8) / (B3 + B8) na área da zona-âncora.
3. Recortar para os bounds da zona, aplicar paleta de cores, exportar como raster georreferenciado (PNG + bounds, ou COG).
4. Extrair a série temporal real curta para a finca-âncora.
5. Salvar em `public/raster/` e `public/data/series-ndvi.json`.

Resultado: a demo carrega assets estáticos, mas a camada de Aimogasta é satélite **real**, com data rotulada.

---

## 9. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Travar/lag durante o pitch | Tudo estático, sem backend, sem chamadas de rede em runtime |
| "Vale da estranheza" de dado falso | A zona-âncora é real e rotulada; o resto é claramente um painel, não promessa de precisão |
| Repo público vazar segredo | F0 não tem segredo; Supabase só na fase 2, com `.env` fora do git |
| Confundir com produto pronto | Vista Productor rotulada "Preview — Fase 2"; relatório marcado como mock |
| Briga com incumbentes (Kilimo/Auravant) | Posicionamento lidera por governo; produtor fica como prévia |

---

## 10. Repositório & higiene

- Projeto separado em `geoloc.ia`, irmão de `fogaplar` e `proveedores360-demo`.
- `.gitignore` exclui `node_modules`, `.next`, `.env*`.
- Nenhuma chave/segredo commitado (repo é público).
