# FUTSCOUT_WAGE_CALIBRATION_SOURCES_01

Resultado: **BLOCKED** — 2026-10-19.
Base revisada: `beta-next` em `f709fa1e8cb1c2246c6890840496333b443d38d5`.
Novas referências comprovadamente elegíveis: **0**. Novos jogadores cobertos: **0**.
Custo de novas APIs contratado/consumido: **R$ 0/mês**; teto permanece R$ 100/mês.

## Decisão e cobertura

Priorizar MLSPA, sem assinatura nova, aproveitando o inventário de 93 identidades
HIGH já documentado. Não repetir matching nem reconstruir o modelo. Os 93 são
referências históricas candidatas (80 de expansão + 13 Atlanta), não salários
liberados. A tarefa não acessou os arquivos privados nem presumiu sua integridade
ou overlap com outros conjuntos.

Revisados: `method.json`, `method-contextual-v02.json`,
`reference-eligibility.ts`, `contextual-input.ts`,
`CONTEXTUAL_EVALUATION_V01.md`, `docs/wage-public-presentation.md` e
`docs/player-data-completeness-01.md`.
O alvo aprovado continua EUR/GROSS/BASE/WEEK; OVR não entra no modelo contextual.
O trainer real não existe no caminho autorizado: o núcleo/evaluation permanece
sintético. Nenhum treino, inferência real, publicação ou novo loader foi executado.

## Fontes e evidências consultadas

