# Lote visual 1.1.1 — Perfil e histórico

Baseline: `c517eee`, branch `beta-next`, árvore limpa.

## Separação

- Perfil: header/OVR/potencial/valor, posições, Skill Moves/Weak Foot, PlayStyles,
  atributos/subatributos e Análise FutScout preservados. Vida Real é resumo, não timeline.
- Estatísticas atuais permanecem no perfil, com Jogos/Gols/Assistências/Minutos/
  Titularidades e estado ausente. Dados futuros exigem fonte, período e competição.
  Análise por atributos fica fora do bloco de estatísticas reais.
- Histórico em `/pt/jogadores/[slug]/historico` e `/en/jogadores/[slug]/historico`:
  resumo da carreira, temporadas, transferências, clubes/períodos, títulos e seleção.
  URLs mantêm segmentos em português conforme i18n existente; proxy já negocia
  `/jogadores/:path*`. CTA de ida, retorno ao perfil e breadcrumb traduzidos.
- Perfil EA incompleto não bloqueia a página de histórico. Jogador inexistente usa
  `notFound()` e metadata noindex; a limitação SSR 404 previamente aceita não é reaberta.

## Auditoria local de dados / bloqueio de TransferObservations

`PlayerTransferObservation` persiste observações imutáveis, não uma projeção pública
aprovada de eventos. `lib/transferHistory.ts` declara expressamente que
`logicalEventKey` é uma sugestão, não identidade autoritativa; `possibleRevisionHashes`
aponta possíveis revisões, sem escolher uma versão canônica para publicação.
`services/transferObservationReadRepository.ts` é leitor de auditoria/piloto com
allow-list e hashes de tabelas; não é leitor público de carreira.
`transferProjectionPersistence.ts` inclui operações de escrita/propostas e não deve
ser importado pela interface. Nenhum desses módulos foi conectado nem alterado.

Não há caminho público existente seguro que resolva essas revisões. Bloqueio:
**REQUIRES_SEPARATE_DATA_PIPELINE** — criar/revisar projeção read-only por identidade
confirmada, tratar correções/conflitos sem duplicar eventos, validar proveniência e
remover IDs/hashes/metadados antes de retornar o DTO público. Não basta escolher a
última observação por data de coleta. A existência de observações não é negada pela
UI: ela informa que o histórico verificado ainda não está disponível no perfil.

`PlayerRealLifeStat`, `PlayerTransfer` e `PlayerTrophy` também existem no schema;
o reader público atual não os entrega. Não confundir ausência de reader validado
com inexistência de dados no banco. A cobertura real não foi auditada por SQL neste
lote. Títulos têm `place`, que pode não significar campeão; estatísticas requerem
recorte/cobertura; totais de carreira não podem ser somados de uma amostra parcial.

## Contratos preparados

DTO de apresentação sem campos operacionais: totais explícitos (nunca derivados de
arrays parciais), temporadas com clube/competição/jogos/minutos/gols/assistências,
transferências com data e tipo/taxa bruta, clubes com períodos, títulos com equipe,
histórico internacional com jogos/gols/assistências. Ausência é `—`, não zero.
Zero legítimo é preservado; contagens inválidas não são exibidas. Fonte vazia não
habilita dados. Um adapter futuro continua responsável por verificação/deduplicação;
a string `source` não constitui, sozinha, comprovação externa.

Salário/contrato/camisa/seleção/clube real confirmado seguem sem novo reader.
Nacionalidade nunca vira seleção. Nenhum salário, resultado, taxa ou título criado.
Tipo/taxa bruta não é salário ou valor de mercado. Current Club V2 intocado.

## Escopo preservado

Sem alterações em cards, filtros, nacionalidades, assets, schema, migrations,
Player/Club, providers, sync ou configuração. Nenhuma dependência instalada.
Escudos/logos/PlayStyle art continuam no escopo futuro do Lote 12.

## Validação

- Suíte automatizada: **1.320 testes — 1.312 PASS, 0 FAIL, 8 skips SSR 404
  preexistentes**; inclui contratos PT/EN, empty states, 404 e preservação das
  seções do perfil.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS, sem erros ou warnings.
- `npm run build`: PASS com URLs fictícias de processo; rota `historico` incluída.
- `npx prisma validate`: PASS; nenhuma conexão ou alteração de banco.
- `git diff --check`: PASS (avisos informativos de conversão CRLF/LF do Git).
- Smoke local read-only: perfil ↔ histórico em PT/EN, desktop/tablet/390px, sem
  overflow horizontal; navegação e estados vazios verificados. Nenhuma API
  operacional, sync, migration ou write de banco foi executado.

Pronto para homologação visual final e commit/push somente em `beta-next`.
