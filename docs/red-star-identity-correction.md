# Red Star: correção executada e confirmada

Resultado efetivo (23/09/2026): `COMMITTED / INDEPENDENT_READ_CONFIRMED`, em uma única execução, com `retries=0`, no banco configurado para o localhost. Instante registrado no recibo: `2026-09-23T15:55:03.873Z`. O proprietário autorizou explicitamente nesta tarefa a execução da correção preparada, sem novo escudo, retry ou reversão automática. As precondições foram conferidas novamente dentro da transação Serializable, e a leitura independente após commit confirmou o estado esperado. Uma execução posterior de `verify` também retornou `CONFIRMED`. Não foi necessário usar `reconcile`; nenhuma reversão foi executada.

O preflight de execução coincidiu integralmente com o anterior, incluindo os mesmos 25 IDs de jogadores. Foram preservados `Club.id`, EA `111273`, liga `cmt9ekar7005c1suckjql1hd7` (Ligue 2 BKT), vínculos dos jogadores e hashes dos dados protegidos. Nenhuma identidade ou escudo foi criado para `104`, e a logo da Ligue 2 não foi cadastrada. Não houve sincronização ampla, push ou deploy.

Fallback confirmado visualmente no localhost após recarregar a página: perfil do Red Star FC, cartão no catálogo de clubes e vínculo do clube no perfil de Hacène Benali. O escudo incorreto deixou de aparecer; a Ligue 2 e os 25 jogadores continuaram exibidos.

Evidências locais, sem credenciais:

- Recibo final: `C:\Users\Antonio\AppData\Local\Temp\red-star-receipt-execute-20260923-final.json`.
- SHA-256 do recibo: `593798658e042b4a4ff7c7fedaf3e41258b0baa5a96301266eee7a696e66867f`.
- Preflight da execução: `C:\Users\Antonio\AppData\Local\Temp\red-star-plan-execute-20260923-final.json`.
- SHA-256 do preflight da execução: `82dba60a85e6a600bea50263890fc724f525a249e06d1257a348d20d4ad85a69`.

Os caminhos acima são evidências locais temporárias, não arquivos versionados. O estado anterior e a referência da correção também foram preservados no histórico da identidade no banco. Os comandos abaixo ficam como registro do procedimento; não repetir a escrita já concluída.

Preflight histórico `READ ONLY` confirmado em `2026-09-23T15:33:41.186Z`: ID então vigente 4396, EA 111273, liga esperada, 25 jogadores, identidade/asset versão 1, nenhuma outra ocupação de 104/4396 em Club/Registry. SHA-256 do JSON revisado: `e2f80a0b77bdd51226398fdc3cdc999e2158ee9e7294eee837c72068c409dcca`. Essa leitura não reservava 104; a transação voltou a conferir sua disponibilidade. A primeira tentativa de leitura no sandbox não concluiu; a leitura foi concluída com acesso de rede autorizado, sem retry de provedor ou de escrita.

## Escopo e controles existentes

| Registro | Estado antes da execução | Estado confirmado após correção |
| --- | --- | --- |
| Club `cmt9g1wkq037v1sucum6ntyxn` | EA `111273`, API `4396` | API `104`; EA preservada |
| Liga do clube | `cmt9ekar7005c1suckjql1hd7` (Ligue 2 BKT) | Mesmo ID |
| Jogadores | Os mesmos 25 IDs do preflight | IDs e dados preservados |
| Identidade `cmuczcaug0000dcuc8nlf6dn5` | `VERIFIED`, versão 1, provedor `4396` | `BLOCKED`, versão 2, provedor continua `4396` |
| Escudo `cmuczcaz60001dcucwvus8unq` | `ACTIVE`, versão 1, `OWNER_AUTHORIZED_REMOTE_USE`, `DISPLAY_ALLOWED` | Versão 2, `REVOKED`, `DISPLAY_BLOCKED` |

