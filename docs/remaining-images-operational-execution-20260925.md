# Imagens restantes — autorização e execução

Decisão `FUTSCOUT-REMAINING-CLUBS-20260925-v1`. O proprietário autorizou expressamente nesta tarefa a correção das associações comprovadas, preservação do histórico e vínculos, cadastro de imagens verificadas e publicação do SHA validado. A autorização geral “eu autorizo todas as logos e escudos estarem no site” foi registrada em `2026-09-24T14:21:36Z`, referência `owner-message:2026-09-24T14:21:36Z:all-logos-crests`; não se atribui esse horário à mensagem original.

Escopo exato de identidade: Wigan 22652→61; Punjab 7179→3466; Al Hilal 8097→2932; Central Coast 19008→941; Estudiantes 27751→450; Unión 21371→441; Central Córdoba 790→1065; APOEL 557→2247 (normalização canônica, não afirmação de outro clube); reservas Real Sociedad B null→9585, Hoffenheim II null→9364 e Stuttgart II null→12867. IDs locais, EA, liga e evidência são pinados individualmente em `audit/output/club-resolution-20260925/*.pin.json`, conforme os relatórios de identidade. East Bengal 3463 e Hyderabad 7763 permanecem inalterados.

Cada imagem exige SHA-256 exato e inspeção visual, `rightsStatus=REVIEW_REQUIRED`, `storageUrl=null`, `OWNER_AUTHORIZED_REMOTE_USE`, `DISPLAY_ALLOWED` e revogação individual. Exibição remota implica indisponibilidade ou alteração dos bytes na origem e riscos operacionais de marca; esta decisão não é licença. Punjab 3466 contém marca antiga RoundGlass e permanece em REVIEW visual: corrigir a identidade não autoriza publicar esses bytes.

Destino exclusivo: Production `rknsog8tmbl5u4xqbogxfux5`, conexão direct isolada previamente emitida no Console para esse ID. Nenhum comando carrega `.env` ou usa singleton de runtime. O preflight de 25/09 15:46:27Z confirmou o baseline integral + recibos oficiais: 43 logos e 574 escudos elegíveis, 618 identidades/assets. Recibo `audit/output/remaining-images-start-20260925.json`.

## Operação individual e reconciliação

1. `npx tsx scripts/clubIdentityOperation.ts preflight <connection-file> <pin.json> <preflight.json>`: somente leitura, 20 migrations concluídas, incluindo histórico bloqueado, ocupação livre, EA/liga/jogadores, versões e hashes protegidos.
2. Conferir preflight e SHA-256 do arquivo. `npx tsx scripts/clubIdentityOperation.ts execute <connection-file> <pin.json> <receipt.json> <preflight.json> <sha256>`: um clube, uma transação Serializable, lock timeout 3s, sem retry. Precondições completas dentro da transação; mudanças exclusivamente ID, quarentena e evidência histórica. Marcador `.pending.json` durável antes da transação, mantido após publicação atômica do recibo.
3. Leitura independente compara o estado inteiro. Em resultado indeterminado/falha de confirmação: `npx tsx scripts/clubIdentityOperation.ts reconcile <connection-file> <pin.json> unused <receipt-or-pending.json> <sha256>`. Só lê; `MATCHES_EXPECTED`, `MATCHES_BEFORE` ou `DIVERGED`; nenhuma repetição automática.
4. Cadastro de cada escudo ocorre separadamente pelo writer existente, somente após ID confirmado, allowlist exata, imagem validada e ausência de conflito. Preservar identidade antiga BLOCKED e escudo REVOKED/DISPLAY_BLOCKED. Nenhuma identidade ou evidência histórica é apagada.

Compensação não restaura ID conhecido como errado. Se necessária, exige nova operação revisada e estado esperado para limpar o ID para null, mantendo histórico e escudo antigo bloqueados. Não há reversão automática.

Cinco representações genéricas (quatro aliases EA e placeholder Bayer) não são assets oficiais, não entram no Registry nem na contagem oficial. O fallback é identificado por nome em PT/EN.

