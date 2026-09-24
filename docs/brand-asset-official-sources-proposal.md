# Fontes oficiais exatas — proposta, sem habilitação

Atualização de 24/09/2026: a [preparação das cinco ligas](five-official-leagues-preparation.md) registra o estado atual, suporte restrito a Brack/ISL, allowlist proposta inativa, inspeção SVG, leitura do Registry e três candidatas ainda em REVIEW. O texto abaixo preserva o histórico da proposta inicial.

Atualização: a seção abaixo preserva a proposta e a pesquisa originais. O suporte técnico implementado posteriormente **somente para Brack**, seus testes e a sequência de publicação estão em [brack-official-source-implementation.md](brack-official-source-implementation.md). Nenhuma das cinco imagens foi cadastrada nesta implementação.

Preparada após o commit `d0deb614fa2a79ff6cd9e4a1385d561f38fe4dc7`. Nenhuma consulta ou escrita no banco, download novo, alteração de allowlist, migration ou publicação nesta etapa. A cobertura confirmada no relatório anterior continua 40/45; não foi medida novamente nesta revisão. As cinco fontes abaixo são candidatas, não autorizações de uso.

## Inspeção e menor mudança

- `prisma/schema.prisma`: `provider` e `providerEntityId` já são strings. A unicidade externa é `(entityType, provider, providerEntityId)`; a unicidade parcial local inclui o provedor e exclui apenas `BLOCKED`. Duas fontes diferentes podem coexistir para a mesma liga. Não é necessária migration.
- `services/brandAssetWrite.ts`: o tipo e `validateCandidate` restringem o provedor a API-Football e calculam a URL a partir do ID. A allowlist é uma autorização separada. Preservar todos os controles de direitos, estado esperado, versões e resultado indeterminado.
- `services/prismaBrandAssetWriteStore.ts`: transação Serializable, unicidade externa e estado esperado protegem concorrência por provedor. A evidência atual da identidade contém apenas `guarded-brand-asset-write`; para uma fonte oficial deve também registrar referência do manifesto, página oficial, temporada e hash da evidência. Clubes permanecem no contrato API-Football; a primeira evolução se limita a LEAGUE/LOGO.
- `services/brandAssetReadService.ts`: já lê todos os provedores VERIFIED. O `Map.set` pode escolher a última identidade retornada para a mesma entidade, sem ordem garantida. Não basta aceitar um novo provedor no writer: a seleção precisa ser explícita e testada.
- `lib/assetPipeline.ts` e `lib/visualAssets.ts`: verificam direitos, autorização, sintaxe e compatibilidade visual, mas não vinculam um provedor oficial a URL/hash exatos.
- `app/components/PlayerImage.tsx`: somente URLs API-Sports passam pelo otimizador; outras usam `<img>` direto. Portanto, `next.config.ts` NÃO constitui uma barreira de host para todas as imagens. Corrige-se aqui a simplificação da pesquisa anterior: adicionar apenas um remotePattern não resolveria a entrega oficial.
- Documentação local lida: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`, seções remotePatterns, maximumRedirects e dangerouslyAllowSVG. Path e query devem ser exatos; redirects do otimizador não são revalidados contra remotePatterns. SVG exige tratamento separado.

Proposta de implementação, ainda não conectada ao runtime:

1. Um catálogo fechado de fontes, com tupla exata `LEAGUE / League.id / provider / providerEntityId / LOGO`, URL completa incluindo query, SHA-256, MIME/assinatura, limites de bytes/dimensões, página de evidência, temporada e superfície visual. Identificadores oficiais usam o namespace da fonte, nunca o número API-Football disfarçado. A presença no catálogo técnico não autoriza escrita/publicação.
2. Primeiro candidato: provedor proposto `official-brack-media`, ID externo `236618` (ID real do item do media kit, não ID alegado da competição), ligado explicitamente a `cmt9cdhm202ycukuc9eatc0la`. URL e hash são os de Brack abaixo. A decisão operacional futura deve identificar essa tupla, página e bytes. Outros quatro provedores ficam sem habilitação até seus gates estarem resolvidos.
3. Writer aceita essa fonte somente quando a tupla também estiver na allowlist autorizada e URL/hash corresponderem ao catálogo. Exigir `storageUrl=null`, `rightsStatus=REVIEW_REQUIRED`, referência específica, revogação individual e os demais controles atuais. A coleta de pré-escrita deve rejeitar redirects, validar assinatura/MIME e limites, sem retries. Hash diferente exige nova revisão; não atualizar silenciosamente.
4. Reader usa seleção explícita por entidade: para as 40 logos atuais mantém a identidade API-Football; para nova fonte autorizada exige a tupla oficial exata. Não escolher por ordem, nome, maior versão entre provedores ou disponibilidade. Duplicidade inesperada deve retornar fallback e diagnóstico. Identidade BLOCKED ou asset revogado jamais serve como alternativa.
5. Aplicar a mesma validação de fonte no pipeline de apresentação, antes de retornar URL, para impedir bypass por `<img>`. Manter fallbacks e os kill switches. Não ampliar a regra de URLs livres para fontes desconhecidas.
6. Entrega raster preferencial pelo caminho já otimizado, com remotePattern de arquivo e query exatos. Antes de ativar, resolver redirects: `maximumRedirects: 0` é global e requer comprovar que os assets API-Sports atuais não dependem de redirects. Alternativa de fetch separado aumenta escopo e não é a menor mudança. Não adicionar regra ampla para CloudFront. Não habilitar SVG globalmente.

Limite importante: SHA-256 no Registry comprova os bytes auditados; Next/Image e `<img>` não verificam esse hash a cada resposta remota. Uma URL exata pode mudar de conteúdo. Se for exigida integridade por resposta, será necessário um fetch controlado que confira hash, limites e redirects, com decisão sobre cache/armazenamento. Não apresentar pinagem de metadados como garantia de bytes futuros. A publicação remota deve declarar esse risco e prever revogação.

## Matriz das cinco candidatas

Todos os resultados HTTP/formato/hash são da coleta arquivada de 24/09/2026 UTC, com uma requisição por imagem e sem retry. Disponibilidade histórica não garante hotlink futuro. URLs exatas e hashes completos estão abaixo; nenhuma condição de licença ou permissão de redistribuição foi comprovada. Página oficial/media kit são evidência de procedência, não licença. Não transferir os termos da API-Football para essas fontes.

| Competição e identidade local | Fonte oficial / versão temporal | Formato e entrega | Contraste e composição | Condições e gate |
|---|---|---|---|---|
| A-League Men, Austrália/Nova Zelândia, primeira divisão; `cmt9i85450055q4ucarbpij51`; API 188 apenas referência de reconciliação | A-Leagues, página masculina; rebranding documentado em 2021, site atual 2026/27; falta vincular a arte exata a 2025/26 ou decidir marca atual | HTTP 200, PNG 2693×301 apesar da extensão webp; URL raster candidata | Preto/vermelho, ISUZU UTE; precisa superfície clara e teste a 24/48/72 px. Proporção horizontal pode tornar texto ilegível; não cortar ou redesenhar | Uso remoto ainda sem decisão própria; termos não concluídos; versão temporal e legibilidade pendentes |
| Brack Super League, Suíça, primeira divisão; `cmt9cdhm202ycukuc9eatc0la`; API 207 | Media kit Brack 236618; SFL documenta marca desde 2025/26 | HTTP 200, PNG 1044×1005; query `?download=1` obrigatória; candidato raster mais completo | Fundo branco, moldura vermelha e figura branca; preservar arte completa; validar redução | Procedência/temporalidade coerentes; ainda faltam contrato de entrega fechado e decisão operacional específica; licença não comprovada |
| Indian Super League, Índia, primeira divisão; `cmtacvytc02r59guc438hbrlo`; API 323 | Site ISL, temporada 2025/26, versão de URL `v=100.54` | HTTP 200, SVG 74×74; não habilitar como raster nem `dangerouslyAllowSVG` global | Texto branco/bola vermelha, adequado ao fundo escuro; branco desaparece no fundo branco | Obter raster oficial ou concluir revisão de SVG (scripts, eventos, recursos externos, foreignObject, links, CSP e modo de entrega); não converter nesta etapa |
| Cyprus League, Chipre, primeira divisão candidata; `cmt9gj2es04801sucqqr7lpq7`; API 318 | CFA, competição 65403824, temporada 2025/26 | HTTP 200, JPEG 800×337 | Composição branca/dourada/azul com patrocinador, CFA e texto +18; usar arte inteira; legibilidade pequena não confirmada | Evidência visual encontrada; identidade local permanece separadamente REVIEW; não cadastrar até fechar associação local e condições da composição |
| ROSHN Saudi League, Arábia Saudita, primeira divisão; `cmt99f99p005gvsuclbx5elkf`; API 307 | Site SPL atual 2026/27; caminho `v1785321708` | HTTP 200, PNG 512×512 | RSL azul escuro/branco e segmentos coloridos; validar superfície clara e tamanhos pequenos | Falta evidência da versão exata em 2025/26 ou decisão de usar marca atual; termos/autorização específicos pendentes |

| Fonte | URL exata | SHA-256 |
|---|---|---|
| A-League | https://aleagues.com.au/wp-content/uploads/sites/17/2023/08/A-Leagues-Logo_Men_Horizontal_Colour_Black_RGB_061021-1.webp | `875736909a53b648a8beac5444ceccb551d9c4d785e448aee80f3c64414a8fac` |
| Brack | https://d21buns5ku92am.cloudfront.net/69864/images/602591-RZ_BSL_Logo_Portrait_RGB-64e276-original-1753264028.png?download=1 | `9495ccc727eb8b6fffef811a77f0a1ea6f751bb848c4aac99116ec5a85a3c8ea` |
| ISL | https://www.indiansuperleague.com/static-assets/images/svg/isl-logo.svg?v=100.54 | `58e9824e6a3bc95081139c3fa64385994facc9e45feb59f93e8848e2bbaec884` |
| Cyprus | https://www.cfa.com.cy/images/SponsorPics/1765366878.jpg | `3adf4cca488288be34dc0a505a5c6490e376671c3d4a66aa1958eafb736139d3` |
| ROSHN | https://images.spl.com.sa/image/private/t_q_good/v1785321708/prd/assets/icons/Roshn-Saudi-League_pchauk.png | `30f9b6a053a80f9b45e9c77b99c62efc3d73dd1da3d3d9295d70b609788a8bc1` |

## Cyprus: decisão de identidade independente

O catálogo local tem APOEL, EA 100135, associado a API 557; nomes aproximados não constituem evidência. O candidato para APOEL nesta auditoria é 2247. A evidência arquivada registra 0/1 correspondência e ausência de competição retornada para 557; isso, isoladamente, não prova qual registro deve ser corrigido. Exigir EA/local → League.id e clube exato → CFA/temporada, além de país, participantes e titularidade do ID externo. Não atualizar clube, liga ou externalId como efeito colateral da escolha da imagem.

## Testes e ativação futura

Antes de integrar código: testar tupla correta; provedor falso/API-Football com URL oficial; URL vizinha, query extra, fragmento, credenciais, porta, HTTP, redirecionamento; hash/MIME/assinatura divergentes; tamanho excessivo; SVG inesperado. Rejeitar antes da transação. Testar ausência de autorização mesmo com fonte válida.

No writer: conflito externo, estado esperado divergente, concorrência entre provedores para a fonte selecionada, rollback da criação do asset e commit indeterminado sem retry. No reader: ordem invertida não muda seleção; duas fontes inesperadas geram fallback; BLOCKED/REVOKED não são ressuscitados; fonte com URL/hash inválidos não chega ao componente. Na UI: erros mantêm fallback e 40 identidades atuais seguem iguais; nenhum CSS global altera as artes.

Nesta etapa a entrega segura ainda exige a decisão de redirects/integridade descrita acima. Por isso a mudança preparada é documental: nenhum código de produção ou teste novo de comportamento inexistente foi adicionado. Próximo incremento recomendado: implementar Brack sozinho após fechar esse contrato, deixando as outras quatro candidatas desabilitadas. Cadastro em Production exige operação posterior explicitamente autorizada, preflight e recibos.

Validação local desta revisão: cinco arquivos de imagem arquivados com SHA-256 igual aos respectivos JSONs; 71 testes existentes do writer, pipeline e apresentação aprovados; `npx tsc --noEmit`, `npm run lint` e `git diff --check` aprovados. O documento novo também foi verificado com `git diff --no-index --check`. Nenhum teste consultou Production ou o provedor. Git ficou limpo após o commit solicitado; ao final existe somente este documento novo, sem commit.
