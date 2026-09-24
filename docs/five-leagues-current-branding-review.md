# Cinco ligas — fontes oficiais atuais, sem publicação

Leitura realizada após o cadastro das quatro ligas em 23/09/2026 local / 24/09 UTC. Cobertura permanece 40/45. Nenhum ID, asset, variável, migration ou allowlist foi alterado nesta investigação. As cinco continuam pendentes para cadastro; arquivos atuais não foram apresentados como imagens da API-Football.

## Conclusões por competição

| Competição / API | Arquivo exato encontrado | Comparação e pendência |
| --- | --- | --- |
| A-League / 188 | A-Leagues-Logo_Men_Horizontal_Colour_Black_RGB_061021-1.webp, servido como PNG, no site oficial masculino | Inspeção: ISUZU UTE e A-LEAGUE preto/vermelho, substitui a esfera laranja histórica. A [história oficial](https://aleagues.com.au/more/about-the-a-leagues/) registra rebranding de 2021. Marca da competição masculina localizada; arquivo horizontal muito largo e preto exige avaliação de legibilidade sem modificar a arte. A página atual já é 2026/27; vincular explicitamente a versão escolhida ao catálogo 2025/26 no futuro manifesto. |
| Brack Super League / 207 | RZ_BSL_Logo_Portrait_RGB, PNG do media kit Brack | Inspeção: BRACK. Super League, moldura vermelha, jogador branco. [SFL](https://sfl.ch/de/articles/sfl-im-neuen-look-markenauftritt-mit-brinkertluck-schweiz-neu-gestaltet) documenta a mudança para 2025/26; [media kit](https://newsroom.brackalltron.ch/en/assets/236618/) identifica a imagem. Evidência visual/temporal coerente, substitui Credit Suisse. Preparar fonte oficial e decisão próprias antes de cadastrar. |
| ISL / 323 | isl-logo.svg?v=100.54, background do link de logo no site oficial | SVG 74×74, bola vermelha e texto branco; sem a marca Hero do PNG antigo. [Site oficial](https://www.indiansuperleague.com/) identifica a temporada 2025/26. Arquivo inspecionado no navegador e metadados medidos. Avaliar entrega segura de SVG/contraste em operação própria; não converter ou hospedar sem decisão específica. Pendências Punjab/East Bengal/Hyderabad são independentes. |
| Liga Cyprus / 318 | SponsorPics/1765366878.jpg na faixa da competição CFA | JPEG com taça, CYPRUS LEAGUE by Stoiximan e CFA, diferente do emblema genérico KOP. A navegação da [temporada oficial 2025/26](https://www.cfa.com.cy/En/seasons/77) chegou à página de fase final que mostra esse branding e APOEL. Identidade visual da competição encontrada, mas o vínculo EA/local APOEL 557 versus 2247 continua sem fechamento. Não usar o nome aproximado como prova. Composição inclui patrocinador e marca federativa; definir uso da arte completa sem recortar. |
| ROSHN Saudi League / 307 | Roshn-Saudi-League_pchauk.png no site oficial | PNG atual com RSL e segmentos multicoloridos, diferente do SPL antigo. [Fonte oficial](https://www.spl.com.sa/en) já exibe 2026/27, e o caminho possui versão de 2026. Evidência de uso atual confirmada; falta comprovar a mesma versão exata para o catálogo 2025/26 ou decidir explicitamente usar a marca atual. Não inferir equivalência temporal só porque é a mesma competição. |

## Bloqueio técnico comum para futuro cadastro

O writer `services/brandAssetWrite.ts` exige provider api-football e a URL exata `https://media.api-sports.io/football/leagues/{id}.png`. `next.config.ts` só permite imagens remotas nos caminhos API-Sports existentes. As cinco novas fontes oficiais não passam por esse contrato. Não se deve atribuir a elas procedência API-Football, trocar bytes sob o hash antigo ou ampliar domínios genericamente. É necessária proposta separada e mínima para procedência oficial, URLs exatas, validação de formato (incluindo SVG), reader/Next, autorização específica e testes. Nenhuma mudança desse tipo foi implementada.

A evidência técnica não representa licença. Não se estende a decisão operacional das quatro ligas às cinco restantes. Correções de clubes exigem seu próprio preflight e transação, preservando histórico.

## Artefatos técnicos

Diretório: `audit/output/five-current-branding-20260924/`. Cinco requisições pontuais aos arquivos oficiais, uma por arquivo, todas HTTP 200, sem retry; zero chamadas autenticadas à API-Football. Navegação normal nos sites foi separada dessas cinco coletas. Cada JSON contém URL exata, origem, horário, formato decodificado, dimensões, bytes e SHA-256. Arquivos preservados sem edição. O arquivo 188 termina em `.webp`, mas MIME e bytes são PNG — usar o formato detectado, não presumir pela extensão.


| API | Formato / dimensões | SHA-256 | URL exata |
|---|---|---|---|
| 188 | png / 2693×301 | 875736909a53b648a8beac5444ceccb551d9c4d785e448aee80f3c64414a8fac | https://aleagues.com.au/wp-content/uploads/sites/17/2023/08/A-Leagues-Logo_Men_Horizontal_Colour_Black_RGB_061021-1.webp |
| 207 | png / 1044×1005 | 9495ccc727eb8b6fffef811a77f0a1ea6f751bb848c4aac99116ec5a85a3c8ea | https://d21buns5ku92am.cloudfront.net/69864/images/602591-RZ_BSL_Logo_Portrait_RGB-64e276-original-1753264028.png?download=1 |
| 323 | svg / 74×74 | 58e9824e6a3bc95081139c3fa64385994facc9e45feb59f93e8848e2bbaec884 | https://www.indiansuperleague.com/static-assets/images/svg/isl-logo.svg?v=100.54 |
| 318 | jpeg / 800×337 | 3adf4cca488288be34dc0a505a5c6490e376671c3d4a66aa1958eafb736139d3 | https://www.cfa.com.cy/images/SponsorPics/1765366878.jpg |
| 307 | png / 512×512 | 30f9b6a053a80f9b45e9c77b99c62efc3d73dd1da3d3d9295d70b609788a8bc1 | https://images.spl.com.sa/image/private/t_q_good/v1785321708/prd/assets/icons/Roshn-Saudi-League_pchauk.png |