Resultados e SHA público serão acrescentados somente após confirmação efetiva.

## Fontes oficiais adicionais autorizadas

Decisão específica `FUTSCOUT-REMAINING-OFFICIAL-20260925-v1`, sob a mesma autorização expressa do proprietário. Inspeção no componente real em 25/09: A-League 224×36 e Cyprus 160×68, arte inteira sobre branco, sem overflow no painel de 320 px. Punjab usa SVG oficial atual inteiro no fundo escuro. As fontes não são rotuladas API-Football.

| Entidade local | Provedor / versão | URL exata | SHA-256 |
|---|---|---|---|
| A-League `cmt9i85450055q4ucarbpij51` | official-aleagues / marca atual 2026/27, introduzida em 2021 | `https://aleagues.com.au/wp-content/uploads/sites/17/2023/08/A-Leagues-Logo_Men_Horizontal_Colour_Black_RGB_061021-1.webp` | `875736909a53b648a8beac5444ceccb551d9c4d785e448aee80f3c64414a8fac` |
| Cyprus `cmt9gj2es04801sucqqr7lpq7` | official-cfa / 2025/26 | `https://www.cfa.com.cy/images/SponsorPics/1765366878.jpg` | `3adf4cca488288be34dc0a505a5c6490e376671c3d4a66aa1958eafb736139d3` |
| Punjab `cmtbpdgt2009zpkuc9j70jvc8` | official-punjab / atual 2026; clube API3466 | `https://rgpunjabfc.com/wp-content/uploads/website-logo-3.svg` | `9913f9994757e5af31302428699afa8bd28c2d489ebc0b3d83ba2894b17bd472` |

Cada uma mantém REVIEW_REQUIRED, storageUrl=null e revogação individual. PNG A-League apesar da extensão WebP, JPEG Cyprus com dimensões/SOF/EOI e hash exatos, SVG Punjab com gramática fechada e hash exato. Não há permissões genéricas de host, redirects, URL fornecida pelo usuário ou cache persistente de cópias. Flags ALEAGUE/CYPRUS/PUNJAB_BRAND_ASSET_DELIVERY_ENABLED são independentes, default false, habilitadas somente após o código validado alcançar Production. Sem asset aprovado a rota continua 404.

Ligas: `npx tsx scripts/officialLeagueOperation.ts preflight <aleague|cyprus> <connection-file> <preflight.json>`; vincular arquivo/SHA do preflight ao documento JSON de decisão exata; `register <key> <connection-file> <receipt.json> <approval.json>`; em indeterminação usar somente `confirm`. Punjab: manifesto exato e `verifiedCrestOperation.ts preflight/register/reconcile`, exigindo Club.apiFootballId=3466 dentro do writer e preservando a identidade7179 bloqueada. Nenhuma marca RoundGlass do endpoint3466 será cadastrada.

## Correções confirmadas em Production

| Clube | API antes→depois | Jogadores preservados | Recibo |
|---|---|---:|---|
| Al Hilal | 8097→2932 | 30 | al-hilal.receipt.json |
| APOEL FC | 557→2247 | 25 | apoel.receipt.json |
| Central Coast | 19008→941 | 17 | central-coast.receipt.json |
| Central Córdoba | 790→1065 | 32 | central-cordoba.receipt.json |
| Estudiantes | 27751→450 | 28 | estudiantes.receipt.json |
| TSG Hoffenheim II | null→9364 | 24 | hoffenheim-ii.receipt.json |
| Punjab FC | 7179→3466 | 14 | punjab.receipt.json |
| Real Sociedad B | null→9585 | 7 | real-sociedad-b.receipt.json |
| VfB Stuttgart II | null→12867 | 29 | stuttgart-ii.receipt.json |
| Unión | 21371→441 | 26 | union.receipt.json |
| Wigan Athletic | 22652→61 | 27 | wigan.receipt.json |

