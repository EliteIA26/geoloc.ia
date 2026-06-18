# F0 Territorial — Briefing 3D de Vinchina (Valle del Bermejo)

**Data:** 2026-06-18 · **Status:** Design aprovado (brainstorming) · **Repo:** geoloc.ia

## 1. Contexto e propósito

Federico (gerente FOGAPLAR) pediu, além do agro, um observatório territorial-produtivo do **Valle del Bermejo** para subsidiar um *plan productivo* a apresentar a futuras autoridades. Audiência **B2G**: planejadores, autoridades, Ministerio — não o produtor individual. Ênfase explícita dele: **Vinchina** e a **conexão com o Chile**; e a dor de a província não ter informação produtiva atualizada ("casi online").

Este é um **demo apresentável** (o "video/hito" que ele pediu) — não a plataforma completa.

**Esclarecimento do Federico (2026-06-18):** o projeto dele *"está relacionado [ao POT], pero el nuestro es un plan de desarrollo productivo"*. Ou seja, NÃO é o POT (ordenamento territorial = organização do espaço/uso do solo). O POT 2015 é o **diagnóstico territorial de base / precedente relacionado**; o instrumento do Federico é um **Plan de Desarrollo Productivo** (economia: o que produzir, cadeias de valor, oportunidades produtivas, emprego).

**Posicionamento-chave:** *inteligência territorial como insumo para o **Plan de Desarrollo Productivo** de Vinchina / Valle del Bermejo* — mostra substância econômica, vegetação ativa observada como proxy/insumo para análise produtiva e logística sobre o território, com o POT 2015 citado como base relacionada.

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
  - `public/data/territorial-vinchina.json` — indicadores curados (Censos 2010/2022, CEP XXI, DNV, Ministerio del Interior e POT 2015), cada um com `fonte`, `fecha`, `confianza` e URL oficial auditável.
  - `public/data/bermejo-deptos.geojson` — os 3 deptos (de IGN; reutiliza/filtra o que já temos).
  - `public/data/vinchina-localidades.geojson` — Vinchina, Jagüé.
  - `public/data/corredor-pircas-negras.geojson` — RN76 → Paso Pircas Negras (DNV; geometria oficial da RN76).
  - `public/raster/vinchina-ndvi.png` (+ `-bounds.json`) — Sentinel-2, gerado pela Action.
- Reúsa `MapShell`, `ResizableAside`, componentes de selo/sinal do premium.

## 4. Telas

Uma tela, dois painéis:

- **Mapa 3D (centro):** os 3 deptos visíveis, **Vinchina destacada**, e o **corredor RN76 → Pircas Negras** traçado até a fronteira com o Chile. Reusa o voo 3D/órbita ao focar Vinchina.
- **Briefing (aside) — arco de 3 capítulos (rolagem):**
  1. **Contexto socio-productivo** ("o que é Vinchina"): atividade econômica + emprego formal por setor (substância produtiva); população 2010/2022 + variação **−1,2%** como apoio (mão de obra / despovoamento).
  2. **Vegetación activa observada (satélite)** (o "aha"): *"área com vegetação ativa observada · valle monitoreado: X–Y ha, estimado"* + NDVI e NDMI (proxies de vigor e umidade). O AOI é somente a janela monitorada do Valle del Bermejo intersectada com Vinchina; **não representa todo o departamento**. É um insumo biofísico para análise produtiva: pode representar vegetação cultivada ou natural, exige validação local e não mede diretamente cultivo, produção ou uso de água.
  3. **Logística / conexão com Chile:** corredor a Pircas Negras — distância vial estimada sobre a geometria oficial DNV, status histórico **"incipiente"** (POT 2015, p. 35), a oportunidade produtiva que habilita.
- **Cada indicador** carrega selo **fonte · data · confiança**. Cabeçalho enquadra como *insumo para o Plan de Desarrollo Productivo* (POT 2015 como base relacionada). O arco lidera pela substância **produtiva** (economia + proxy de vegetação ativa observada + logística); demografia e os proxies biofísicos entram como **contexto de apoio à decisão produtiva**, sem serem apresentados como medição direta de produção.

