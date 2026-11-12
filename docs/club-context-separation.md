# FC27: clube no jogo e clube real

Estado: implementação proposta para `beta-next`; leitura desativada por padrão.
Nenhuma migration, importação, atualização ou publicação em Production foi executada.
Os números abaixo reutilizam a revisão de 12/11/2026, sem nova auditoria global.

## Modelo e limites

`EaRosterReference` registra o snapshot por hash, procedência, versão do jogo,
data de observação, data efetiva comprovada, plataforma, build e versão do elenco.
Consulta, extração, commit e modificação do arquivo não comprovam data efetiva.

`PlayerClubContextRevision` é uma evidência imutável vinculada a `Player.externalId`.
Seu payload tipado (`ClubContexts`) contém dois objetos independentes:

- `game`: CLUB / NG_FA / UNKNOWN, clube EA quando aplicável, IDs dos vínculos
  nativos, referência do elenco e situação de autenticidade.
- `real`: CLUB / FREE_AGENT / RETIRED / UNKNOWN, nome/ID EA opcional do clube,
  fonte, observação, vigência quando comprovada e hash da evidência. Pode ser nulo.

ID EA continua sendo identidade EA. Não se exige nem se inventa um ID API-Football
para registrar evidência independente. Os modelos de promoção API-Football existentes
permanecem preservados. A nova observação real não os sobrescreve automaticamente.

`PlayerClubContextSelection` escolhe explicitamente uma revisão por jogador, com
referência da decisão e versão. A FK composta impede selecionar a revisão de outro
jogador. Não existe seleção automática pela observação mais recente.

O SQL candidato prepara FKs, constraints e proteção contra alteração das evidências;
não está na pasta de migrations automáticas. Foi gerado sem banco e não executado.
`CLUB_CONTEXTS_READ_ENABLED` fica desligada até autorização de schema/dados.
O leitor valida IDs, hashes canônicos, procedência e correspondência do snapshot.

O perfil EA e a página de vida real apresentam os dois contextos. Liga do vínculo
legado não é reaproveitada para um snapshot selecionado. Não se deve habilitar a
feature globalmente antes de uma atualização aprovada da projeção legada usada
nos cards/filtros: a proposta ainda não muda essas associações em Production.

## Quatro correções propostas

| Jogador | ID EA | Vínculo no template FC27 | Clube real preservado como evidência |
|---|---|---|---|
| Gustavo Gómez | 218191 | NG - FA (111592) | Palmeiras (383) |
| Mauricio | 83924 | NG - FA (111592) | Palmeiras (383) |
| José Manuel López | 261176 | NG - FA (111592) | Palmeiras (383) |
| Jorge Carrascal | 225964 | NG - FA (111592) | Flamengo (1043) |

A preparação reutiliza URLs oficiais já pesquisadas. A data da revisão do cache
é identificada como revisão de evidência, não nova consulta à fonte nem início de contrato.
Não certifica contratação atual além daquela evidência. Nenhum é classificado como
agente livre real pelo vínculo NG - FA. A presença no template não prova disponibilidade
para contratação em uma carreira específica.

Uma aplicação futura deve, em transação e com aprovação específica, verificar o ID EA,
o clube legado esperado e a revisão aprovada; inserir evidências/seleção e corrigir
somente a projeção de clube no jogo. Salários, potenciais, contratos, edições manuais,
visibilidade e recibos históricos ficam preservados. Rollback seleciona a revisão
anterior e restaura a projeção com compare-and-set; não apaga evidências.

O importador agora rejeita novo staging/publicação de clube ausente dos vínculos
nativos classificados como MALE_CLUB. NG - FA continua bloqueado. Verificação de
manifests antigos e replay de staging já registrado permanecem disponíveis.

## 27 homônimos

Todos os 27 possuem identidade de jogador EA na revisão reutilizada; a associação
suspeita é de clube, causada por nome homônimo. Não há justificativa para fundir jogadores.

- 14: Nacional da Madeira (1891) versus Nacional do Uruguai (111325), indicado pelo
  EA Ratings. O destino 111325 está cadastrado.
- 13: Racing argentino (101085) versus Racing uruguaio (112615), indicado pelo EA
  Ratings. O destino 112615 não está entre os 709 clubes. Bloqueio de destino, sem
  substituição por nome, reuso de externalId ou criação de clube fictício.

As propostas são por ID EA de jogador e clube, vinculadas à fonte. Ainda dependem
da política de referência do elenco antes de alteração do vínculo do jogo.

## 240 registros suspeitos

