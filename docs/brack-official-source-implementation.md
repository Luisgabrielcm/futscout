# Brack: suporte técnico sem cadastro

Branch `beta-next`, baseado em `d0deb614fa2a79ff6cd9e4a1385d561f38fe4dc7`. Nenhum banco foi consultado ou alterado nesta implementação; staging não foi necessário. Nenhuma imagem nova foi baixada. Usou-se uma cópia de teste dos bytes já auditados, fora de `public`, sem URL de storage. Direitos continuam em revisão.

## Contrato implementado

`lib/brackBrandSource.ts` fixa League.id `cmt9cdhm202ycukuc9eatc0la`, provedor `official-brack-media`, providerEntityId `236618`, tipo LOGO, URL completa e hash `9495ccc727eb8b6fffef811a77f0a1ea6f751bb848c4aac99116ec5a85a3c8ea`. `236618` identifica o item oficial do media kit, não uma competição API-Football. Evidência: https://newsroom.brackalltron.ch/en/assets/236618/ ; versão 2025/26.

URL única: `https://d21buns5ku92am.cloudfront.net/69864/images/602591-RZ_BSL_Logo_Portrait_RGB-64e276-original-1753264028.png?download=1`.

- Writer: fonte exata, `REVIEW_REQUIRED`, `storageUrl=null`; os controles de autorização operacional e versão existentes permanecem. Dentro da transação Serializable verifica também bloqueio/revogação em qualquer provedor dessa liga. Adaptador sem esse controle é rejeitado para Brack. Registra página, temporada e hash na evidência da identidade.
- A allowlist de produção permanece **614 identidades: 574 clubes e 40 ligas**. Brack está fora; invocar o writer com ela hoje retorna `AUTHORIZATION_MISMATCH / NOT_STARTED`. Os testes de escrita usam autorização exclusivamente sintética em memória, restaurada após o teste.
- Reader: para Brack inclui identidades de todos os estados e histórico de assets. Qualquer identidade BLOCKED ou logo com direitos BLOCKED, decisão REVOKED ou DISPLAY_BLOCKED veta a exibição, inclusive histórico STALE. Só seleciona uma identidade VERIFIED oficial exata com um LOGO ACTIVE. Não tenta API 207 nem outro provedor em caso de falha, ausência ou veto.
- Para as 40 ligas atuais continua selecionando API-Football. Duplicidade inesperada de identidades ou assets ativos gera fallback; não vence a última linha retornada pelo banco. Histórico bloqueado do Red Star não interfere no escudo atual, pois o veto entre provedores foi limitado à liga Brack.
- Pipeline exige tupla, URL e hash exatos e retorna `/api/brand-assets/brack`, nunca a URL CloudFront. Rejeita a URL Brack bruta sem procedência e os metadados falsamente rotulados API-Football. Mantém autorização, kill switches e fallback existentes.
- A rota GET, dinâmica em Node, consulta a seleção autorizada antes e depois da coleta. Rejeita query string, não aceita URL arbitrária e faz uma única requisição com `redirect: manual`, `cache: no-store` e timeout de 8 segundos. **Todos os redirects são rejeitados**, mesmo para o mesmo host. Valida HTTP 200, URL final, MIME PNG, 35.259 bytes (com limite durante streaming), assinatura PNG, IHDR 1044×1005 e SHA-256. Qualquer diferença produz erro sem bytes de imagem e sem retry.
- A resposta tem `private, no-store, max-age=0`, `nosniff` e CSP restritiva. Não há arquivo persistido, Next Image cache nem alteração de storageUrl. Os bytes passam apenas pela memória do processo. Revogação é reavaliada a cada nova requisição e após o fetch; não é possível retirar pixels já recebidos pelo navegador ou eliminar a janela entre a última leitura e o envio.
- Não houve mudança de schema, migrations, CSS, `next.config.ts` ou no tratamento das outras quatro ligas. O PNG já contém fundo branco; `object-fit: contain` preserva a composição nos tamanhos existentes. Não há novo wildcard de host, habilitação SVG ou alteração global de redirects das imagens API-Sports.

