# FUTSCOUT_WAGE_MLS_PILOT_01

Resultado: **BLOCKED**, 19/10/2026. Preparação offline executada; treinamento e
publicação permanecem bloqueados. Base: `beta-next` em
`f709fa1e8cb1c2246c6890840496333b443d38d5`. Custo: R$ 0.

## Resultado medido

| Medida | Resultado |
| --- | ---: |
| Linhas oficiais comparadas | 916 |
| Linhas CSV comparadas | 916 |
| Nome + clube + base + garantido coincidentes | 916 |
| Divergências monetárias | 0 |
| Ausentes em qualquer fonte | 0 |
| Chaves nome/clube duplicadas dentro de uma fonte | 0 |
| Observações após reconciliação (não 1.832 amostras) | 916 |
| Vínculos HIGH ao catálogo FutScout comprovados nesta tarefa | 0 |
| Referências tecnicamente aptas | 0 |
| Referências com direitos e semântica aprovados | 0 |
| Referências autorizadas para treino | 0 |

Comparação completa da tabela HTML oficial (linhas extraídas 28–943) com o CSV,
não uma amostra. Igualdade de nomes/clube para reconciliação entre documentos
não estabelece identidade de um Player.id. Os 93 vínculos históricos continuam
inventário documental: não foram somados nem revalidados sem seu artefato original.
Não houve consulta de banco nem uso de fixtures sintéticas como cadastro real.

## Edição: setembro não é uma nova amostra

