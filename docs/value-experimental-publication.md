# FutScout Value v1 — política experimental

Decisão: `FUTSCOUT_VALUE_EXPERIMENTAL_PUBLICATION_POLICY_01`.
`value-experimental-publication-v1` aceita explicitamente o risco de precisão de
D1_FULL_CONTEXT, B_PARTIAL_CONTEXT e B_BOUNDED_DOMAIN_EXTRAPOLATION. Isso não
altera qualityApproved=false, direitos UNKNOWN, dados congelados ou os resultados
históricos de `value-publication-decision-v1`.

A decisão de produto, o fundamento contratual, as retenções individuais e a
seleção de Current são controles separados. Não existe grant contratual revisado
para as estimativas. Logo, a política experimental continua retornando
MODEL_COMMERCIAL_RIGHTS_UNKNOWN, inclusive se o chamador falsificar flags de
aprovação. Retenções de identidade, atividade e revisão permanecem efetivas.

O registro documental existente é `experiments/futscout-value-v01/README.md`,
seção License gate: não comprova os escopos de treinamento/calibração, retenção
dos parâmetros e comercialização/publicação das estimativas derivadas. Para
resolver esse gate é necessário anexar confirmação escrita contratual aplicável
do fornecedor, cobrindo esses escopos e a retenção após término da assinatura.
Não se trata de conclusão de que o uso é proibido; a autorização não foi comprovada.

## Preparação local

`node --import tsx scripts/prepareValuePublicActivation.ts --experimental-policy`

Gera manifesto privado determinístico separado da decisão histórica. Não acessa
Production. O plano continua não executável enquanto não houver registros
elegíveis e paridade do leitor, filtros e listagens para esses registros.

## Seletor transacional

`selectExistingEconomicCurrent` em `services/playerEconomicPersistence.ts`
seleciona somente uma observação existente efetivamente elegível. Reavalia política
e retenções, identidade EA, conteúdo, valor e estado dentro de transação
Serializable, usando o controle de manutenção existente e CAS de Current.
Não escreve State/Observation. Nunca substitui Current positivo Live Football.

O chamador deve guardar duravelmente Current anterior e comando antes da operação.
O hash do comando é persistido em selectionReason e retornado no recibo. Retomada
reconhece seleção idêntica; resultado incerto exige read-back antes de repetir.
REVERSE exige o mesmo comando, autorização de reversão e Current ainda pertencente
à operação. Restaura o ponteiro anterior com revisão monotônica ou remove somente
a seleção criada quando não havia Current. Outro writer implica conflito, não
sobrescrita. O CLI durável está documentado em `value-durable-publication.md`.
Não há promoção automática.

Os testes de promoção/reversão usam observações Live Football sintéticas elegíveis;
nenhuma licença fictícia é concedida a estimativas para fazer testes passarem.
O leitor público e as consultas de filtro continuam aceitando somente o escopo
atualmente permitido. A interface mantém um único marketValue.

## Evidência posterior e decisão de apresentação

`value-supplier-notice-v1` utiliza a autorização de publicação fornecida pelo
diretor, atribuída ao fornecedor, limitada aos hashes congelados registrados em
`estimatePublicationScope.json`. O texto original permanece privado e não foi
autenticado independentemente. Direitos continuam UNKNOWN e aprovação estatística
continua ausente. A interpretação interna inicial exigia a nota “Dados estatísticos
estimados”. A resolução documental NOTICE_UNRESOLVED não demonstrou condição
expressa nem dispensa contratual: “reinforce the importance of maintaining a
footnote” não esclarece se a aprovação depende da nota.

Na decisão `FUTSCOUT_VALUE_V1_FINAL_RELEASE`, o proprietário aceitou explicitamente
o risco dessa ambiguidade e autorizou a apresentação sem nota. `requiredNotice=false`
agora registra essa decisão interna documentada, sem afirmar dispensa pelo fornecedor,
direitos adicionais ou validação estatística. O texto original e seu hash permanecem
preservados. Uma condição vinculante posteriormente comprovada exige revisão desta
decisão antes da publicação. A mudança visual não modifica hashes elegíveis, retenções,
Current ou observações econômicas.
A política anterior descrita acima permanece inalterada; retenções individuais
continuam bloqueando promoção. A preparação posterior tem 16.210 elegíveis,
12.264 comandos de promoção e 18 retenções. O executor durável revalida política,
identidade, before-image e conteúdo; não transforma aprovação de produto em licença.
