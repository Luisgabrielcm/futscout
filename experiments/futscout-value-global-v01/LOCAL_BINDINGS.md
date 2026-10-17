# Vínculos privados Value

O código não contém IDs, requestIds, hashes de seleção/tentativa ou referências de
aprovação históricos. Os comandos operacionais carregam explicitamente
`audit/output/value-cloud-private/bindings.json`, coberto por `/audit/output/` no
`.gitignore`. Não há leitura automática no import dos módulos, busca de credenciais,
reconstrução de journal ou fallback para constantes antigas.

Formato JSON (todos os valores abaixo são sintéticos):

```json
{
  "schemaVersion": 1,
  "parentSelectionHash": "1111111111111111111111111111111111111111111111111111111111111111",
  "offlineSelectionHash": "2222222222222222222222222222222222222222222222222222222222222222",
  "quarantines": [{
    "selectionHash": "2222222222222222222222222222222222222222222222222222222222222222",
    "parentSelectionHash": "1111111111111111111111111111111111111111111111111111111111111111",
    "position": 2,
    "playerId": "synthetic-player",
    "requestId": "lfglobal-1111111111111111-synthetic-player-search",
    "originalRequestHash": "3333333333333333333333333333333333333333333333333333333333333333",
    "approvalReference": "synthetic-approval",
    "kind": "BALANCE",
    "extraManualSlot": false
  }]
}
```

Somente essas chaves são aceitas. Hashes são SHA-256 hex lowercase; seleções pai e
offline devem ser distintas. Posição é inteiro positivo. Identificadores/referências
aceitam letras, números, `_` e `-`, até 80 caracteres. RequestId deve corresponder
exatamente ao prefixo do hash pai, jogador e endpoint. Não há wildcard, URL,
credencial ou autorização implícita. `kind` aceita `SEARCH`, `PROFILE_503` ou
`BALANCE`; somente `PROFILE_503` admite sufixo `-profile`.

Cada entrada vincula a seleção exata, pai, posição, jogador, requestId, hash da
tentativa original e referência de aprovação. Não obter esses valores a partir
de uma tentativa nova nem gerar hashes substitutos. Copiar somente a autoridade
privada já aprovada e sua evidência local original. Entradas duplicadas ou
conflitantes são rejeitadas. No máximo 12 entradas, até três extensões manuais
(`extraManualSlot=true`, somente BALANCE); permanecem o limite base de cinco e
as verificações de frequência, integridade, cronologia, journal e orçamento.
Marcar uma extensão exige a aprovação privada correspondente, não apenas editar
um número para liberar execução.

Configuração ausente/ilegível ou malformada bloqueia os comandos dependentes antes
de abrir recursos externos. Uma quarentena manual sem entrada exata falha, inclusive
na retomada; um journal antigo não cria aprovação por conta própria. O runner puro
recebe um snapshot validado por `Dependencies.valueBindings`; testes injetam apenas
fixtures sintéticas. Auto-quarentena continua exigindo os opt-ins e evidências já
existentes, sem herdar aprovações manuais. `selectCurrent=false` permanece obrigatório
na preparação staging.

As tuplas completas anteriormente disponíveis no código foram preservadas apenas
no arquivo privado ignorado. Tuplas legadas incompletas não foram completadas com
valores inventados: exigem a evidência local original para criar uma entrada válida.
Sem ela, a operação correspondente fica bloqueada. Guardar o arquivo com acesso
restrito no host autorizado; nunca incluí-lo em commit, log, artefato CI ou PR.

O histórico desta branch foi reconstruído, com autorização do proprietário, em um
único commit sanitizado sobre a base atual de beta-next. Os commits antigos não
compõem a nova ancestralidade do PR. Isso não garante exclusão definitiva do
GitHub: referências antigas, caches e cópias podem manter os objetos acessíveis.
Nenhuma outra branch, tag ou configuração produtiva foi reescrita.
