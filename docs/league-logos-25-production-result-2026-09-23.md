# Execução das 25 logos autorizadas em Production — 23/09/2026

**CONCLUÍDA: 25 COMMITTED / INDEPENDENT_READ_CONFIRMED. Cobertura pública real: 36/45 (80%).** Cinco grupos de cinco, uma transação do writer por asset, sem INSERT manual, retry, falha ou commit indeterminado. As nove REVIEW permanecem em fallback.

## Destino e autorização

Workspace `zgid79r99qbyucdg5d9dvhqi`, projeto `m0f43nhdf2ylv4i1nvo6pwsj`, database ID Production **`rknsog8tmbl5u4xqbogxfux5`**, branch Console `br_vs6n9nb4bdz6kw8rasx9f66k`. Conexão obtida no modal Connect desse ID e transferida diretamente para processo isolado, somente em memória; nenhum uso de DATABASE_URL/DIRECT_URL do .env antigo, nenhuma URL/credencial persistida. Processo encerrado após a confirmação final. Staging `jj51gk17l30qv1uibsj3g46u` não foi usado.

Decisão: `owner-decision:brand-assets-25-verified-leagues-2026-09-23`, [registro específico](league-logos-25-operational-authorization-2026-09-23.md). Todos os assets mantêm `rightsStatus=REVIEW_REQUIRED`, `storageUrl=null`, `revocable=true`, `OWNER_AUTHORIZED_REMOTE_USE`, `DISPLAY_ALLOWED`; isso não é licença.

Manifesto original preservado, SHA-256 `b86f64b18714736d2911692c7d6f74e15e258bee598b0ef1acded0854ddeb401`. Seus campos de rascunho são históricos: autorização e recibos posteriores documentam o estado executado.

## Preflight e preservação

O snapshot auditado correspondeu por IDs e SHA-256 canônicos de Club (campos auditados), League (todos os campos), identidades com assets (todos os campos) e vínculos dos jogadores Red Star. Contagens não foram usadas como prova isolada. Hashes comparados:

| Conjunto | SHA-256 canônico |
|---|---|
| clubs | `253110d98cc47bf2558fc536de7bf01e1755c2debc72ef8903d5206f73b085ff` |
| leagues | `4bf230fa30d013ce0742fa76c7184909069e3b991461f0fc6c7487f537bddcba` |
| identities | `743ee2018b87bd42df9f73d8604e4f979274464ec526c5a68578a082c7380129` |
| players | `ee41da7ca1421e1af5280113e0951bc00f6ee5e74935db0f02b20731e8f83876` |

As 19 migrations concluídas têm checksums correspondentes aos arquivos do projeto. A única pendente é `20260923170000_brand_identity_blocked_history`; **não foi aplicada**. Schema e índices existentes permitem as 25 novas identidades de ligas. Red Star 104 exige operação separada; 4396 permaneceu BLOCKED e seu asset REVOKED/DISPLAY_BLOCKED, sem alteração.

Antes de cada grupo e asset, o runner reconferiu os estados e a preservação do histórico. As 25 imagens foram requisitadas uma vez cada, cinco por grupo antes das escritas, com HTTP 200, assinatura PNG e SHA-256 idêntico ao manifesto. Os 585 registros de identidade e 585 assets preexistentes permaneceram íntegros; foram adicionadas somente 25 identidades e 25 assets, total final 610/610. Cada novo registro tem versão 1.

Hashes integrais MD5 de todas as linhas, obtidos em leitura protegida e preservados até o final:

| Tabela | Linhas antes/depois | Hash antes = depois |
|---|---:|---|
| Club | 582 | `5edcd3ec9b4ba7d655bb8f74dda7ba95` |
| League | 45 | `d6abf94b92514885587f60b7645d5ec2` |
| Player | 16228 | `9a93e18ad061587e3b36b7d85d2d0bea` |

## Resultado por liga

Em todas as linhas, identidade VERIFIED/v1, asset ACTIVE/v1, recibo COMMITTED / INDEPENDENT_READ_CONFIRMED e imagem carregada na interface pública. League.id, URL e hash da imagem estão vinculados no [manifesto](league-logos-25-manifest-2026-09-23.json).