O CSV corresponde integralmente à tabela oficial consultada em 19/10/2026.
A [documentação do compilador](https://ericdoesit.github.io/youth-soccer-analysis/report/data.html)
o apresenta como setembro/2026. Essa afirmação não demonstra edição independente:
o conteúdo coincide com a edição Spring cuja página oferece download rotulado
12/05/2026. Preservar a declaração original de setembro como metadado contestado,
não como data efetiva ou nova observação.

A [página MLSPA](https://mlsplayers.org/resources/salary-guide) informa referência
16/04/2026; o [PDF Spring oficial](https://s3.amazonaws.com/mlspa/Spring-2026-MLSPA-Salary-Guide.pdf)
informa 14/04/2026 no cabeçalho. Assim, a correspondência de conteúdo está resolvida;
o cutoff exato **14 versus 16 de abril** continua pendente. Não escolher um deles
silenciosamente, usar maio como vigência, ou deslocar registros para setembro.
O identificador provisório é `MLSPA_SPRING_2026_CUTOFF_UNRESOLVED`.

Proveniência congelada nesta execução:

- CSV Git blob: `ff94b1193b80043e4d84028241dd79927b90738f`.
- SHA256 dos bytes CSV: `671584003991b43fd951d5b93d795718a230ba67302267b1ed05f7e734e4177a`.
- SHA256 do JSON da extração oficial: `8e73f684bf3490644866613e74f53e63108982272f7279983678daa0bcc9ab4c`.
- O último hash representa a extração JSON com campos/linha de origem, **não**
  os bytes HTTP, uma assinatura MLSPA ou hash do PDF. As linhas oficiais estão
  congeladas no artefato offline; não depender de uma futura página mutável.

## Semântica e direitos

A MLSPA divulga base anualizada e compensação garantida anualizada separadas.
A segunda inclui componentes adicionais e exclui bônus de desempenho não
garantidos; não é salário-base. Seu escopo é o contrato com MLS, sem todo contrato
adicional individual com clubes/afiliados. Conservar ambas as colunas, decimais
originais, USD/ano e proveniência. Nenhuma diferença entre colunas vira bônus
calculado; nenhuma anualização vira valor efetivamente recebido naquele ano.
A descrição consultada não resolve explicitamente bruto/líquido para o alvo
EUR/GROSS/BASE/WEEK. `tax=UNKNOWN`, `effectiveAt=null`, FX ainda ausente.

Os [termos MLSPA, seção License](https://mlsplayers.org/legal) reservam direitos,
preveem uso pessoal e restringem reprodução/redistribuição. Não foi demonstrada
uma exceção específica que autorize a calibração comercial pretendida. A declaração
CC0 do compilador é evidência dos direitos que ele declara conceder, mas
[CC0 não elimina direitos de terceiros](https://creativecommons.org/publicdomain/zero/1.0/).
Isso impede marcar treino/calibração como CONFIRMED nesta execução; não constitui
parecer de que todo uso factual seja proibido. Não publicar o CSV nem o conjunto
real no PR. Nenhum contato, contrato ou compra foi realizado.

## Cobertura das observações de origem

30 clubes + **MLS Pool (5 registros; não é clube)**. Idades: **916 UNKNOWN**,
pois os documentos salariais não trazem DOB e não há mapeamento revisado disponível.
Posições são as descrições da fonte, não equivalência automática às posições EA.

| Clube/grupo | Registros | Clube | Registros |
| --- | ---: | --- | ---: |
| Atlanta United | 29 | Austin FC | 26 |
| CF Montreal | 31 | Charlotte FC | 31 |
| Chicago Fire | 31 | Colorado Rapids | 30 |
| Columbus Crew | 31 | DC United | 30 |
| FC Cincinnati | 29 | FC Dallas | 36 |
| Houston Dynamo | 29 | Inter Miami | 27 |
| LA Galaxy | 29 | LAFC | 30 |
| Minnesota United | 34 | Nashville SC | 30 |
| New England Revolution | 30 | New York City FC | 36 |
| New York Red Bulls | 35 | Orlando City SC | 27 |
| Philadelphia Union | 32 | Portland Timbers | 26 |
| Real Salt Lake | 38 | San Diego FC | 29 |
| San Jose Earthquakes | 32 | Seattle Sounders FC | 28 |
| Sporting Kansas City | 24 | St. Louis City SC | 30 |
| Toronto FC | 29 | Vancouver Whitecaps | 32 |
| MLS Pool | 5 | | |

Posições: Center-back 162; Central Midfield 116; Center Forward 112;
Goalkeeper 102; Right-back 75; Right Wing 70; Left Wing 70; Left-back 66;
Defensive Midfield 65; Attacking Midfield 56; Right Midfield 12;
Left Midfield 7; Midfielder 2; Center Forward/Attacking Midfielder 1.

Faixas de base original USD/ano (limite inferior inclusivo): abaixo de 100 mil
**154**; 100–250 mil **250**; 250 mil–1 milhão **394**; 1–5 milhões **108**;
a partir de 5 milhões **10**. Não são contagens de salários licenciados ou
cobertura pública do produto. Nenhuma cauda foi descartada ou winsorizada.

## Implementação reutilizável

`experiments/futscout-wage-v01/mls-pilot.ts` contém funções puras:

1. `parseMlsCsv`: CSV estrito, aspas/CRLF/BOM, decimais originais; rejeita linhas
   malformadas, colunas faltantes, valores inseguros e ano diferente de 2026.
2. `reconcileMls`: compara ambos os componentes em centavos, registra ausências,
   divergências e duplicados ambíguos; conserva as duas origens em uma observação.
3. `prepareMlsPilot`: recebe somente links revisados, reutiliza `assessReference`
   e `prepareContextualInput`; nunca aprova treinamento/publicação. Campos de
   direitos/contexto são afirmações para revisão, não verificação automática.
4. `planMlsSplits`: prévia determinística por clubes inteiros conectados por
   nomes completos conservadores; salários, OVR e ordem de entrada não definem
   a alocação. Nomes aqui agrupam para evitar vazamento, não criam IDs FutScout.

Uso offline, sem downloader ou acesso a banco: construir dois `Snapshot` com
URL, contentHash SHA256, edition reconciliada, declaredReferenceAt original,
observedAt real e rows. Rows oficial já extraídas e `parseMlsCsv(csvText)` usam
o mesmo contrato. Chamar `reconcileMls`, depois `prepareMlsPilot(result, links,
false)` enquanto o cutoff não estiver confirmado. Nunca incluir raw salaries,
links privados ou saída preparada no Git. Não executar o núcleo sintético com
registros reais nem relabelar a origem como SYNTHETIC.

O conjunto real foi materializado no workspace isolado em
`audit/output/mls-pilot-prepared.json` (não versionado nem publicado), junto
com os inputs congelados. Sem catálogo autorizado, as 916 linhas ficam em
quarentena e as divisões ativas são **0 treino / 0 validação / 0 teste**.
A prévia de grupos é **518 / 185 / 213** e não um dataset aprovado. Após revisão
de identidade, congelar splits novamente por Player.id/contexto real; repetição
do mesmo jogador em múltiplos registros é rejeitada pelo preparador atual.
Uma única edição não demonstra validação temporal futura nem generalização
para outra liga. Não flexibilizar os gates para preencher as divisões.

## Avaliação preparada, sem execução em dados reais

Plano incluído na saída: medianas de treino global e por liga/temporada como
baselines simples; na MLS de uma só edição podem coincidir, sem ganho presumido.
Calcular estatísticas apenas no treino; usar `contextual-evaluation.ts#pointMetrics`
para MAE EUR/semana, erro percentual absoluto mediano, erro log e viés assinado
nos mesmos conjuntos reservados. Comparar o v0.2 somente após autorização real.
Reportar erros e denominadores também nas faixas <100k e >=5m; manter extremos.
Limiares/suporte devem ser fixados antes do teste. Métricas reais e intervalos
permanecem **null**, não zero. Nenhum baseline foi ajustado aos salários reais.

FX histórico permanece pendente: depois de resolver o cutoff, anexar USD→EUR
datado, fonte, direção EUR por USD e precisão; `normalizeBase` existente faz /52.
Não substituir por câmbio atual, fixar uma taxa inventada ou converter garantido
em base. No conjunto bloqueado os montantes originais estão preservados.

## Menor desbloqueio

Obter confirmação aplicável da MLSPA para uso em treino/calibração comercial,
semântica bruta e cutoff 14/16 de abril. Em paralelo, disponibilizar no ambiente
de desenvolvimento um export offline autorizado com Player.id/source ID, DOB,
clube contratual/jogando, temporada e evidências temporais; reaproveitar os 93
vínculos existentes se seu artefato puder ser revisado. Nenhuma conexão Production
é necessária. Só então adicionar FX histórico e produzir divisões tecnicamente
elegíveis. Não construir outro trainer, modelo, API ou mecanismo de infraestrutura.

## Validação

13 regressões novas cobrem parsing, centavos, fontes dependentes, ausências,
conflitos, duplicidade, direitos/semântica/FX, identidade e splits sem vazamento.
Testes afetados rodam em `tests/unit/experiments/mlsWagePilot.test.ts` pelo gate
normal do projeto. Testes existentes de elegibilidade/contexto também são usados.
No ambiente Cloud, Git/npm via proxy estão indisponíveis; a base foi lida pelo
conector GitHub e os módulos foram materializados num diretório isolado.
Node 24 executa a cópia temporária com imports relativos .ts (somente nessa cópia).
TypeScript local tentou execução offline e retornou ENOTCACHED. Os gates remotos
e revisão humana são necessários antes de merge; não declarar CI verde sem resultado.

Sem treino, alteração do modelo aprovado, OVR no cálculo, EA como salário real,
Production, migration, API paga, compra, publicação ou merge automático.
