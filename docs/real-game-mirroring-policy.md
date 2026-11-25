# Espelhamento da Vida real na projeção FutScout

Decisão aprovada pelo proprietário em 25/11/2026. Este registro define a regra
para a projeção FutScout do videogame; sua documentação não executa publicação,
altera dados ou habilita automações de escrita.

## Regra

O elenco projetado pelo FutScout acompanha os dados reais selecionados e
publicados para a mesma identidade EA:

| Informação | Projeção FutScout GAME |
| --- | --- |
| Clube atual | Mesmo clube REAL, sujeito à política de disponibilidade, licenciamento e convocação aprovada. |
| Empréstimo | Mesmo destino, clube de origem e situação documentada; o contrato principal continua separado do empréstimo. |
| Salário | Mesmo valor publicado para o futebol real, preservando moeda, periodicidade, fonte e classificação. Conversões usam somente a normalização já validada. |
| Contrato principal | Mesmo término publicado, preservando a precisão disponível: dia, mês, ano ou temporada. Não inventar um dia para um ano conhecido. |
| Cláusula | Quando publicada como existente, reproduzir seu valor e as condições documentadas. Preservar separadamente ausência explicitamente registrada e situação desconhecida. |

Uma atualização comprovada de REAL deve gerar a proposta GAME correspondente
para os campos elegíveis. Um campo ainda desconhecido fica pendente sem impedir
o aproveitamento independente dos demais. Ausência de evidência não vira zero,
fim de contrato, agente livre ou ausência de cláusula.

Estimativas publicadas continuam identificadas como estimativas; duração e
cláusula hipotéticas continuam no contexto de simulação. Esses valores não
passam a representar remuneração ou obrigação contratual comprovada.

## Representação e preservação

- A seleção nacional é independente do clube. Para as exceções envolvendo
  destinos sem elenco licenciado, manter a regra aprovada de presença no jogo
  e conferência das duas últimas convocações; não presumir FREE_AGENT somente
  pelo país, nome do clube, escudo ou uniforme.
- Clubes parcialmente licenciados exigem decisão individual. REAL comprovado
  pode continuar publicado mesmo com GAME em revisão.
- A projeção deve ser identificada como atualização FutScout. O squad original
  EA permanece histórico separado; nenhuma alteração é atribuída à EA.
- Preservar edições manuais e sua precedência. Conflitos entre valores novos e
  decisões publicadas exigem reconciliação, sem sobrescrita silenciosa.
- Não modificar Player.clubId, valores de mercado, potenciais, identidade,
  históricos ou seleções nacionais para executar o espelhamento.

## Compatibilidade e publicação

Não editar retroativamente realGamePolicy, seu hash ou os payloads congelados:
essas referências autenticam seleções já publicadas. A ampliação econômica deve
ser implementada como extensão versionada dos leitores e do planejador,
reutilizando os leitores econômicos existentes e consultas em lote.

O perfil GAME já consulta os registros econômicos publicados de pesquisa e as
edições manuais. Este fato não comprova que todos os jogadores tenham os quatro
campos preenchidos, nem que a apresentação econômica REAL/GAME esteja unificada
em todas as superfícies. A implementação deve verificar essas diferenças antes
de declarar o espelhamento completo.

Publicações futuras continuam exigindo pacote definido, hashes, versões,
idempotência, validação isolada, rollback e autorização operacional específica.
Esta decisão não inicia uma nova publicação ou varredura do catálogo.

Manter beta-next: false, as estimativas existentes e MODEL_B_CONSENT_GAP aberto.
