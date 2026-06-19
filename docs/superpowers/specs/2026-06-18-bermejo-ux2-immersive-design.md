# /bermejo UX2 — Mapa navegável + HUD imersivo de pontos

**Data:** 2026-06-18 · **Status:** Design aprovado (brainstorming) · **Repo:** geoloc.ia · **Branch:** feat/bermejo-ux2

## 1. Contexto e propósito

O `/bermejo` está no ar, mas a UX falha: os pontos do mapa (localidades) e a rota amarela (corredor RN76→Pircas Negras) **não têm rótulo nem clique** ("clico e não faz nada", "o que é a linha amarela?"), e a sidebar é uma **pilha de cards idênticos divididos só por título** — poluída e difícil de ler.

**Objetivo:** tornar o `/bermejo` **navegável e imersivo**, no padrão que já usamos (animação + 3D do radial HUD): clicar em qualquer ponto/rota abre um **card imersivo com foto + info relevante** ("Ponto turístico X"), o mapa fica **autoexplicativo** (legenda), e a sidebar vira **hierarquia escaneável + navegação**. Conteúdo sempre dentro do enquadramento do Plan de Desarrollo Productivo (cada ponto liga a um eixo: turismo / logística / população).

**Decisões fechadas (brainstorm):** fotos = **reais com licença CC + crédito visível** (Wikimedia Commons; fallback ilustração on-brand onde não houver imagem livre); interação = **HUD imersivo 3D** ao clicar (câmera voa + card flutuante animado).

## 2. Escopo

- Redesign do `/bermejo` (rota existente). Mantém o enquadramento e os dados territoriais já curados (`territorial-vinchina.json`) e a camada satelital de Vinchina.
- **Pontos clicáveis** (Vinchina-deep + contexto do vale): localidades **Vinchina, Jagüé**; atrativos **Laguna Brava, Estrellas de Vinchina, Quebrada de la Troya, Paso Pircas Negras**; contexto do vale **Parque Nacional Talampaya, Villa Unión**.

### Não-objetivos
- Redesign do `/panel-premium` (separado).
- Identificação de cultivo / dados em tempo real / mapa de atores (fora do F0, como na spec original).
- Fotos fabricadas ou de licença incerta.

### Tarefa relacionada (separada deste design)
Adotar na produção os arquivos premium da outra IA (fix de órbita do `/panel-premium`: botão direito orbita, esquerdo move; + componentes `department-ai-chat`, `live-ticker`, `radar-scan`, `time-slider`) — hoje **não commitados** em `experiments/ui-improvements`. Tratado como passo concreto à parte (verificar build + commit + merge), não neste redesign do `/bermejo`.

## 3. Arquitetura

- **Dados:** `public/data/bermejo-puntos.json` — lista de pontos, cada um: `id`, `nombre`, `tipo` (`localidad` | `atractivo`), `eje` (`turismo` | `logistica` | `poblacion`), `coordinates` [lng,lat], `foto` (caminho local ou `null`), `credito` (atribuição CC), `descripcion`, `datos` (string[]), `fonte`, `confianza`, `url?`.
- **Fotos:** `public/img/bermejo/<id>.jpg` — imagens CC baixadas do Wikimedia Commons, com `credito` (autor · licença · link). Onde não houver imagem livre adequada → `foto: null` e o card usa uma **ilustração/ícone on-brand** por `tipo`.
- **Lib:** `src/lib/bermejo-puntos.ts` — `PuntoSchema`/`PuntosSchema` (Zod), `fetchPuntos()` (degradação graciosa), tipo `Punto`.
- **Componentes:**
  - `src/components/territorial/point-hud.tsx` — card flutuante imersivo (framer-motion, estilo glass do radial HUD): foto grande (ou ilustração), nome, tipo, descrição, `datos` com selo fonte·confiança, gancho do eixo produtivo, **crédito da foto**, botão fechar. `AnimatePresence` (entra/sai).
  - `src/components/territorial/map-legend.tsx` — legenda fixa no canto: ● localidades · ★ atrativos · ▬▬ corredor RN76→Chile.
  - `src/components/territorial/point-list.tsx` — lista clicável dos pontos do vale na sidebar, sincronizada com o mapa (clicar = selecionar = voar + abrir HUD).
- **Rota `src/app/bermejo/page.tsx`:** adiciona a fonte/camada de pontos (markers por `tipo`), `cursor: pointer` + tooltip no hover; clique no marcador OU na rota OU na lista → `setSelectedPunto` → `map.flyTo` (pitch/bearing) + HUD; "voltar" recua a câmera e fecha. Sidebar reestruturada (Seção 4). Reusa `MapShell`.

## 4. Sidebar de-clutter

Sai a pilha de cards idênticos; entra hierarquia:
- **Hero**: Vinchina + 2 números grandes — população **2.699 (−1,2%)** e **área activa observada 2.804–3.794 ha** (o "aha").
- **Seções agrupadas e colapsáveis** (acordeão) com ícone por tema: Contexto, Satélite, Turismo, Potencial, Logística (reusa os dados de `territorial-vinchina.json`). Estado aberto/fechado local; primeira seção aberta por padrão.
- **Lista de pontos do vale** (`point-list`) clicável, sincronizada com o mapa → a lateral vira navegação, não depósito de dados.

## 5. Mapa legível

- **Legenda** (canto) explicando as camadas — fim do "o que é isso?".
- **Marcadores por tipo** (ícone/cor distintos), hover com cursor pointer + nome.
- **Rota amarela clicável** → abre o card de Pircas Negras / corredor. Nenhum elemento "morto" no mapa.

## 6. Honestidade / fontes

- **Crédito da foto** (autor · licença CC · link) visível em todo card com imagem.
- Cada ponto: descrição de fonte real (Turismo La Rioja / Parques Nacionales / Censo), **gancho produtivo**, e selo **fonte·confiança**. Talampaya/Villa Unión rotulados como **contexto do vale (fora de Vinchina, dpto. Felipe Varela)**.
- Regras do satélite intactas ("vegetación activa observada", faixa + escopo "no representa todo el departamento"). Nada fabricado; `foto: null` quando não há imagem CC.

## 7. Testes

- `bermejo-puntos.ts`: `PuntosSchema` parseia amostra válida; rejeita `tipo`/`eje` inválidos; `fetchPuntos` retorna null em falha (TDD).
- Degradação graciosa: pontos ausentes → mapa sem markers + sidebar sem lista, sem crash; `foto: null` → ilustração.
- Gate: `npm test` + `npm run lint` (0 erros) + `npm run build` verdes.

## 8. Critério de sucesso

Abrir `/bermejo` e: entender o mapa pela legenda; **clicar em qualquer ponto/rota** e ver um card imersivo 3D com **foto + info relevante** (e crédito), ligado ao eixo produtivo; navegar pela lista da lateral sincronizada com o mapa; ler a sidebar como hierarquia escaneável, não um paredão. Apresentável pelo Federico como peça do Plan de Desarrollo Productivo.
