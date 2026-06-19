# /bermejo UX3 — Dados ricos + fotos das cidades + limites no clique

**Data:** 2026-06-19 · **Status:** Design aprovado (brainstorming) · **Repo:** geoloc.ia · **Branch:** feat/bermejo-ux3

## 1. Contexto e propósito

O `/bermejo` v2 está no ar (pontos clicáveis + HUD com foto + legenda + sidebar). Feedback do usuário: (a) as **cidades** (Vinchina, Jagüé, Villa Unión) não têm foto e têm dados pobres; (b) os **cards** estão pobres e mal organizados — quer informação mais rica, **pesquisada e atualizada**, bem estruturada; (c) ao **selecionar um ponto**, mostrar os **limites geográficos** daquele local, em destaque.

**Objetivo:** elevar o `/bermejo` a um briefing por ponto **apresentável** — ficha estruturada e pesquisada por ponto, fotos nas cidades, e destaque do limite geográfico do ponto selecionado. Tudo honesto (fonte·data·confiança; nada inventado).

## 2. Escopo

Enriquecimento do `/bermejo` (8 pontos existentes). Decisões fechadas no brainstorm:
- **Limites = híbrido:** área protegida oficial onde existe (Talampaya, Laguna Brava), departamento para localidades, realce/raio para pontos-sítio.
- **Card = ficha estruturada por tipo** (hero + seções rotuladas), com pesquisa profunda real.
- **Fotos CC** para as localidades (verificadas + crédito; ilustração onde não houver).

### Não-objetivos
Tempo real; exaustividade de todo dado possível; mexer no `/panel-premium`; inventar dados/fotos/limites (omitir quando não houver fonte confiável).

## 3. Arquitetura

### 3.1 Schema do ponto (v2) — `src/lib/bermejo-puntos.ts`
Estender `PuntoSchema` (mantendo `id, nombre, tipo, eje, coordinates, foto, credito, fonte, confianza, url, descripcion`):
- `hero: { etiqueta: string; valor: string }[]` — 2-3 fatos-destaque.
- `secciones: { titulo: string; items: string[]; fonte?: string; confianza?: Confianza }[]` — seções rotuladas (substitui o `datos` chapado).
- `limite: { tipo: "area" | "departamento" | "radio"; ref?: string }` — referência do limite geográfico:
  - `"area"` → `ref` = id do polígono em `bermejo-limites` (Talampaya, Laguna Brava).
  - `"departamento"` → `ref` = nome do depto (de `bermejo-deptos.geojson`).
  - `"radio"` → realce/círculo no ponto (sem polígono real).
- Atualizar o teste; `datos` removido (migrado para `secciones`).

### 3.2 Dados
- `public/data/bermejo-puntos.json` — reescrito com `hero`/`secciones`/`limite` pesquisados e reais por ponto (fontes: INDEC Censo 2022, Turismo La Rioja, Parques Nacionales/UNESCO, Ramsar, IGN). Datado; omitir o que não for confiável.
- `public/data/bermejo-limites.geojson` — polígonos **oficiais** das áreas protegidas (Talampaya, Laguna Brava) buscados de fonte oficial (SIFAP/APN/IGN); se um não estiver disponível, o ponto cai para `limite.tipo: "departamento"` + nota.
- Fotos CC das localidades em `public/img/bermejo/<id>.jpg` (Vinchina, Villa Unión; Jagüé pode ficar `foto:null`).

### 3.3 Componentes
- `point-hud.tsx` reorganizado: foto+crédito → eixo·nome → **hero** (linha de destaques) → **seções rotuladas** (cada uma com selo fonte·confiança consolidado). Rolável; mesma animação.
- `bermejo-limites.ts` (lib) — schema/loader dos polígonos de área protegida + helper que resolve `limite` → fonte de dados do destaque.
- `bermejo/page.tsx`: ao `selectPunto`, além do flyTo+HUD, **desenhar a camada de limite** conforme `punto.limite`:
  - área → adiciona/atualiza source com o polígono de `bermejo-limites`;
  - departamento → filtra `bermejo-deptos` pelo nome (realce);
  - radio → círculo destacado no ponto.
  Remove/limpa o destaque ao fechar o HUD. Transição suave.

## 4. Card (organização)
Hero proeminente (2-3 números/selos); seções agrupadas com cabeçalho discreto; selo fonte·confiança por seção (não por linha). Sem a lista chapada atual.

## 5. Dados, fontes e honestidade
- Cada `seccion`/`hero`: valores reais pesquisados, com `fonte` + `confianza` (oficial/observado/estimado/declarado) e data quando aplicável.
- Polígonos de área protegida: fonte oficial citada; **fallback ao departamento + aviso** se indisponível.
- `foto:null` → ilustração; **nunca** dado/foto/limite fabricado — omitir quando faltar fonte.
- Talampaya/Villa Unión seguem rotulados "contexto del valle (fuera de Vinchina)".

## 6. Testes
- `bermejo-puntos.ts` v2: schema parseia hero/secciones/limite; rejeita `limite.tipo` inválido; `fetchPuntos` degrada a [] (TDD).
- `bermejo-limites.ts`: schema parseia FeatureCollection; loader degrada a null.
- Degradação graciosa: limite ausente → sem camada de destaque, sem crash; foto null → ilustração.
- Gate: `npm test` + `npm run lint` (0 erros) + `npm run build` verdes.

## 7. Critério de sucesso
Selecionar qualquer ponto e ver: ficha **rica e organizada** (hero + seções pesquisadas, com fonte·confiança), **foto** (inclusive nas cidades), e o **limite geográfico** daquele local destacado no mapa (área protegida real / departamento / realce) — tudo honesto e datado. Apresentável pelo Federico como peça do Plan de Desarrollo Productivo.
