# Brack e ISL — decisão operacional individual autorizada

**AUTORIZAÇÃO OPERACIONAL RECEBIDA; EXECUÇÃO CONDICIONADA AOS GATES.** O proprietário declarou nesta tarefa: **“eu autorizo todas as logos e escudos estarem no site.”** Registro efetivo em `2026-09-24T14:21:36Z` (10:21:36, America/Cuiaba), referência auditável `owner-message:2026-09-24T14:21:36Z:all-logos-crests`. Esse é o horário de registro observado pelo agente; a mensagem não trouxe timestamp próprio. A instrução também autoriza publicação do SHA exato e cadastro pelo writer após validação. Para Brack/ISL, o aceite é aplicado somente às tuplas, URLs e hashes exatos abaixo, mantendo REVIEW_REQUIRED, storageUrl null e revogação individual. Não constitui licença de marca e não transforma as demais candidatas REVIEW em VERIFIED. Nenhuma execução foi realizada no momento deste registro.

## Escopo exato

| Campo | Brack | ISL |
|---|---|---|
| Referência individual autorizada | `FUTSCOUT-OFFICIAL-BRACK-20260924-v1` | `FUTSCOUT-OFFICIAL-ISL-20260924-v1` |
| League.id | `cmt9cdhm202ycukuc9eatc0la` | `cmtacvytc02r59guc438hbrlo` |
| provider | `official-brack-media` | `official-isl` |
| providerEntityId | `236618` | `static-assets/images/svg/isl-logo.svg?v=100.54` |
| sourceUrl | `https://d21buns5ku92am.cloudfront.net/69864/images/602591-RZ_BSL_Logo_Portrait_RGB-64e276-original-1753264028.png?download=1` | `https://www.indiansuperleague.com/static-assets/images/svg/isl-logo.svg?v=100.54` |
| SHA-256 | `9495ccc727eb8b6fffef811a77f0a1ea6f751bb848c4aac99116ec5a85a3c8ea` | `58e9824e6a3bc95081139c3fa64385994facc9e45feb59f93e8848e2bbaec884` |
| Conteúdo | PNG, 35259 bytes, 1044×1005, marca desde 2025/26 | SVG, 22329 bytes, 74×74, página da temporada 2025/26 |
| Evidência de procedência | `https://newsroom.brackalltron.ch/en/assets/236618/` | `https://www.indiansuperleague.com/standings/1000` |
| Entrega | `/api/brand-assets/brack` | `/api/brand-assets/isl` |
| Flag individual | `BRACK_BRAND_ASSET_DELIVERY_ENABLED` | `ISL_BRAND_ASSET_DELIVERY_ENABLED` |

As duas tuplas são `LEAGUE / LOGO`. Nenhuma é rotulada API-Football. Os IDs API 207/323 são somente evidência independente de competição. O escopo exclui A-League, Cyprus, ROSHN, clubes e futuras versões dos bytes.

## Aceite aplicado individualmente

As duas referências da tabela estão aprovadas pelo aceite registrado acima: permitir exibição remota dos bytes exatos acima sob responsabilidade operacional do FutScout, com `operationalDecision=OWNER_AUTHORIZED_REMOTE_USE`, `displayPolicy=DISPLAY_ALLOWED`, `rightsStatus=REVIEW_REQUIRED`, `storageUrl=null` e `revocable=true`. Identificar autor, data real e referência do aceite em `operationalAuthorizedAt`, `operationalDecisionRef`, `riskAcceptedAt`, `riskAcceptedBy`, `riskReason` e `operatorRiskAccepted=true`. Sem aceite, esses campos não devem ser preenchidos como aprovados.

Riscos a reconhecer: procedência pública não é licença; termos específicos de reprodução/entrega não foram comprovados. A origem pode negar hotlink, mudar bytes/URL ou retirar a imagem. A rota efetua download transitório em memória, não guarda cópias em storage/CDN, impõe `no-store`, prazo e limite de bytes/hash; não evita indisponibilidade nem revoga pixels já entregues. Até um GET e duas leituras por entrega; limite de 60/minuto e quatro em voo é por fonte/processo, não global. SVG tem riscos próprios: só os paths/atributos inspecionados são aceitos, com hash, CSP e nosniff, sem scripts/links/recursos externos nem injeção inline. Falha implica fallback, nunca URL alternativa não revisada.

Revogação individual: desligar a flag correspondente e revogar/bloquear o asset pelo mecanismo existente com estado/versão esperados. Confirmar 404/fallback e preservação do histórico. Não excluir identidades nem selecionar outra fonte para contornar BLOCKED/REVOKED. A autorização de uso das imagens não autoriza automaticamente um deploy nem a aceitação de outras regressões de release.

## Comandos preparados — não executados no banco

O runner é `scripts/officialLeagueOperation.ts`. Ele não carrega dotenv nem usa DATABASE_URL/DIRECT_URL do processo. Criar **fora do repositório**, com acesso restrito, um arquivo de conexão contendo `databaseId`, `consoleEvidenceRef` e `connectionString`. O ID permitido é Production `rknsog8tmbl5u4xqbogxfux5`. A conexão deve ser emitida/identificada no Console para esse ID. O runner valida a declaração, mas **não consegue provar remotamente o vínculo Console–credencial**: um hostname ou o preenchimento manual de databaseId não são prova. Esse gate humano é obrigatório antes de fornecer o arquivo. Não imprimir seu conteúdo.