## 5. Dados, fontes e regras de honestidade

Classificação (selo em cada indicador): **oficial / observado / estimado / declarado**.

| Camada | Fonte | Data | Confiança |
|---|---|---|---|
| População 2010/2022 e variação | INDEC Censos 2010 e 2022 | 2010–2022 | oficial |
| Estabelecimentos e emprego formal registrado por setor | CEP XXI · Dados de estabelecimentos por departamento e atividade | 2022 | oficial (rotular "formal"; exclui informalidade e conta própria) |
| Área con vegetación activa observada · valle monitoreado (ha ± faixa heurística) | Sentinel-2 (NDVI>limiar), janela Valle del Bermejo ∩ Vinchina; não cobre todo o departamento | ~mensal | estimado |
| NDVI medio (zonas activas) | Sentinel-2 | ~mensal | observado |
| NDMI medio (zonas activas) — proxy de umidade da vegetação ativa; não mede produção ou uso de água diretamente | Sentinel-2 | ~mensal | observado |
| RN76 / Pircas Negras / distância / diagnóstico | DNV (geometria oficial da RN76) + Ministerio del Interior (passo/altitude) + POT 2015, p. 35 (diagnóstico histórico) | 2025-04-23 / 2025-05-16 / 2015 | oficial para fontes; estimado para a distância derivada |

**Regras (inegociáveis):**
- O satélite mede **"vegetação ativa observada"** — pode ser cultivo **ou** vegetação natural. **NUNCA** afirmar "X ha de [cultivo]"; o rótulo deixa claro que distinguir cultivo exige validação local.
- O AOI satelital é a interseção da janela monitorada do Valle del Bermejo com Vinchina, **não o departamento inteiro**. Exibir esse alcance, cobertura válida e link auditável para o item STAC selecionado.
- Estimativas biofísicas **sempre** com faixa + nível de confiança; nunca número único "exato". A distância vial derivada é arredondada e explicita geometria, método e que não é linha reta.
- Corredor Chile: status histórico **"incipiente"** (POT 2015, p. 35, seção Subsistema físico espacial) — não tratar como avaliação atual nem prometer fluxo ativo.
- Censo/CEP: snapshots oficiais **estáticos**, claramente datados (não "online"/tempo real).

## 6. Pipeline a gerar

- **Sentinel-2 Vinchina:** script novo (ou bbox extra em `ndvi_snapshot.py`) → raster NDVI somente da janela monitorada do Valle del Bermejo intersectada com Vinchina (não o departamento inteiro) + **estimativa de área ativa** (contagem de pixels NDVI>limiar × área/pixel) com **faixa heurística de cenário ±15%**, não intervalo de confiança. Roda na Action/cron existente; escreve em `public/raster` + `public/data`, incluindo bbox, cena, cobertura válida e URL STAC exata.
- **Dados oficiais curados:** `territorial-vinchina.json` montado com os números **reais** do Censo 2022 + CEP XXI (buscados/curados na implementação — pop, variação, setores). Estáticos, datados.
- **GeoJSON:** deptos (IGN), localidades de Vinchina, RN76→Pircas Negras.

## 7. Testes

- Zod schema do `territorial-vinchina.json` + loaders (TDD).
- Função pura: estimativa de área ativa (px>limiar → ha) + faixa heurística de cenário; formatação `"X–Y ha"` e classificação de confiança separada no selo.
- Degradação graciosa (arquivos ausentes → seções somem, sem crash).
- Gate: `npm test` + `npm run lint` (0 erros) + `npm run build` verdes.

## 8. Critério de sucesso

Um planejador (ou o Federico) abre `/bermejo` e entende em ~1 minuto: **quem é Vinchina** (pop/despovoamento/economia), **quanta área tem vegetação ativa observada hoje na janela monitorada** (interseção Valle del Bermejo/Vinchina, não todo o departamento; cultivada ou natural; proxy com faixa heurística que exige validação local), e a **conexão logística com o Chile** — com fonte/data/confiança visíveis em tudo, enquadrado como **insumo para o Plan de Desarrollo Productivo** (POT 2015 como base relacionada). Apresentável por ele como "video/hito" à equipe do plano produtivo.