Documentação local consultada: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md` (remotePatterns, redirects, SVG) e `01-app/03-api-reference/03-file-conventions/route.md`. A rota própria evita que o otimizador siga redirects não revalidados ou mantenha cópias após revogação.

## Procedimento posterior: publicar código antes de cadastrar

1. Revisar este diff e os resultados dos testes. O commit do suporte técnico foi autorizado na revisão final; push/deploy permanecem para autorização posterior. Não aplicar migration: schema já suporta o provedor.
2. Publicar este código **com a allowlist atual**, sem Brack. Confirmar a revisão implantada, a rota GET `/api/brand-assets/brack` retornando 404 sem asset autorizado e as 40 logos atuais no catálogo. Uma falha de leitura retorna 502 e deve ser investigada, não tratada como ausência autorizada.
3. Aprovar uma decisão operacional específica para a tupla oficial e hash acima, identificando operador, data UTC real, motivo, fonte/termos e revogação individual. Manter `rightsStatus=REVIEW_REQUIRED`, `OWNER_AUTHORIZED_REMOTE_USE`, `DISPLAY_ALLOWED`, `storageUrl=null`, `revocable=true`. Isso não constitui licença. A decisão das ligas API-Football não é reutilizável.
4. Em mudança separada e revisável adicionar **somente** `{ entityType: "LEAGUE", entityId: "cmt9cdhm202ycukuc9eatc0la", provider: "official-brack-media", providerEntityId: "236618", assetType: "LOGO" }` à allowlist do writer autorizado. Atualizar os testes de contagem e exclusão de Brack nessa etapa. A implantação do suporte técnico deve preceder a transação; o reader não depende da allowlist de escrita para servir um registro autorizado.
5. Identificar no Console a conexão isolada do database ID desejado. Para Production exigir `rknsog8tmbl5u4xqbogxfux5`; não reutilizar `.env` antigo ou tratar destino incerto como staging. Ler estado/versões, liga local, ocupação de `official-brack-media / 236618`, quaisquer identidades/bloqueios/revogações dessa liga, histórico Prisma e hashes protegidos. Parar diante de conflito. Não remover histórico para contornar o veto.
6. Executar `fetchBrackBytes()` uma vez no preflight autorizado, sem retry: o próprio método valida os bytes e o hash fixado. Preencher `fetchedAt` real e `deliveryStatus=VALIDATED` somente se passar. Montar `BrandAssetCandidate` com o contrato acima e os campos de autorização completos da decisão real; obter `BrandExpectedState` atualizado.
7. Chamar **uma vez** `persistBrandAssetAtomically(createPrismaBrandAssetWriteStore(clienteIsolado), { candidate, expected })`. Não executar INSERT manual nem cadastrar por outro provedor. Preservar marcador pendente e recibo final no fluxo operacional; em `INDETERMINATE_COMMIT`, `AUDIT_MISMATCH` ou falha, parar e reconciliar em leitura, sem repetir a escrita.
8. Após commit, leitura independente deve confirmar identidade VERIFIED/v1 e LOGO ACTIVE/v1, URL/hash/decisão corretos, nenhuma alteração nos registros anteriores e hashes protegidos iguais. Confirmar resposta PNG/hash da rota pública e imagem/fallback na UI a 24/48/72 px. Só então registrar cobertura **41/45**; as outras quatro continuam pendentes. Se a imagem falhar, registrar falha e não substituir por outra fonte.
9. Revogação: pelo controle existente, revogar o asset e bloquear exibição, preservando histórico. Confirmar rota sem bytes (404), fallback e ausência de seleção de outro provedor. Não reverter recriando uma identidade API-Football. Bloqueio histórico é intencionalmente conservador: uma eventual reautorização exige nova revisão do controle, não é automática.

## Validação

Testes locais usam fixture auditada e mocks de rede/Registry. Cobrem tupla, URL, query, porta, hash, MIME, tamanho, dimensões, redirects/429/erro sem retry, coexistência, ordem, bloqueio histórico, revogação durante fetch, fallback, kill switches, fonte em todas as 40 ligas atuais, transação sintética, rollback, conflito e commit indeterminado. Não houve acesso a staging ou Production.

O build é executado em processo com DATABASE_URL e DIRECT_URL substituídas por destino fictício `127.0.0.1:1`, sem editar arquivos ou variáveis persistentes. A primeira tentativa compilou e passou TypeScript, mas parou no prerender de `/robots.txt` por ausência de SITE_URL; a nova execução fornece também SITE_URL somente ao processo. O carregamento normal de `.env` pelo Next não substitui as duas variáveis já definidas no processo.

Resultado final: **82 testes aprovados**, `npx tsc --noEmit` e `npm run lint` aprovados; `npm run build` isolado aprovado (rota `/api/brand-assets/brack` dinâmica); `git diff --check` aprovado. Foram executadas as suítes `brackBrandSource`, `brandAssetWrite`, `assetPipeline`, `visualAssets`, `brandAssetPresentation` e `visualAssetsRendering`. O PNG de teste passou pela validação real de SHA-256 e dimensões, usando fetch mockado. A validação visual pública/live e a compatibilidade com o estado real do Registry permanecem gates posteriores de publicação/cadastro.

Diff funcional: novo contrato e seleção em `lib/brackBrandSource.ts`; validação/rota em `services/brackBrandDelivery.ts` e `app/api/brand-assets/brack/route.ts`; integração em `lib/assetPipeline.ts`, `services/brandAssetReadService.ts`, `services/brandAssetWrite.ts` e `services/prismaBrandAssetWriteStore.ts`. Testes e fixture acompanham o código. O suporte técnico foi preparado para o commit autorizado após a revisão final abaixo; nenhum push ou deploy foi executado. A cobertura de Production não foi reconsultada; não há fundamento para aumentá-la além das 40 logos anteriormente confirmadas.

## Revisão final: memória, tempo e volume

Dois riscos concretos corrigidos em `services/brackBrandDelivery.ts`:

1. O acumulador de chunks limitava bytes, mas podia reter metadados sem limite para chunks vazios e duplicava o corpo na concatenação. Agora existe um buffer fixo de **35.259 bytes**, alocado somente após validar os headers. Cada chunk é comparado com a capacidade restante **antes da cópia**. O corpo é cancelado no primeiro excesso. O prazo de 8 segundos é aplicado ao fetch e conferido antes/depois de cada leitura, antes de copiar os bytes. Não se chama `arrayBuffer()` sobre a resposta da origem. Isso limita a memória controlada pelo acumulador; buffers internos do transporte HTTP/Node e da resposta ao cliente também usam memória e não estão sujeitos a uma garantia de RSS de 35.259 bytes.
2. A rota pública não tinha controle de volume. Foi adicionado um gate em memória por processo, **quatro requisições em andamento e 60 admissões por janela móvel de 60 segundos**, antes de consultar banco ou origem. Não há fila nem retry. O excesso retorna 429, `Retry-After: 60`, `no-store` e corpo vazio; o componente usa seu fallback. Apenas timestamps (no máximo 60) e contadores são retidos, não bytes da imagem ou decisões de autorização. Slots são liberados inclusive em falhas. Requisições sequenciais aceitas voltam a validar origem e Registry.

Modelo de volume, não previsão de tráfego: para N respostas válidas há N downloads e 2N invocações lógicas de leitura do Registry (a quantidade de SQL depende do Prisma). Mil respostas representam **35.259.000 bytes**, cerca de 35,26 MB decimais, mais headers/transporte e duas mil leituras lógicas. Repetições do mesmo URL podem ser agregadas pelo navegador, mas não se depende disso. Antes do cadastro, uma requisição admitida faz uma leitura e responde 404 sem download. Com o gate, cada processo admite no máximo 60 chamadas em qualquer janela móvel de um minuto: até 2.115.540 bytes de PNG auditado e 120 leituras lógicas iniciadas por essas chamadas. Respostas inválidas/oversized podem consumir bytes adicionais no transporte antes do cancelamento; não há promessa de limite de banda de rede contra uma origem malformada.

Riscos residuais: o teto é por processo aquecido, não por deployment; cold starts reiniciam os contadores e múltiplas instâncias somam capacidade. O gate global por processo pode causar fallback a usuários legítimos durante uma rajada. A leitura de banco depende dos timeouts de Prisma/pool; os 8 segundos limitam a coleta HTTP, não toda a requisição. Não há cópia servível quando a origem está indisponível. Antes de habilitar Brack, avaliar tráfego/erros da rota e, se o volume distribuído exigir, aprovar um limite na borda compartilhado entre instâncias — sem cache de imagens. Revogação não retira pixels já entregues e existe a janela inevitável entre a última leitura e o envio. Estes limites não alteram as 40 logos API-Football.

Os testes adicionais comprovam rejeição por Content-Length antes de ler o corpo, cancelamento no primeiro chunk excedente, deadline cobrindo headers/corpo, recusa da quinta requisição antes de banco/rede, recuperação de slots após falha e teto móvel sem reutilização de bytes. Resultado da revisão final: **87 testes aprovados**, `npx tsc --noEmit`, lint geral, build isolado e `git diff --check` aprovados; os textos novos também passaram no check no-index. Brack permanece fora da allowlist. Os 14 arquivos incluem somente suporte técnico, testes/fixture e documentação — nenhuma autorização de publicação ou cadastro.

Arquivos incluídos no commit técnico:

- `app/api/brand-assets/brack/route.ts`
- `lib/brackBrandSource.ts`
- `lib/assetPipeline.ts`
- `services/brackBrandDelivery.ts`
- `services/brandAssetReadService.ts`
- `services/brandAssetWrite.ts`
- `services/prismaBrandAssetWriteStore.ts`
- `tests/unit/services/brackBrandSource.test.ts`
- `tests/unit/services/brandAssetWrite.test.ts`
- `tests/unit/catalog/brandAssetPresentation.test.ts`
- `tests/fixtures/brand-assets/brack.png`
- `tests/fixtures/brand-assets/README.md`
- `docs/brand-asset-official-sources-proposal.md`
- `docs/brack-official-source-implementation.md`