`ACTIVE` é o estado do ciclo de vida do asset e permanece preservado; não significa permissão de publicação. O leitor existente exige identidade `VERIFIED`; o pipeline visual também recusa `REVOKED`/`DISPLAY_BLOCKED`. A constraint SQL de revogação exige `DISPLAY_BLOCKED`. Nenhum registro é apagado ou reaproveitado para 104. `rightsStatus=REVIEW_REQUIRED`, `storageUrl=null`, URL, hash, datas e aceitação de risco originais permanecem intactos.

A decisão antiga do asset permanece `owner-decision:complete-club-crests-2026-09-22`. A referência gravada para a correção é `owner-decision:red-star-identity-correction-2026-09-23`, correspondente à autorização explícita do proprietário nesta tarefa. Referência, operador (`Codex - execucao explicitamente autorizada pelo proprietario nesta tarefa`), instante e fotografia anterior dos três registros foram guardados em `BrandAssetIdentity.evidence.correction`, junto da evidência antiga. O recibo local contém antes/depois e resultado de confirmação. A referência não concede licença de marca.

A allowlist remove apenas o par local/4396. Não adiciona 104. O writer existente rejeita ambos para esse clube. A identidade bloqueada conserva também a reserva única histórica de 4396. A logo da Ligue 2, API `62`, não faz parte desta operação.

## Protocolo transacional

1. Preflight em transação explicitamente `READ ONLY`: fotografar os três registros, todos os IDs dos jogadores e assets associados; exigir estados/versões acima, ausência de outro proprietário para 104 e 4396 em Club/Registry e ausência de outra identidade do clube. Confirmar que a imagem legada não pode ultrapassar o fallback.
2. Revisar o JSON e fixar seu SHA-256. O hash detecta mudança do arquivo depois da revisão; não é uma assinatura nem substitui a autorização do operador. O preflight não chama API-Football nem baixa imagem.
3. Reservar marcador exclusivo `red-star-pending-v2` (`wx`, flush e fechamento antes de conectar), contendo os estados anterior e esperado completos, operador, decisão e instante exato a usar na transação. Na transação `Serializable`, reler e comparar exatamente com a fotografia aprovada. Club não tem versão: exigir `updatedAt`, EA, liga e ID atual; identidade/asset exigem versão, estado e `updatedAt` esperados. Confirmar novamente os proprietários.
4. Executar somente três `updateMany` com compare-and-set; cada um deve afetar exatamente uma linha. Atualizar ID do clube, bloquear identidade, revogar asset, nessa ordem. Sem INSERT/DELETE, retry ou alteração de jogadores.
5. Ainda na transação, reler e comparar exatamente com o resultado previsto. Divergência lança erro e causa rollback integral, inclusive das alterações anteriores. Hashes de Player, League, outros Club e demais registros do Registry devem permanecer iguais. Essas leituras são abrangentes e conservadoras: atividade concorrente pode exigir um novo preflight, nunca repetição automática de escrita.
6. Após commit, executar outra leitura `READ ONLY`. Só retornar `COMMITTED` quando ela coincidir. Falha de confirmação retorna `CONFIRMATION_FAILED`; erro de transporte após o callback pode retornar `INDETERMINATE_COMMIT`. Em ambos, parar e reconciliar somente por leitura. Nunca alegar rollback nem repetir automaticamente nesses casos.
7. Gravar o recibo final em temporário exclusivo no mesmo diretório, completar a gravação, executar flush e fechar. Publicar por `rename` substituindo atomicamente o marcador. Não truncar/apagar o marcador antes da publicação, não usar alternativa de delete seguido de rename e não repetir automaticamente. Falha de gravação/publicação preserva o marcador completo e o temporário para diagnóstico. A reconciliação usa o marcador, não o temporário parcial. A garantia depende do rename atômico do filesystem local; não usar compartilhamentos de rede para os recibos.