Todos os IDs EA, ligas e conjuntos de jogadores foram comparados antes/depois; oito identidades históricas passaram VERIFIED v1→BLOCKED v2 e seus assets mantiveram bytes/histórico, com REVOKED/DISPLAY_BLOCKED v2. Os três reservas não possuíam identidade anterior. 11 transações únicas, zero retries.

Doze recibos `*.crest-receipt.json` confirmam dez novos escudos API-Football e duas versões novas (East Bengal e Hyderabad) após mudança dos bytes. Os assets anteriores desses dois ficaram STALE, sem sobrescrever hashes. Punjab oficial aguarda publicação/cadastro. Contagem intermediária: 43 logos, 576 escudos elegíveis e seis fallbacks (cinco genéricos previstos + Punjab pendente).

## Validação do candidato e publicação

Suíte completa: 1.619 testes, 1.611 aprovados, oito HTTP executados separadamente; zero falhas finais. Oito HTTP/SSR estritos aprovados contra staging isolado. Primeira execução local foi bloqueada pela sandbox (EACCES); após liberação, a primeira conexão fria excedeu maxWait (P2028), e a execução subsequente completa passou. Não se enfraqueceram testes nem se alteraram dados para isso. TypeScript, lint geral, build e diff-check aprovados. Build usa URLs PostgreSQL loopback inválidas exclusivamente no processo e SITE_URL público; não modifica `.env`. Scripts gerados CommonJS foram convertidos para ESM para corrigir lint, sem apagar recibos ou ampliar exclusões.

Preview usa o mesmo banco de Production e será apenas inspecionado; flags novas continuam ausentes/default false nele. Configs não secretas ALEAGUE/CYPRUS/PUNJAB_BRAND_ASSET_DELIVERY_ENABLED=true foram preparadas apenas em Production, entrando em vigor no novo deployment. Código anterior não tem essas rotas. Mesmo habilitadas, as novas rotas exigem asset aprovado no Registry. Publicar somente o SHA validado; conferir Preview e promover esse SHA, então cadastrar as três fontes individualmente e confirmar no público.

Rollback de aplicação disponível: deployment público anterior `dpl_2NB4kDuWKZwAAFDY5KUZ1YKTpMQR`, SHA `2786e75cd9d6c8e3db08261ae324161131eb8083`. Rollback não desfaz correções de identidade; histórico errado continua bloqueado. As três fontes novas voltariam ao fallback até restaurar código compatível. Não restaurar IDs comprovadamente incorretos.

## Execução pública confirmada em 25/09

SHA `e9102b61019998bab762676c31c0d3b6f2839dbd` validado e publicado no deployment Production `dpl_J5Yuss1fHj9X2Ywg9vJ7gw84WGeR`, após Preview `dpl_EK8bD9PcWCeFeenPhQY5EDUcTR1y`. Preview compartilha o banco e não foi tratado como isolado. Verificações HTTP sem sessão no Preview redirecionaram à autenticação; os oito 404 estritos foram confirmados no público depois da publicação.

A-League, Cyprus e Punjab tiveram transação única e leitura independente `COMMITTED_INDEPENDENT_READ_CONFIRMED`. Recibos em `audit/output/club-resolution-20260925/aleague.official-receipt.json`, `cyprus.official-receipt.json` e `punjab.crest-receipt.json`. Nenhuma transação foi repetida. A comparação integral das identidades/assets e IDs do catálogo com baseline mais recibos, em `2026-09-25T16:46:08.996Z`, confirmou 45 logos elegíveis e 577 escudos, 631 identidades e 633 assets, sem alteração inexplicada: `audit/output/remaining-images-final-registry-20260925.json`.

A verificação pública `audit/output/remaining-images-public-registered-20260925.json` confirmou Cyprus JPEG e Punjab SVG com HTTP 200 e hashes exatos, as 13 páginas de clubes com fontes corretas e os oito 404 PT/EN. Inspeção visual pública confirmou Cyprus inteira/legível e Punjab atual. A-League retornou 502 e fallback: **cobertura efetivamente entregue nesta verificação 44/45**, não 45/45. Log Vercel `f6ml7-1790354243900-783295c7ccc3`, 16:37:23.900Z, duração 1,39s, não expôs a fase da exceção. O cadastro confirmado não será repetido; diagnóstico de entrega é separado da identidade.