Foram mantidos individualmente como `UNVERIFIED`: 12 grupos de 20 atletas, ausentes
da captura EA Ratings. Clubes: Corinthians, Bragantino, Vasco, Atlético-MG, Mirassol,
Palmeiras, Cruzeiro, Flamengo, Santos, Grêmio, Fluminense e São Paulo.

O descriptor de `players` consultado não oferece flag individual `isgeneric` ou
`islicensed`. Um padrão de nomes, a ausência no Ratings ou a licença do clube não
comprova identidade/autenticidade do atleta. Não há 240 confirmações de atletas reais
nem 240 certificações de genéricos. Nenhum será excluído/ocultado automaticamente.

Próxima evidência exigida: ID nativo em elenco real do jogo/editor com classificação
individual quando disponível, ou identidade independente compatível (nome completo,
nascimento/nacionalidade). Bahia e Botafogo não pertencem a esse grupo de 240.

## 577 jogadores publicados sem clube

- 25 propostas vêm do EA Ratings; os destinos estão cadastrados.
- 552 vêm apenas do template; os destinos também estão cadastrados, mas a captura
  oficial não traz clube. Ausência desse objeto não significa ausência de clube real.

Preparar por referência escolhida, validar só os IDs/destinos afetados e aplicar em
lotes pequenos com checkpoint, recibo, idempotência e rollback após autorização.
Não há escrita preparada para as 3.040 divergências entre duas fontes EA.
Os 184 inéditos continuam bloqueados; nenhum manifest antigo de clube real deve
ser reaproveitado como vínculo no jogo.

## Referência de elenco

Nenhuma das duas fontes comprova, hoje, o snapshot canônico do modo carreira:

- EA Ratings: 16.228 jogadores, consulta em 10/11/2026; metadados não informam
  `sourceUpdatedAt`, `catalogVersion` ou `lastModified`. Contexto oficial FC27 não
  comprova data efetiva nem equivalência com o elenco de uma carreira.
- Template: commit `1464907bf4e726504d8b3ce15ffd0a552990565e`, SHA-256
  `92938136ad6a0e1ba272cecf5df07ddc2a38bbe18913df5c5b253206acb18641`;
  inventário de 22/10/2026, `rosterDate=null`. Data de inventário não é data do elenco.

O [projeto eafc-db-kit](https://github.com/ViniMacacari/eafc-db-kit) distingue templates,
arquivos de squad e saves; a versão seleciona explicitamente o descriptor e não é
inferida do nome. Seu README também ressalva a validação do layout de carreira FC27.

Recomendação: manter ambas as fontes como candidatas identificadas. Para aprovar uma
referência Career, obter o arquivo de elenco efetivamente carregado em nova carreira,
sem edição, registrar plataforma/build, versão/data do elenco com evidência e hash.
Comparar somente os conjuntos pendentes/afetados. Não presumir template mais recente
que Ratings nem trocar automaticamente os 3.040 vínculos.

## Reprodução focada

`node --import tsx scripts/prepareClubContextReview.mts <audit-dir> <output-dir>`
reutiliza quatro arquivos da revisão e o resumo; não acessa banco nem API. Gera listas
nominais de 4, 27, 240 e 577 com propostas e bloqueios, sem comandos de aplicação.

Preview local: definir `CLUB_CONTEXTS_PREVIEW_ENABLED=1` e
`CLUB_CONTEXTS_PREVIEW_FILE=<output-dir>/four-context-proposals.private.json`.
Abrir `/pt/preview/club-contexts` ou `/en/preview/club-contexts`. A rota retorna 404 em
`VERCEL_ENV=production`, não usa banco e não é indexável. Validar com DATABASE_URL
sentinela local bloqueada; nunca copiar variáveis de Production para esse Preview.

## Validação desta proposta

Schema validado e client gerado sem banco; TypeScript e lint focado aprovados.
Testes locais cobrem separação PT/EN, hashes/identidade, datas sem evidência, seleção
explícita, bloqueio de staging/publicação incorretos e compatibilidade dos leitores.
As propostas foram preparadas com sucesso a partir dos artefatos anteriores.

Preview local respondeu HTTP 200 nas quatro propostas com conexão sentinela bloqueada.
A inspeção visual permanece pendente: o navegador integrado sofreu timeouts e reinícios
mesmo após a rota responder. Não se declara validação visual ou Preview remoto aprovado.
O PR deve permanecer em rascunho até essa inspeção e a aprovação da política de elenco.
SQL candidato não foi executado, inclusive em banco local; seus constraints/triggers
ainda exigem teste de integração em banco isolado antes de virar migration aprovada.