| Grupo | Liga | API-Football | Identity ID | Asset ID | Resultado / UI |
|---:|---|---:|---|---|---|
| 1 | Ligue 2 BKT | 62 | `cmuelha7g0000houcuxsupx7z` | `cmuelhabs0001houc3ieipfg2` | CONFIRMADO / carregada |
| 1 | EFL League Two | 42 | `cmuelhh1a0002houchjetkmh6` | `cmuelhh570003houcq9xyk4zm` | CONFIRMADO / carregada |
| 1 | 1A Pro League | 144 | `cmuelhnv70004houcd1m25mvz` | `cmuelhnz30005houc0s6w8xvv` | CONFIRMADO / carregada |
| 1 | 3F Superliga | 119 | `cmuelhutf0006houcu8yqirhj` | `cmuelhuxe0007houcbn5q5jbt` | CONFIRMADO / carregada |
| 1 | Allsvenskan | 113 | `cmueli8dk0008houc3idm3b5a` | `cmueli8hg0009houce3f3o3vs` | CONFIRMADO / carregada |
| 2 | Česká Liga | 345 | `cmuelj8cr000ahoucc8bi1uhs` | `cmuelj8gn000bhoucwazkxt5a` | CONFIRMADO / carregada |
| 2 | CSL | 169 | `cmueljey1000choucn81q6bmy` | `cmueljf1r000dhouce8inzu0w` | CONFIRMADO / carregada |
| 2 | Eliteserien | 103 | `cmueljln6000ehouc0zy4etwr` | `cmueljlqy000fhoucvnnw8otd` | CONFIRMADO / carregada |
| 2 | Finnliiga | 244 | `cmueljsbh000ghoucip921rrf` | `cmueljsfg000hhouckybeofk8` | CONFIRMADO / carregada |
| 2 | Hellas Liga | 197 | `cmueljzb0000ihoucd4z5g5m9` | `cmueljzer000jhoucike0im8s` | CONFIRMADO / carregada |
| 3 | K League 1 | 292 | `cmuelku3p000khouckdkfvoxg` | `cmuelku7f000lhoucaj9zf7gd` | CONFIRMADO / carregada |
| 3 | Liga Azerbaijan | 419 | `cmuell0wb000mhouc0fhurqy8` | `cmuell101000nhoucmlbalug9` | CONFIRMADO / carregada |
| 3 | Liga Chile | 265 | `cmuell7ji000ohoucwpq89x0c` | `cmuell7nb000phoucxgl9e1sv` | CONFIRMADO / carregada |
| 3 | Liga Hrvatska | 210 | `cmuellel7000qhoucsilyaifv` | `cmuelleoy000rhouc4t129pxp` | CONFIRMADO / carregada |
| 3 | Magyar Liga | 271 | `cmuelll7s000shouc5u28bxq8` | `cmuelllbh000thouc2ur2jrak` | CONFIRMADO / carregada |
| 4 | Ö. Bundesliga | 218 | `cmuelnnaf000uhoucnq4nisze` | `cmuelnne7000vhoucclhxiphc` | CONFIRMADO / carregada |
| 4 | PKO BP Ekstraklasa | 106 | `cmuelnu6y000whoucq1c01lxk` | `cmuelnuaw000xhouco07vqhaq` | CONFIRMADO / carregada |
| 4 | Scottish Prem | 179 | `cmuelo0u8000yhoucl6nqfziq` | `cmuelo0xy000zhouclkfymfz4` | CONFIRMADO / carregada |
| 4 | SSE Airtricity PD | 357 | `cmuelo7pr0010houcfq4zlmbu` | `cmuelo7tg0011houcag9rxc5p` | CONFIRMADO / carregada |
| 4 | Trendyol Süper Lig | 203 | `cmueloevc0012houc2uzuprpk` | `cmueloez30013houcg5q3170e` | CONFIRMADO / carregada |
| 5 | Ukrayina Liha | 333 | `cmuelp3b50014houczqw72z3y` | `cmuelp3f00015houcsqr057wj` | CONFIRMADO / carregada |
| 5 | United Emirates League | 301 | `cmuelpa6m0016houcade3unq4` | `cmuelpaak0017houcx68j7j0z` | CONFIRMADO / carregada |
| 5 | SUPERLIGA | 283 | `cmuelpgy70018houclm87ptfy` | `cmuelph210019houcnfduivi5` | CONFIRMADO / carregada |
| 5 | Libertadores | 13 | `cmuelpnpr001ahouc6f66ig8l` | `cmuelpntn001bhouccg9q7vfi` | CONFIRMADO / carregada |
| 5 | Sudamericana | 11 | `cmuelpui2001chouc9bzdw7od` | `cmuelpuly001dhoucul2xywgr` | CONFIRMADO / carregada |