| Fonte | Disponibilidade / natureza | Custo incremental | Direitos e decisão |
| --- | --- | --- | --- |
| [MLSPA primária](https://mlsplayers.org/resources/salary-guide) | MLS, edição 2026 com referência declarada 16/04/2026; USD anual, base separada de compensação garantida; divulgação primária, não estimativa de um agregador | Consulta pública gratuita; nenhuma API comprada | Melhor candidata. Não foi localizada nesta consulta uma concessão documentada de treino/calibração comercial da fonte primária. A descrição consultada não confirma explicitamente GROSS. Não marcar direitos/semântica CONFIRMED. |
| [Data Is Plural — MLS](https://github.com/data-is-plural/mls-salaries) | Diretório inspecionado contém 2007–2017; CSV 2017 tem 616 linhas de dados, nome/clube/posição/base/garantido. USD/ano deve ser reconciliado com o PDF da edição; sem DOB/ID FutScout ou data efetiva por linha | R$ 0 por CSV público | README concede CC BY 4.0 aos CSVs e MIT ao código: são licenças distintas. Candidata real de baixo custo para histórico, não cobertura 2026. Exige atribuição, link e indicação de alterações; semântica/edição/identidade ainda impedem elegibilidade. |
| [Pitfalls on the Pathway](https://ericdoesit.github.io/youth-soccer-analysis/report/data.html) / [CSV](https://github.com/ericdoesit/youth-soccer-analysis/blob/main/data/mls_player_salaries_2026.csv) | 916 linhas de dados verificadas no CSV, campos base_salary/guaranteed_comp/year e nomes/clube/posição; página declara 30 clubes e edição setembro/2026 | R$ 0 por CSV público | CC0 declarada pelo compilador. A referência setembro conflita com abril na página primária consultada: fixar o PDF/edição exato antes de usar. 916 linhas não são 916 identidades únicas validadas nem elegíveis. |
| [American Soccer Analysis](https://app.americansocceranalysis.com/api/v1/__docs__/) / [Team Builder](https://teambuilder.americansocceranalysis.com/) | Interface pública e ferramenta MLS derivada de MLSPA; potencial apoio de IDs/contexto, não fonte salarial independente | Documentação/consulta pública sem contratação; preço/SLA/licença de treino não confirmados | Não confundir licença do wrapper com licença dos salários. Não foi chamado endpoint de dados nem criada dependência de API. |
| [SalarySport](https://salarysport.com/about-us/) | Diversas ligas, salários básicos compilados de publicações/insiders/bases; período/moeda e natureza precisam de prova por registro | Leitura pública gratuita; licença/API comercial sem cotação verificada | Reutiliza conclusão de method.json: gross/net, efetividade e direitos comerciais não comprovados. Tratar como relato/estimativa de terceiro sem verificação individual; não como salário observado só porque há um número. |
| [KAP / comunicado oficial Galatasaray](https://www.galatasaray.org/en/haber/football/victor-osimhen-joins-galatasaray/58215) | Exemplo Süper Lig, contrato desde 2025/26, EUR por temporada; separa remuneração líquida, bônus e imagem | Consulta pública gratuita | Evidência primária útil para natureza/contexto, mas NET é incompatível com GROSS/BASE. Não aplicar gross-up, somar bônus ou inferir direito de treino. |
| Capology | Descartada por custo conforme decisão do usuário | Nenhuma contratação | Não reabrir compra nem substituir por cópia de suas estimativas em outro site. |

Contagem CSV 2017: blob `7e6b8299d287e3c9316c77cb03abaaa008dccfc7`.
CSV 2026: blob `ff94b1193b80043e4d84028241dd79927b90738f`.
Contagens são linhas não vazias após o cabeçalho; não são cobertura de produção,
pessoas deduplicadas ou amostras independentes. Não somar 616, 916 e 93.

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) permite adaptação e uso
comercial sob condições; não é necessário inventar uma exigência de que a licença
contenha a palavra “IA”. [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
também permite reutilização. Essas declarações são evidência positiva sobre os
direitos concedidos pelos compiladores, não prova automática de todos os direitos
da fonte original. Registrar o escopo aplicável e eventuais direitos de terceiros;
a ausência de licença primária encontrada aqui não é uma conclusão de proibição.

## Piloto documental selecionado — não dataset de calibração

Dois candidatos MLS/Atlanta em 2026, sem valores salariais republicados:

| Candidato | Identidade externa verificável | Contexto e proveniência |
| --- | --- | --- |
| Miguel Almirón | [Perfil oficial](https://www.atlutd.com/players/miguel-almiron/), DOB 10/02/1994 | Contratação em 30/01/2025, contrato até temporada 2027; linha salarial na MLSPA com referência declarada 16/04/2026 |
| Steven Alzate | [Perfil oficial](https://www.atlutd.com/players/steven-alzate/), DOB 08/09/1998 | Contratação em 04/08/2025, contrato até temporada 2030; linha salarial na mesma página MLSPA |

A seleção demonstra que há candidatos reais com evidência externa, não associação
HIGH a Player.id. Os IDs FutScout, pagador/clube contratual, situação em 16/04,
posição histórica e datas efetivas do salário precisam da evidência original.
Data de contratação não é data efetiva do montante; consulta em 19/10 não prova
disponibilidade no passado. Manter direitos e tax basis desconhecidos até revisão.
Não inventar IDs, datas, FX ou valores para satisfazer assessReference.
Esses dois candidatos não bastam para splits por múltiplos clubes ou generalização
entre ligas. Não assumir que pertencem ao inventário privado de 93 sem reconciliação.

## Menor dependência concreta e próximo incremento

Primeiro desbloqueio externo: obter da MLSPA uma resposta/documento aplicável à
edição de 16/04/2026 confirmando (a) permissão para guardar/normalizar e usar os
rótulos em treino/calibração comercial e (b) se Annualized Base Salary é bruto,
com exclusões/componentes e referência temporal. Sem enviar contato nesta tarefa.
Pedido preparado: “Podemos usar os salários-base da edição 16/04/2026 para
calibração e avaliação comercial do FutScout, mantendo proveniência e sem
redistribuir registros? Quais condições/atribuição se aplicam? O campo é bruto,
antes de impostos, e qual a data efetiva representada?” Publicação deve ser
consultada separadamente e não é requisito presumido para uso interno autorizado.

Em paralelo, revisar a licença CC BY do arquivo histórico exato como alternativa
documentada; não pedir nova infraestrutura nem assinatura. Permissão de uso não
resolve, sozinha, salário bruto ou alinhamento temporal.

Após essa evidência, próximo incremento: preparar um lote offline pequeno das 93
referências já existentes usando `assessReference` → `prepareContextualInput`,
preservando base e garantido separados, valores originais, moeda/unidade,
sourceReference, direitos e evidência, identidade HIGH, clube/temporada,
effectiveAt/referenceAt/observedAt e FX USD→EUR datado não posterior à referência.
Reutilizar `normalizeBase` (/52) e hashes existentes. Usar DOB/posição reais;
contexto econômico ausente permanece null. Não construir outro mecanismo de ingestão.
Só referências OBSERVED comprovadas compõem o piloto observado; estimativas ficam
separadas. Relatar elegíveis/rejeitadas e cobertura por clube/liga/posição.
Não treinar: autorização de execução e protocolo/limiares pré-declarados continuam
separados; MLS não valida outras ligas. Reutilizar o protocolo contextual existente.

## Verificação e limites de execução

O proxy de rede do shell falhou ao buscar origin/beta-next. A revisão e o commit
documental usam o conector GitHub, fixando a base acima; não foi alegado checkout
local atualizado. Nenhum dado privado ou credencial foi lido.
Em cópia temporária dos módulos desse commit, Node 24 executou diretamente os
testes existentes: 13 reference-eligibility + 8 contextual-input, **21 aprovados**.
Apenas os imports relativos ganharam extensão .ts nessa cópia temporária para o
Node nativo; nenhum fonte/teste do repositório foi alterado. Não foi chamado trainer
nem o harness de inferência OVR histórico. Testes sintéticos não validam direitos.
TypeScript completo não executou: tentativa offline de npx tsc --noEmit retornou
ENOTCACHED, sem dependências instaladas. Quality gates remoto e revisão humana
continuam obrigatórios antes de merge; não declarar CI verde antecipadamente.

Entrega restrita a este relatório de decisão e evidências: sem modelo alterado,
loader, banco, migration, API paga, deploy ou publicação de salário.
