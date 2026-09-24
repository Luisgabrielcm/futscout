# Cinco logos oficiais — preparação de 24/09/2026

Retomada: consultar [revisão final e diagnóstico HTTP/SSR](brack-isl-final-review.md) e [decisão operacional específica pendente de aprovação](brack-isl-operational-decision-draft.md). Os resultados abaixo registram a preparação inicial; a revisão final distingue o teste HTTP/payload do requisito de HTML inicial sem JavaScript.

Base: `beta-next`, HEAD `e46b91f5af402f2d94727d6e6cb310539284e89b`. Diff ainda não publicado. **Nenhum cadastro, migration, alteração de IDs, ambiente, Vercel, commit, push ou deploy nesta etapa.** Cobertura preservada: último total confirmado **40/45**, não recontado integralmente nesta consulta. Duas candidatas tecnicamente preparadas; três permanecem REVIEW. Procedência oficial e verificação técnica não constituem licença.

## Evidências e alcance da leitura

Reutilizados `audit/output/five-current-branding-20260924/{188,207,323,318,307}.json`, seus arquivos originais, `audit/output/nine-league-review-20260924/report.md`, checkpoints de reconciliação e `brand-asset-official-sources-proposal.md`. Hashes recalculados sobre os cinco arquivos arquivados: todos correspondem à tabela abaixo. HTTP 200 é o resultado histórico da coleta, **não um download novo**. Nesta preparação: zero requisições novas às imagens e zero chamadas à API-Football.

Consulta SELECT pontual, sem escrita, no Prisma Studio autenticado: workspace `zgid79r99qbyucdg5d9dvhqi`, projeto `m0f43nhdf2ylv4i1nvo6pwsj`, database **Production `rknsog8tmbl5u4xqbogxfux5`**, resultado em 1119 ms. Consultados os cinco League.id exatos, identidades de qualquer provedor/estado desses League.id, ocupação dos IDs API 188/207/323/318/307 e dos provedores oficiais Brack/ISL, além do clube da liga Cyprus. Resultado: cinco ligas presentes; **nenhuma identidade encontrada nesse conjunto**, consequentemente nenhum asset vinculado. Não se trata de preflight futuro nem de leitura via `withPrismaReadOnly`: foi SELECT no Console. Revalidar dentro da operação antes de qualquer cadastro.

As cinco linhas locais têm `country="Não informado"` e `externalId=null`. País/abrangência e divisão abaixo vêm das evidências de competição; não foram deduzidos desses campos nem persistidos. IDs API-Football são referências de reconciliação, não IDs dos provedores oficiais.

## Estado de cada candidata

| Candidata / League.id / referência API | Identidade e temporalidade | Evidência visual em 24/48/72 px | Resultado e falta concreta |
|---|---|---|---|
| Brack Super League / `cmt9cdhm202ycukuc9eatc0la` / 207 | Suíça, League, primeira divisão; 11/11 participantes reconciliados; SFL confirma marca desde 2025/26; media item 236618 | PNG com superfície branca própria, moldura e marca vermelhas; símbolo reconhecível a 24, texto melhor a 48/72; preservar composição inteira | **VERIFIED técnico**; suporte e allowlist proposta prontos. Falta aprovação operacional individual, preflight atualizado e publicação controlada |
| Indian Super League / `cmtacvytc02r59guc438hbrlo` / 323 | Índia, League, primeira divisão; página oficial identifica Season 2025-2026; 8/11 participantes reconciliados; erros de Punjab/East Bengal/Hyderabad não invalidam a identidade independente da competição | SVG 74×74; bola vermelha e texto branco. Usar fundo escuro; texto branco desaparece em fundo claro. Renderização com cabeçalhos reais confirmada em navegador | **VERIFIED técnico**; revisão SVG concluída para bytes exatos, sem sanitizador genérico. Falta aprovação operacional individual, preflight e publicação |
| A-League Men / `cmt9i85450055q4ucarbpij51` / 188 | Austrália/Nova Zelândia, League, primeira divisão; 11/12 participantes; Central Coast 19008/941 em revisão independente. Patrocínio até 2026 não prova os bytes desta versão; página atual é 2026/27 | Arquivo com extensão webp é PNG 2693×301. Encaixado em 24 px fica com cerca de 2,7 px de altura; assinatura ilegível, mesmo no fundo claro necessário | **REVIEW**: obter arte oficial compacta adequada ao slot e comprovar versão 2025/26, ou aprovar explicitamente marca atual e revisar sua apresentação. Não cortar/redesenhar a marca para fechar contagem |
| Liga Cyprus / `cmt9gj2es04801sucqqr7lpq7` / 318 candidato | CFA confirma Cyprus League by Stoiximan 2025/26, competição 65403824. A associação da liga local à competição continua incompleta; 0/1 participantes reconciliados | JPEG horizontal com CFA, patrocinador e +18; texto muito pequeno em 24 px. Não recortar composição sem evidência apropriada | **REVIEW identidade local e visual**: obter payload/fonte EA que relacione a liga local à divisão, confirmar APOEL por evidência exata e obter logo oficial adequada ao slot/condições da composição |
| ROSHN Saudi League / `cmt99f99p005gvsuclbx5elkf` / 307 | Arábia Saudita, League, primeira divisão; 14/15 participantes; Al Hilal 8097/2932 separado. Página e caminho da arte atuais são de 2026/27 | PNG quadrado, marca RSL e segmentos coloridos reconhecíveis; contraste satisfatório em claro/escuro na revisão local | **REVIEW temporal**: comprovar estes bytes em 2025/26 ou decisão explícita de usar a marca atual, documentando a diferença temporal |