Cobertura após cada grupo: **16/45 → 21/45 → 26/45 → 31/45 → 36/45**.

## Recibos auditáveis

Diretório local ignorado pelo Git: `audit/output/league25-production-20260923/`. Há preflight, evidência HTTP/hash de cada imagem, cinco checkpoints de grupo, 25 resultados do writer e 25 recibos finais. O marcador `write-ID.pending.json` foi preservado e cada um possui o recibo final correspondente; não são 25 operações indeterminadas. Recibos publicados por rename de arquivo temporário no mesmo diretório. Não repetir uma transação a partir de um marcador: consultar primeiro o recibo final e o estado persistido.

| API-Football | Recibo | SHA-256 do recibo |
|---:|---|---|
| 62 | `write-62.receipt.json` | `21e87f590ff842d4db98bf93fa14f6af62ca462f6b59acb964d11b7b01d83cf3` |
| 42 | `write-42.receipt.json` | `90adaf4fbdf4c78b3b2bd9bfcd3105c84a72c9adfc1542c67e2db200ccece942` |
| 144 | `write-144.receipt.json` | `5304d20817f2dc9a6cdafd8c79230d8b54e600cff2c00d8c8b59929ade30527a` |
| 119 | `write-119.receipt.json` | `460f286e5cc205ce0938a44c6c367cbb25e33959d78653ce7a41f6c544e98068` |
| 113 | `write-113.receipt.json` | `65b1f2b3beceebede00f050a4184f2963a75357ba5d07b2d9dbd51c4adcc8296` |
| 345 | `write-345.receipt.json` | `dc23ac03993c2ce6e394e950f455f435d20e8b41f13a9b85d46f9c8de6d0dc4e` |
| 169 | `write-169.receipt.json` | `04a8d0bc6fbde6f5aa941a952a1aaf156f92ccb1a67cd35fc7ff1f4ebd619fc7` |
| 103 | `write-103.receipt.json` | `7823b9846b643a3afeb8230c812db6b5264499ab087d1bf74e188b281958c9fb` |
| 244 | `write-244.receipt.json` | `5546106ba71302c8282eead0cc5dca7bdae8158f86fbc1dc9eeca9744c40c8a5` |
| 197 | `write-197.receipt.json` | `9785c20eaa9a7ae3d1af37e4401b89347bec86176ff8205e13a9466de7331954` |
| 292 | `write-292.receipt.json` | `1556b6f2ee50d02c414cad84289100f3c540fc9e4404e053048d457522c75fe0` |
| 419 | `write-419.receipt.json` | `d9be314d79fea2752061d170a691324a5917f55eaf8c9838a760660dd4952c65` |
| 265 | `write-265.receipt.json` | `4557b1f50f77291193dcce04ea0135d14d0b16434072bf9b75f389ea8ac8aca5` |
| 210 | `write-210.receipt.json` | `3bffde085a30ad22ee35b07c549b9e74507cb495e135bcb3504bb546cbbd3a53` |
| 271 | `write-271.receipt.json` | `494677a0d93412fbc52f3edcf7a66aa1f720b3be0373f79f2da63c63b53e64d7` |
| 218 | `write-218.receipt.json` | `d172af4fbaa046dc8bb164c435a586e7068c69c69d24ddbb2f2a2394897b81d7` |
| 106 | `write-106.receipt.json` | `997c0e1cd337c4115a4b2ed15e3f808800d9a5bd4c29798574381fe5cdbb9313` |
| 179 | `write-179.receipt.json` | `1c768e8cf9448b8ed721bdde49bdf06c5c53b5a2ab38741c2fd864b6abe5d537` |
| 357 | `write-357.receipt.json` | `4445218615daef2c0221577a0e3da3c93fd59abe7fa94eb1281ec0bcdbba62cb` |
| 203 | `write-203.receipt.json` | `6ebb4f746edeb85c726996b00d4c60faa609cd9a42e2f70f6c5b8a1e428ee181` |
| 333 | `write-333.receipt.json` | `32b8eb720752f054ff1c4c5c1666cd2369bc80c78f6491852ad72c6e567c73af` |
| 301 | `write-301.receipt.json` | `3a7e8a730f098cb3c252a1c76cb5bd6bbaf2fe5841bdeba7547e4853b19f96e4` |
| 283 | `write-283.receipt.json` | `d7533c84ee054c9981d892e23bd356033fd9b8b66ebd1cb2e73151e23ed4ea87` |
| 13 | `write-13.receipt.json` | `7d234f37da53e257246325f4111094461fa1ced9c4906e2cdfe59aaab3f299a8` |
| 11 | `write-11.receipt.json` | `61174e39439167e5d570d655b392ff23cb01edda044eae4319949e927059a205` |