Cinco clubes ficam com representação explicitamente genérica, fora da contagem oficial: Bayer Leverkusen placeholder `mock-bayer-leverkusen`, Lombardia FC, Milano FC, Latium e Bergamo Calcio (aliases EA). Os três reservas antes sem escudo agora têm fonte oficial API-Football. Das dez associações suspeitas, sete IDs errados foram corrigidos, APOEL foi normalizado ao ID canônico e East Bengal/Hyderabad mantiveram identidade comprovada, com renovação versionada da imagem.

## Resultado final e bloqueio comprovado de entrega

Publicado o diagnóstico sanitizado no SHA `9a52565ed1f42b204361aad3a56e0d1258fef591`, Preview `dpl_4TrzA7dvNYfXAAkwRWgGFkYv4RpX` e Production `dpl_2LNXNRFaXHHfSRqhA6AQDW29gynW`. Ambos Ready; Preview inspecionado com Wigan e seus 27 jogadores. O diagnóstico não altera decisões, URLs, limites, hashes ou fallback e não registra mensagem de exceção, corpo, stack ou credenciais.

Às 16:55:38Z a rota A-League retornou 502. Log sanitizado: origem HTTP 200, PNG, encoding identity, URL exata, sem redirect, **Content-Length 15498**, contra **15388** exigidos; rejeição na fase fetch-headers em 895ms. Uma leitura local adicional às 16:59:01Z retornou os 15388 bytes originais e SHA-256 exato, PNG 2693×301, Vary Accept e X-Cache HIT. Não houve mudança uniforme comprovada da fonte: existe divergência entre as respostas observadas nos ambientes. **Não foi auditado o hash nem o conteúdo visual dos 15498 bytes recebidos pela Vercel.** É necessário capturar essa representação de forma limitada e sem liberá-la ao público, compará-la e somente então preparar uma versão auditada ou fonte estável. Nenhum pin foi flexibilizado; nenhum cadastro repetido.

Recibos técnicos: `audit/output/remaining-images-delivery-diagnostic-20260925.json` e `audit/output/aleague-diagnostic-20260925/local-single-fetch.json`. Catálogo público observado: 23 imagens carregadas na página 1 e 21 na página 2, total **44/45**, somente A-League em fallback. O banco contém 45 assets de liga elegíveis, mas isso não equivale a 45 entregas confirmadas.

Resultado clubes: **574→577 escudos oficiais elegíveis**, com substituição dos incorretos preservando histórico; **cinco representações genéricas** separadas. Confirmação pública dos três reservas e cinco genéricos: `audit/output/public-missing-clubs-confirmation-20260925.json`. Nenhuma marca oficial foi atribuída aos aliases/placeholder para fechar a contagem.

Os nove escudos API-Football dos clubes suspeitos também foram confirmados pelas URLs reais do componente Next Image: nove páginas e nove imagens HTTP 200, IDs exatos, sem retry. `audit/output/remaining-nine-public-crests-confirmed-20260925.json` registra hashes da entrega WebP, distinguidos dos PNG originais do Registry. Punjab oficial foi confirmado separadamente como SVG com hash exato. Assim, todos os 13 clubes com cadastro/renovação desta rodada tiveram entrega pública verificada.

Validação final do SHA diagnóstico: 1621 testes na suíte, **1613 pass, 8 HTTP separados, zero falhas**; oito HTTP públicos estritos pass; TypeScript, lint geral, build e git diff-check pass. Logs `audit/output/remaining-images-diagnostics-{suite,typescript,lint,build}-20260925.log`. O build local corresponde à árvore exata do commit; Preview/Production fizeram build do SHA exato. Não foram aplicadas migrations, alteradas conexões Vercel nem feitas sincronizações amplas. Direitos de todos os novos assets permanecem REVIEW_REQUIRED, storageUrl=null e revogação individual.