Cyprus: único clube local observado `cmt9gj2j404811suc2ug3rreg`, APOEL FC, EA `100135`, API `557`. O candidato `2247` permanece evidência a conferir, **não uma correção aprovada**. Não substituir IDs por nome. As outras divergências de clubes também permanecem intactas.

A preferência entre marca da temporada e marca atual não foi respondida nesta etapa; aplicado critério conservador, sem atribuir aprovação ao proprietário. Não é obrigatório corrigir cada clube divergente para validar uma competição que tenha evidência própria suficiente; Cyprus ainda carece dessa ligação local.

## Manifesto de bytes e fontes exatas

| Liga | URL exata | Formato real / bytes / dimensões | SHA-256 |
|---|---|---|---|
| Brack | `https://d21buns5ku92am.cloudfront.net/69864/images/602591-RZ_BSL_Logo_Portrait_RGB-64e276-original-1753264028.png?download=1` | PNG / 35259 / 1044×1005 | `9495ccc727eb8b6fffef811a77f0a1ea6f751bb848c4aac99116ec5a85a3c8ea` |
| ISL | `https://www.indiansuperleague.com/static-assets/images/svg/isl-logo.svg?v=100.54` | SVG / 22329 / 74×74 | `58e9824e6a3bc95081139c3fa64385994facc9e45feb59f93e8848e2bbaec884` |
| A-League | `https://aleagues.com.au/wp-content/uploads/sites/17/2023/08/A-Leagues-Logo_Men_Horizontal_Colour_Black_RGB_061021-1.webp` | PNG / 15388 / 2693×301 | `875736909a53b648a8beac5444ceccb551d9c4d785e448aee80f3c64414a8fac` |
| Cyprus | `https://www.cfa.com.cy/images/SponsorPics/1765366878.jpg` | JPEG / 36663 / 800×337 | `3adf4cca488288be34dc0a505a5c6490e376671c3d4a66aa1958eafb736139d3` |
| ROSHN | `https://images.spl.com.sa/image/private/t_q_good/v1785321708/prd/assets/icons/Roshn-Saudi-League_pchauk.png` | PNG / 32409 / 512×512 | `30f9b6a053a80f9b45e9c77b99c62efc3d73dd1da3d3d9295d70b609788a8bc1` |