Preflight SHA-256: `5003697f44ec15a824e7b10cbc5ea8817086a5a3ea3e9bb220969572e23540d9`. Confirmação final SHA-256: `8579b6d08603cbae35ff58943846918f280eb8063604a197d690b8444490df59`.

## Interface e cobertura exibível

Conferidas [página 1](https://futscout.vercel.app/pt/ligas) e [página 2](https://futscout.vercel.app/pt/ligas?page=2) públicas existentes, sem deploy: 17 + 19 imagens, todas com `complete=true` e `naturalWidth>0`; IDs exatos conferidos nas URLs renderizadas. As 25 novas e as 11 anteriores carregaram. Nove fallbacks correspondem exatamente às ligas REVIEW. Não foi necessária alteração de Vercel ou variável de publicação. O contraste/branding histórico registrado na auditoria continua sendo uma limitação visual; não foram editadas imagens oficiais ou estilos nesta operação.

## Nove REVIEW — evidência adicional, sem correção automática

| Liga | Motivo específico remanescente |
|---|---|
| LALIGA HYPERMOTION | Fechar vínculo EA 110711 ↔ Real Sociedad II 9585; associação local continua null. |
| EFL League One | Consulta exata de competições de 22652 retornou FA Women's Cup 698, temporada 2023; reforça incompatibilidade com Wigan masculino/League One 61. Preparar correção separada com evidência EA e histórico. |
| 3. Liga | Fechar vínculos EA 110685/110697 das reservas com 9364/12867; campos locais null. |
| A-League | 19008 é Central Coast de Solomon-Islands; candidato australiano 941. Corrigir somente após plano individual. |
| Brack Super League | Imagem exibe Credit Suisse; definir versão visual correspondente ao branding Brack. |
| ISL | Punjab 7179 retornou Santosh Trophy 325/2025, não ISL; East Bengal 3463 retornou AIFF Super Cup 545 e Calcutta Premier Division 1020/2025. Resolver divergência com elenco 323, reserva East Bengal II e temporalidade Hyderabad/Delhi sem substituir por nome. |
| Liga Cyprus | Consulta de competições de APOEL 557 retornou lista vazia; isso é ausência de evidência, não prova de inexistência ou autorização para substituir por 2247. |
| ROSHN Saudi League | 8097 é Al Hilal da Líbia; candidato saudita 2932. Corrigir em operação individual. |
| LPF | Estudiantes 27751/Aruba, Unión 21371/Latvia e Central Córdoba 790/Rosario incompatíveis com os candidatos 450/441/1065. |

Quatro consultas pontuais adicionais à API, sem retry: `review/wigan-competitions.json`, `apoel-competitions.json`, `punjab-2025.json`, `eastbengal-2025.json`. Todas HTTP 200; contador diário 7389 → 7386 (anterior 7390), minuto 299 → 296, sem salto >1, 429 ou quota próxima. Essas quatro chamadas são separadas das 25 requisições de imagem do cadastro e das requisições normais do navegador. Nenhum escudo foi cadastrado, revogado ou associado nesta etapa; o total de escudos anteriormente exibíveis continua sem certificação integral de identidade, conforme o relatório anterior.

## Testes e arquivos

43 testes pertinentes distintos passaram (writer, proteção read-only e apresentação), incluindo novo teste que fixa hash/ordem/identidades das 25 entradas. `npx tsc --noEmit`, `npm run lint` e `git diff --check` passaram.

Código alterado: `services/brandAssetWrite.ts` (somente 25 entradas) e `tests/unit/services/brandAssetWrite.test.ts` (contagens e teste de escopo autorizado). Documentação de autorização, manifesto, fila e checkpoints recebeu referências ao resultado posterior. O JSON original permanece inalterado. Runner e recibos estão em audit/output ignorado. Sem commit, push, deploy, migration, alteração de IDs de clubes ou uso da conexão antiga para escrever.

Na revisão para commit, `.gitattributes` fixou `eol=lf` exclusivamente no manifesto JSON, para preservar seu SHA-256 também em checkouts Windows com `core.autocrlf=true`. Nenhum byte do manifesto autorizado foi alterado. Os 25 recibos, hashes das imagens, escopo da decisão, exclusão das nove REVIEW e do Red Star 104 foram reconferidos localmente; 43 testes pertinentes passaram novamente.