Os testes usam um store transacional simulado para conflitos, falhas parciais, rollback, readback, incerteza de commit, reconciliação e reversão para null; não constituem execução de integração no banco real. Os testes do recibo usam arquivos temporários reais, com falhas injetadas durante gravação/publicação, verificando a preservação do marcador, reconciliação após a falha e substituição bem-sucedida.

## Procedimento de execução preservado para auditoria — não repetir

PowerShell, na raiz do projeto, branch `beta-next`. Não execute sincronizadores durante a janela. Use o `.env` existente, sem imprimi-lo ou editar variáveis do ambiente. Os arquivos abaixo ficam no diretório temporário, fora do repositório; preserve-os como evidência operacional.

```powershell
git status --short
git diff --check
$redStarStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$redStarPlan = Join-Path $env:TEMP "red-star-plan-$redStarStamp.json"
$redStarReceipt = Join-Path $env:TEMP "red-star-receipt-$redStarStamp.json"
node --env-file=.env --import tsx scripts/redStarCorrection.ts --mode preflight --out $redStarPlan
Get-Content -LiteralPath $redStarPlan
$redStarPlanHash = (Get-FileHash -LiteralPath $redStarPlan -Algorithm SHA256).Hash.ToLowerInvariant()
```

Pare se o preflight falhar ou divergir da auditoria. Verifique EA `111273`, liga esperada, versões 1, os 25 jogadores e listas de conflitos vazias. Registre a autorização de execução e o nome real do operador antes de substituir `OPERADOR_IDENTIFICADO` abaixo. A referência deve apontar para essa decisão rastreável; o texto proposto sozinho não comprova autorização.

```powershell
node --env-file=.env --import tsx scripts/redStarCorrection.ts --mode execute --input $redStarPlan --sha256 $redStarPlanHash --out $redStarReceipt --actor 'OPERADOR_IDENTIFICADO' --decision 'owner-decision:red-star-identity-correction-2026-09-23' --confirm RED_STAR_4396_TO_104
Get-Content -LiteralPath $redStarReceipt
$redStarReceiptHash = (Get-FileHash -LiteralPath $redStarReceipt -Algorithm SHA256).Hash.ToLowerInvariant()
node --env-file=.env --import tsx scripts/redStarCorrection.ts --mode verify --input $redStarReceipt --sha256 $redStarReceiptHash
```

`verify` só aceita recibo com resultado `COMMITTED` e compara todos os campos, a liga, os mesmos IDs de jogadores e hashes protegidos. Se houver recibo pendente, commit indeterminado ou falha de confirmação, preserve o arquivo e use `reconcile`, abaixo; não use `execute` novamente. Mudanças legítimas posteriores também podem fazer `verify` falhar: investigar, não desfazer automaticamente.

## Reconciliação somente leitura

Use o mesmo caminho do recibo, que conterá o marcador completo se a publicação falhou, ou o recibo final com `INDETERMINATE_COMMIT`/`CONFIRMATION_FAILED`. Inspecione o arquivo e fixe seu hash atual antes da leitura. O comando não grava relatório, não modifica o recibo, não chama API, não promove seu status a COMMITTED e não repete a transação. O banco é lido com `SET TRANSACTION READ ONLY`. A saída JSON vai somente para stdout.

```powershell
Get-Content -LiteralPath $redStarReceipt
$redStarReconcileHash = (Get-FileHash -LiteralPath $redStarReceipt -Algorithm SHA256).Hash.ToLowerInvariant()
node --env-file=.env --import tsx scripts/redStarCorrection.ts --mode reconcile --input $redStarReceipt --sha256 $redStarReconcileHash
$LASTEXITCODE
```