Fontes primárias: [SFL, marca desde 2025/26](https://sfl.ch/de/articles/sfl-im-neuen-look-markenauftritt-mit-brinkertluck-schweiz-neu-gestaltet), [media kit Brack](https://newsroom.brackalltron.ch/en/assets/236618/), [ISL Season 2025-2026](https://www.indiansuperleague.com/standings/1000), [A-League Men](https://aleagues.com.au/a-league-men/), [extensão do patrocínio](https://aleagues.com.au/news/a-league-news-isuzu-ute-partnership-renewal/), [CFA 2025/26](https://www.cfa.com.cy/En/competitions/65403824), [SPL atual](https://www.spl.com.sa/en). Não foi possível abrir o PDF do guia A-League 2025/26 pelo leitor web por exceder seu limite; não foi usado como prova visual.

## Implementação e fronteiras de autorização

`OFFICIAL_LEAGUE_SOURCES` contém somente Brack e ISL; IDs oficiais são, respectivamente, `official-brack-media / 236618` e `official-isl / static-assets/images/svg/isl-logo.svg?v=100.54`. Este último identifica a versão do asset oficial, não uma chave de competição fornecida pela API-Football.

`services/officialLeaguePreparation.ts` contém a **allowlist proposta**, com as duas tuplas LEAGUE/LOGO exatas. Ela **não é consumida pelo writer**. A allowlist ativa permanece com 614 entradas, incluindo as 40 ligas API-Football. Após aprovação, adicionar somente a entrada individual autorizada à lista ativa; não importar automaticamente toda a proposta.

Entrega por `/api/brand-assets/brack` e `/api/brand-assets/isl`, com flags independentes `BRACK_BRAND_ASSET_DELIVERY_ENABLED` e `ISL_BRAND_ASSET_DELIVERY_ENABLED`; apenas `"true"` habilita. Ambas ficam desligadas por padrão. Nenhuma variável real foi configurada. A flag bloqueia antes de consultar Registry ou origem. Registry elegível e política global de publicação continuam necessários: **allowlist do writer não bloqueia leitura**.

Destinos HTTPS literais, host/path/query e hash exatos; não há URL fornecida pelo usuário. Query string na rota é recusada. Redirects são rejeitados, inclusive para o mesmo host. Prazo 8 s, capacidade fixa de 35259 ou 22329 bytes, verificação de tamanho por chunk antes de copiar para o buffer, MIME, SHA-256 e formato/dimensões. Sem retry, cache persistente ou cópia em storage. Buffers internos do transporte não são uma garantia de limite total da plataforma.

PNG Brack mantém assinatura/IHDR e dimensões, além de hash. SVG ISL **não usa validação PNG nem `dangerouslyAllowSVG`**: UTF-8 estrito, raiz 74×74 exata, somente paths e atributos já revisados, sem scripts, handlers, referências, entidades/DOCTYPE, estilos, links, recursos externos ou foreignObject. Hash exato é exigido mesmo para outro SVG seguro. Resposta `image/svg+xml`, `Content-Disposition: attachment`, `nosniff`, CSP `default-src 'none'; sandbox`, `no-store`. `<img>` interno exibe a imagem sem otimizador ou injeção inline. Nenhum remotePattern foi ampliado. Fixture de teste não é servida ao público.

Reader escolhe uma única fonte por liga, independentemente da ordem retornada. Duplicidade é fail-closed. Qualquer identidade BLOCKED ou logo com direitos BLOCKED, decisão REVOKED ou DISPLAY_BLOCKED no histórico de qualquer provedor veta a liga oficial; não há fallback para outra fonte. A revogação é relida depois do download antes da resposta. O writer preserva Serializable, versões/estado esperado e índices existentes; exige consulta de bloqueio histórico antes de criar. Falha na criação do asset desfaz a identidade nova, preservando histórico; conflito/resultado indeterminado não é repetido.

Falha de origem/validação retorna resposta vazia 502; bloqueio retorna 404; componente mantém seu fallback. A entrega tem limite independente por fonte de 4 requisições simultâneas e 60 admissões/minuto/processo, sem guardar bytes. Cada entrega aprovada faz até um GET à origem e duas leituras do Registry. Não é limite global em serverless: N instâncias podem admitir até 60N/minuto por fonte. Monitorar antes de ampliar tráfego; limitação global de metadados pode ser etapa posterior, sem armazenar cópias. Não prometer ausência de latência ou hotlink futuro.

## Decisões operacionais propostas — NÃO APROVADAS

Referências propostas: `FUTSCOUT-OFFICIAL-BRACK-20260924-v1` e `FUTSCOUT-OFFICIAL-ISL-20260924-v1`. Cada uma cobre **somente** a tupla, URL e hash da candidata correspondente acima. Não cobre as outras três ligas nem imagens futuras na mesma URL.

Após aprovação individual, registrar autor, instante real e referência auditável; então preencher no candidato: `identityStatus=VERIFIED`, `deliveryStatus=VALIDATED`, `rightsStatus=REVIEW_REQUIRED`, `storageUrl=null`, `operationalDecision=OWNER_AUTHORIZED_REMOTE_USE`, `displayPolicy=DISPLAY_ALLOWED`, `operationalAuthorizedAt`, `operationalDecisionRef`, `operatorRiskAccepted=true`, `riskAcceptedAt`, `riskAcceptedBy`, `riskReason`, `sourceTermsUrl` da página oficial avaliada e `revocable=true`. `fetchedAt` deve ser do novo preflight, não uma data inventada. Não usar a página de procedência como alegação de termos licenciados; documentar termos específicos ainda não comprovados e risco assumido. A decisão não representa licença, direito de marca ou permissão concedida pela fonte.

## Sequência verificável para 40/45 → 45/45

1. Revisar este diff e aprovar separadamente Brack/ISL e suas decisões operacionais. Fechar as três pendências técnicas acima antes de incluí-las. Cobertura nesta etapa continua 40/45.
2. Preparar SHA candidato com testes, TypeScript, lint e build. Revisar **todo** o diff contra o deployment público, não apenas as rotas: o relatório anterior `audit/output/brack-release-e46b91f-review.md` registra diferenças maiores e falhas SSR de 404. Não promover automaticamente o HEAD nem fazer release parcial sem dependências verificadas.
3. Preview com flags desligadas: 404 mesmo diante de Registry elegível; as 40 logos continuam funcionando. Preview atual não é banco isolado. Para testar flags ligadas e cadastro sintético, usar staging identificado `jj51gk17l30qv1uibsj3g46u`, nunca configuração compartilhada de Preview por suposição. Testar origem falha, hash divergente e revogação; fallback deve aparecer.
4. Depois de aprovação da publicação, publicar o código com flags desligadas e verificar SHA/ambiente público e rollback para deployment anterior. Nenhum asset novo deve ser cadastrado antes de existir código compatível publicado.
5. Para cada candidata aprovada, adicionar somente sua tupla à allowlist ativa revisada; identificar conexão do destino Production `rknsog8tmbl5u4xqbogxfux5` no Console. Preflight read-only por `withPrismaReadOnly`: League.id, catálogo protegido, migrations compatíveis, ausência de conflitos em todos os provedores/estados, versões e referências. Uma requisição pontual à URL, sem retry, confere HTTP, bytes/hash/formato. Qualquer mudança exige nova revisão visual. Nenhuma migration é necessária para esta evolução.
6. Capturar estado esperado, usar `persistBrandAssetAtomically` com `createPrismaBrandAssetWriteStore`, uma liga por vez. Preparar recibo antes da operação. Após commit, leitura independente pelo store read-only confirma identidade, asset, hash, direitos e histórico. Conflito/falha/indeterminação: parar, reconciliar em leitura; não repetir automaticamente. Não executar esse passo a partir deste documento sem autorização.
7. Só após confirmação, habilitar a flag individual no ambiente autorizado e verificar resposta/bytes, páginas de liga/clube/jogador e fallback. Recontar **assets realmente exibíveis**, não apenas linhas: Brack → 41/45; ISL → 42/45, se ambas passarem. Registro com flag desligada não aumenta cobertura exibida.
8. ROSHN: resolver temporalidade e preparar fonte/flag/testes próprios → 43/45. A-League: arte compacta e temporalidade → 44/45. Cyprus: identidade local e apresentação → 45/45. Ordem das três pode mudar conforme evidência; totais são condicionais, não promessa de conclusão sem dados.
9. Reversão individual: desligar flag, revogar asset/bloquear exibição pelo mecanismo existente e confirmar fallback; preservar histórico. Não trocar automaticamente de provedor nem excluir identidade. Rollback do código por deployment anterior é separado do estado do Registry.

## Validação desta preparação

- `npm test`: **1574 testes, 1566 aprovados, 8 ignorados, zero falhas**. Testes com mocks/fixtures, sem cadastro externo.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: aprovados. Build com DATABASE_URL/DIRECT_URL fictícios loopback porta 1 definidos apenas no processo, sem alterar `.env`; não dependeu de consulta real.
- `git diff --check`: aprovado; arquivos novos também conferidos com `git diff --no-index --check`. Diff completo e logs em `audit/output/five-official-*` (artefatos locais ignorados).
- Inspeção local dos cinco arquivos em fundo claro/escuro a 24/48/72 px. ISL adicionalmente exibida pela função real `serveIslAsset`, com read/fetch sintéticos; três imagens carregadas, dimensões naturais 74×74 e composição visível com CSP/attachment reais.
- Testes cobrem URL/identidade exata, bytes alterados, redirects/429 sem retry, excesso de streaming, SVG malicioso, flags independentes, revogação durante fetch, fallback, seleção determinística, coexistência e rollback do writer. As 40 entradas API-Football ativas permanecem preservadas.
- `.gitattributes` preserva os bytes exatos somente da fixture ISL (`-text`), impedindo conversão LF/CRLF de alterar o SHA em outro checkout.
- Os 8 testes SSR de produção ignorados pela suíte padrão não foram considerados aprovados: a revisão anterior encontrou falhas de HTML localizado em 404, inclusive evidência preexistente no público. Esse gate de release continua separado, aberto, sem correção nesta tarefa.

## Atualização de autorização — 24/09/2026

Aceite geral expresso registrado em 2026-09-24T14:21:36Z, referência owner-message:2026-09-24T14:21:36Z:all-logos-crests. Brack e ISL têm decisão individual no documento brack-isl-operational-decision-draft.md. Não promove A-League, Cyprus ou ROSHN a VERIFIED. Cobertura pública permanece 40/45 até confirmação efetiva de cada cadastro.

Resultado posterior desta rodada: os oito SSR estritos passaram no build local em staging, sem escrita. A seção anterior é o checkpoint histórico; o estado atual e a solução estão em brack-isl-final-review.md. Suíte atual: 1.573 aprovados + oito HTTP estritos aprovados separadamente; TypeScript, lint e build aprovados.
