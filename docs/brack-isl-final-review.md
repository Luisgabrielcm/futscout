# Revisão final Brack/ISL e pendências — 24/09/2026

Branch `beta-next`, base `e46b91f5af402f2d94727d6e6cb310539284e89b`. Arquivos pendentes preservados, sem commit. **Não existe ainda SHA de publicação que inclua este diff.** O SHA da base não representa o novo código. A aprovação do diff/commit e a decisão sobre SSR devem anteceder a identificação e teste do SHA candidato definitivo.

## Revisão técnica

O catálogo técnico admite somente as fontes exatas Brack/ISL. Provider distinto de API-Football, URL completa/query/hash fixos, sem entrada de URL do usuário. PNG e SVG têm validadores distintos. O SVG não é injetado no DOM nem passa por otimização genérica: apenas a raiz/path/atributos previamente revisados, sem referências externas, scripts/eventos/DOCTYPE/foreignObject. Streaming com capacidade fixa e rejeição de excesso antes de copiar, timeout, redirects recusados, MIME/hash/dimensões, CSP/nosniff/attachment e ausência de cache persistente permanecem.

Flags Brack/ISL são independentes, ausentes/desligadas por padrão. Registry e política global continuam necessários. Allowlist proposta não é importada pelo writer; allowlist ativa contém as mesmas 40 ligas. Revogação/bloqueio no histórico de qualquer provedor veta a liga oficial; seleção não depende da ordem retornada. Não houve ampliação de hosts do Next, migration ou alteração das outras três candidatas. SHA da fixture SVG preservado por regra específica `.gitattributes`.

O [rascunho de decisão operacional](brack-isl-operational-decision-draft.md) contém URLs/hashes completos, escopo, riscos, direitos pendentes, flags, conexão isolada e comandos. Runner novo recusa cadastro sem aceite e allowlist ativa; nunca carrega o `.env` antigo. `preflight`/`confirm` consultam por `withPrismaReadOnly`; `register` usa exclusivamente o writer transacional uma vez. Marcador pendente não é apagado; publicação dos recibos usa temporário e rename no mesmo diretório. Nenhum dos modos de banco desse runner foi executado nesta etapa. Seus testes usam decisões/recibos sintéticos locais.

## SSR inicial corrigido — oito testes estritos

A causa observada era a recuperação de `notFound()` do Next 16.3.4: HTTP 404 com UI apenas no Flight. A correção retorna documento localizado completo antes de iniciar streaming. O catch-all inexistente é um Route Handler; acessos diretos GET/HEAD aos três tipos de perfil passam por existência exata por slug no proxy, exclusivamente em `withPrismaReadOnly`. Falhas de acesso propagam como erro operacional, nunca como ausência. RSC/prefetch/actions não acrescentam consultas e preservam o fluxo existente. Não há entrada de usuário no HTML gerado.

Custo residual: um lookup adicional em transação somente leitura por acesso direto a perfil válido; medido nas 404 locais em cerca de 0,8 s após aquecimento. Não é uma alegação de latência de Production. O documento 404 direto usa apresentação mínima escura com retorno acessível; a navegação React mantém os componentes atuais.

Validação: build passou; lint passou; 1.573 testes locais passaram, oito HTTP opt-in omitidos nessa suíte. Os oito HTTP foram executados separadamente contra `next start` com configuração isolada de staging e passaram **estritamente**, com h1, idioma, noindex, documento único e ausência de `__next_error__`. Os testes originais não foram enfraquecidos. Cinco testes novos cobrem HTML/HEAD, slug exato, perfil existente, Flight/actions e propagação de falha operacional. Nenhum dado foi gravado.

Autorização operacional recebida: `owner-message:2026-09-24T14:21:36Z:all-logos-crests`, aplicada às duas referências específicas do documento de decisão. Direitos permanecem REVIEW_REQUIRED, storageUrl null e revogação individual. O aceite não conclui as revisões técnicas das outras candidatas.
## O que está preparado para 42/45

Brack e ISL estão VERIFIED tecnicamente, com evidência/bytes, código, testes, proposta de allowlist e minuta de decisão individuais. Aceite operacional recebido. Faltam preflight atualizado no destino identificado, ativação revisada das tuplas, publicação de código compatível com flags desligadas, cadastro único e leitura independente por liga, liberação individual e verificação pública. Esses passos não foram executados. Cobertura continua **40/45** conforme última medição confirmada; não houve recontagem de Production nesta rodada.

## O que falta para 45/45

### A-League — REVIEW visual/temporal

Refeito o teste com **componente `LeagueLogo` real e regras `.leagueLogo` de `app/globals.css`**, sem modificar o componente. Seis imagens locais: small/medium/large em fundo claro/escuro. Dimensões medidas no DOM: 24×24, 48×48 e 72×72; arquivo original 2693×301, todas carregadas. A arte ocupa cerca de 2,68/5,36/8,05 px de altura útil. A assinatura é ilegível no slot pequeno mesmo no claro e perde contraste no escuro. Não aprovar esta arte horizontal para todos os usos atuais. Ferramenta local: `audit/output/aleague-real-size-preview.ts`; bytes arquivados, zero downloads novos.