| Resultado | Exit code | Interpretação e ação |
| --- | --- | --- |
| `MATCHES_EXPECTED` | 0 | Estado atual coincide integralmente com o esperado. A operação é observável no banco, mas a leitura não prova o histórico do commit nem altera o recibo. Registrar a conclusão em evidência separada; não repetir a escrita. |
| `MATCHES_BEFORE` | 2 | Estado atual coincide integralmente com o anterior. Não é prova histórica de rollback; não repetir automaticamente. Revisar o incidente antes de qualquer nova autorização. |
| `DIVERGED` | 3 | Estado não coincide integralmente com nenhum dos dois. Parar; usar `matches` por campo para localizar diferenças em clube, identidade, escudo, jogadores, assets, conflitos ou hash protegido. Não escrever/reverter automaticamente. |
| Erro de leitura/entrada | 1 | Sem conclusão. Preservar evidências e investigar conexão/arquivo. Marcadores legados v1 sem fotografias são recusados, nunca tratados como confirmação. |

O hash protegido abrange outros dados: atividade legítima posterior pode produzir `DIVERGED` mesmo que a correção do clube tenha ocorrido. Não relaxar comparações para forçar confirmação. `reverse` continua exigindo recibo originalmente `COMMITTED`; após resultado indeterminado, a reconciliação informa o estado, mas uma eventual compensação requer uma preparação separada e revisada, sem editar artificialmente o status do recibo.

Para reconciliar uma reversão, use o mesmo comando substituindo `$redStarReceipt` por `$redStarReverseReceipt` e calculando o hash desse arquivo. O estado esperado dessa operação contém `apiFootballId=null`.

Após confirmação, reinicie o processo local que possa manter o resolvedor de clubes em memória, sem rodar sincronização. Abra `http://localhost:3000/pt/clubes/red-star-fc` e a lista de clubes. Faça recarga completa; confirme Ligue 2 BKT, mesmos jogadores e ícone de fallback. Inspecione a rede: nenhuma requisição de escudo `teams/4396.png` ou `teams/104.png` deve nascer dessa renderização. A identidade bloqueada não é retornada por `brandAssetReadService`; o `imageUrl` legado da EA contém `player-shields`, já rejeitado por `visualAssets`. `ClubBadge` então usa `BrandAssetFallback`. Inspecione também um cartão de jogador desse clube. Nenhum cache persistente deve ser apagado. Finalize com `git status --short`.

## Reversão controlada

Antes do commit, qualquer divergência causa rollback integral automático. Depois de um commit confirmado, a compensação abaixo deixa **Club.apiFootballId=null**, mantendo identidade 4396 bloqueada e escudo revogado. O schema permite `Int? @unique`, portanto não exige migration. Nunca restaura a associação incorreta 4396. Preserva EA, liga, jogadores e histórico. Não é uma restauração da autorização visual e só deve ser usada com decisão explícita. Mantenha sincronizadores/matchers suspensos até uma nova associação revisada: null significa pendência, não uma proibição global de matching automático.

A compensação exige recibo confirmado intacto, estado atual exatamente igual ao pós-correção, nenhum novo proprietário de 104/4396 e nova referência de decisão. Incrementa a versão da identidade para 3 e acrescenta histórico de reversão; mantém o asset na versão 2, revogado. Também confirma dentro e depois da transação. Se houve qualquer alteração posterior, para sem sobrescrever. Não restaura timestamps/versões antigos nem reativa escudo. A fotografia completa anterior fica preservada para auditoria.

```powershell
$redStarReverseReceipt = Join-Path $env:TEMP "red-star-reversal-$redStarStamp.json"
node --env-file=.env --import tsx scripts/redStarCorrection.ts --mode reverse --input $redStarReceipt --sha256 $redStarReceiptHash --out $redStarReverseReceipt --actor 'OPERADOR_IDENTIFICADO' --decision 'REFERENCIA_DA_DECISAO_DE_REVERSAO' --confirm CLEAR_PROVIDER_ID_KEEP_CREST_BLOCKED
$redStarReverseHash = (Get-FileHash -LiteralPath $redStarReverseReceipt -Algorithm SHA256).Hash.ToLowerInvariant()
node --env-file=.env --import tsx scripts/redStarCorrection.ts --mode verify --input $redStarReverseReceipt --sha256 $redStarReverseHash
```