PowerShell, a partir da raiz do projeto; substituir o caminho pelo arquivo restrito realmente confirmado:

```powershell
$connectionFile = 'C:\caminho-restrito\production-official-connection.json'
npx tsx scripts/officialLeagueOperation.ts preflight brack $connectionFile audit/output/brack-preflight-approved.json
Get-FileHash audit/output/brack-preflight-approved.json -Algorithm SHA256
```

Preflight usa exclusivamente `withPrismaReadOnly`: liga, identidades/assets de todos os provedores da liga, ocupação externa, histórico/checksums de todas as migrations, índices, hashes/contagens Club/League/Registry e Player. Sem requisição de imagem nessa fase. Conferir o recibo contra a evidência aprovada, inclusive índice parcial e as 40 logos preservadas. O comando falha diante de identidade existente, migration pendente/divergente ou índice ausente. Não sobrescreve recibo existente; usar nomes novos em uma nova leitura autorizada.

Com o aceite registrado acima, preparar arquivo JSON de aprovação individual fora do repositório com estes campos (não usar valores fictícios):

```text
approved: true SOMENTE após aceite
databaseId: rknsog8tmbl5u4xqbogxfux5
entityId/provider/providerEntityId/sourceUrl/contentHash: tupla exata da tabela
decisionRef: referência individual acima
approvedAt: instante ISO real
approvedBy: autor real do aceite
riskReason: descrição do risco remoto/termos pendentes aceito
preflightFile: caminho do recibo de leitura revisado
preflightSha256: SHA-256 completo desse recibo
```

Adicionar **somente** a tupla individual aprovada da allowlist proposta à allowlist ativa, em alteração revisada separadamente. A preparação atual continua inativa; tentar cadastro com o estado atual termina `ACTIVE_ALLOWLIST_REQUIRED`, antes da conexão. Aprovação ausente/falsa é recusada antes do cliente Prisma.

```powershell
# ESCRITA FUTURA — exige aprovação e todos os gates anteriores.
npx tsx scripts/officialLeagueOperation.ts register brack $connectionFile audit/output/brack-registration.json C:\caminho-restrito\brack-approval.json
# SOMENTE LEITURA — também é o único comando permitido após falha/indeterminação.
npx tsx scripts/officialLeagueOperation.ts confirm brack $connectionFile audit/output/brack-registration.json
```

`register` reconfere o preflight pinado e os hashes/estados, reserva marcador `.pending.json`, valida uma única requisição da imagem sem retry e salva o candidato exato em `.candidate.json`. Usa uma chamada ao writer transacional, com identidade/latestAsset/activeAsset esperados nulos, sem INSERT manual. Salva `.writer.json`, faz leitura independente e só publica recibo final por arquivo temporário no mesmo diretório + rename. O marcador pendente é preservado inclusive depois do sucesso. Falha de escrita/publicação do recibo não autoriza repetir a transação.

`confirm` não altera banco ou recibos; usa somente leitura. `EXPECTED_ASSET_PRESENT` significa que os campos exatos do candidato aparecem em identidade VERIFIED/asset ACTIVE. `NO_IDENTITY_PRESENT` não autoriza retry automático; investigar o recibo/resultado primeiro. `REVIEW_CURRENT_STATE` exige comparação manual de versões, conflito ou revogação. Nenhum resultado gera reversão automática. Saída de erro do runner é deliberadamente genérica para não revelar conexão; recibos contêm somente evidências não secretas.

Repetir **o fluxo completo**, com novo preflight e a referência aprovada ISL, somente depois da confirmação Brack; trocar `brack` por `isl` e usar arquivos distintos. O cadastro Brack altera legitimamente o hash do Registry, portanto não reutilizar seu baseline para ISL.

## Publicação e cobertura

Primeiro revisar/commitar o candidato e validar o SHA exato; então Preview/Production mediante autorização própria, com flags individuais desligadas. Preview não é homologação isolada. Após código compatível publicado, executar os cadastros individualmente, confirmar e habilitar cada flag autorizada. Verificar rotas, bytes e páginas públicas. Somente assim contar Brack 41/45 e ISL 42/45. As outras três permanecem fora do runner e das allowlists propostas/ativas.

Os oito testes estritos foram mantidos integralmente. A correção entrega HTML localizado completo antes do streaming, sem shell de recuperação. Executar contra o build do SHA candidato com configuração somente de leitura:

```powershell
$env:FUTSCOUT_SSR_TEST_ORIGIN = 'http://127.0.0.1:3053'
npx tsx --test tests/production/i18n404.test.ts
Remove-Item Env:FUTSCOUT_SSR_TEST_ORIGIN
```

Aceite registrado; nenhum comando de cadastro foi executado neste registro. A allowlist ativa ainda aguarda o preflight de Production. Flags individuais continuam desligadas por padrão. A liberação pública exige confirmação independente e inspeção da interface, além do aceite.