A [fonte oficial sobre a marca de aniversário](https://aleagues.com.au/news/a-leagues-launch-new-logo-for-20th-anniversary-season/) identifica a versão 2024/25 com 20 anos; ela não prova uma arte exata de 2025/26. A página/patrocínio atual também não prova a versão dos bytes arquivados. Falta arquivo oficial compacto para a liga masculina (não feminino, organizadora ou aniversário), URL/bytes/hash próprios, temporalidade 2025/26 ou aceite explícito de marca atual, e repetição do teste no slot real. Nenhum recorte/redesenho foi produzido.

### Cyprus — REVIEW de vínculo local e visual

Preservado: League.id `cmt9gj2es04801sucqqr7lpq7`; clube `cmt9gj2j404811suc2ug3rreg`, EA `100135`, API `557`; candidato API `2247` não aprovado. A [CFA 65403824](https://www.cfa.com.cy/En/competitions/65403824) documenta Cyprus League by Stoiximan 2025/26 e APOEL, mas isso sozinho não liga a categoria local da EA à divisão.

Nova pista primária: [página EA de Stefan Dražić, ID 239612](https://www.ea.com/de/games/ea-sports-fc/ratings/player-ratings/stefan-drazic/239612). O resultado indexado informa FC26, APOEL FC e Liga Cyprus. A leitura direta web falhou e a tentativa no navegador expirou; não foi obtido payload que prove o **ID de equipe 100135 e a chave da competição**. Nome exibido em resultado de busca não basta para fechar a associação. Falta capturar essa ligação EA por ID e compará-la ao snapshot local; reconciliar 557/2247 em auditoria separada, sem corrigir clube automaticamente. A arte JPEG CFA permanece pequena/composita (+18/patrocinador): falta imagem oficial apropriada ao slot e condições para a composição completa.

### ROSHN — REVIEW temporal

Identidade da primeira divisão saudita continua sustentada por evidência independente do Al Hilal divergente. O arquivo auditado vem de URL versionada em 2026 e o site atual está em 2026/27. Foi localizado e lido o [Handbook oficial 2025/26](https://resources.saudi-pro-league.pulselive.com/saudi-pro-league/document/2025/12/16/f84fe428-0de8-4c67-960f-92d4becec022/25-26-SPL-Handbook-MASTER-EN-FV.-16122025-EN-.pdf), documento de 187 páginas. Não foi obtida prova de que o PNG RSL auditado é a mesma versão temporal; captura da capa pelo leitor falhou. Não confundir a identidade da organizadora SPL com a marca RSL da competição, nem com Saudi Post/SPL ou a marca corporativa ROSHN.

Falta fonte oficial datada ou media kit que vincule a composição RSL exata a 2025/26, ou decisão explícita de adotar marca atual documentada. Uma página de notícias antiga cujo cabeçalho foi atualizado hoje não prova a imagem da época. A candidata atual tem boa leitura, mas não foi liberada só por disponibilidade. Não houve download novo nem cadastro.

## Validação e artefatos

- Suíte offline: **1576 testes, 1568 aprovados, 8 ignorados**, zero falhas; oito ignorados são o teste HTTP opt-in, executado separadamente.
- TypeScript e build aprovados, sem banco real no build (URLs fictícias loopback apenas no processo).
- Lint inicialmente encontrou cinco `no-require-imports` em dois utilitários gerados ignorados (`five-official-diff.cjs` e `start-staging-readonly-http.cjs`). Convertidos para `.mjs`/imports ESM; sem exclusões e sem apagar recibos. Resultado final registrado em `audit/output/brack-isl-final-lint.log`.
- HTTP/payload: 8 aprovados. SSR inicial estrito: 8 falhas conhecidas; não representadas como aprovação.
- Diff completo: `audit/output/five-official-preparation.patch`; inclui arquivos novos. Logs `audit/output/brack-isl-*`; documentos anteriores preservam seus resultados históricos.
- Nenhum commit, push, deploy, alteração de variável persistente ou escrita no banco. Não há SHA candidato final; somente base Git e patch pendente de revisão.

## Revisão da publicação autorizada

Console Vercel consultado nesta rodada: Production continua no deployment CfJgCjkJsCDjy8DYcJT6S7KRjFeJ, SHA 8aa0c776730984fdab52143b9dc7e22858ac27d9; branch automática Production master, beta-next produz Preview. Instant Rollback está disponível. O intervalo inclui os 20 commits históricos já revisados em audit/output/brack-release-e46b91f-review.md, além deste suporte ISL e correção SSR. Não é publicação isolada de logos: reader, writer, histórico Prisma já aplicado e ferramentas auditáveis integram o código. Sem novas migrations ou alterações de autenticação. Proxy agora também faz a checagem descrita acima; catch-all genérico usa Route Handler.

Sequência autorizada: commit candidato; build do SHA; push beta-next; conferir SHA do Preview e testar somente leituras (o banco pode ser Production); confirmar flags globais e individuais; promover o mesmo SHA para Production; confirmar rollback para o deployment anterior. Só após preflight identificado, ativar as duas tuplas de cadastro, registrar individualmente e liberar entrega com confirmação pública. A allowlist do writer não controla o reader. Não contar asset apenas cadastrado como confirmado publicamente.
