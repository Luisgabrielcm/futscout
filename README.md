# FutScout

Catálogo de jogadores, clubes e ligas para planejar o Modo Carreira, com comparação
de atributos e favoritos locais no navegador. Dados ausentes permanecem ausentes.

## Stack

Next.js 16.3.4 (App Router), React 19.2.8, TypeScript, Prisma 7.9.1,
PostgreSQL e adapter-pg. Use Node.js 24 LTS e npm com o lockfile versionado.
O catálogo precisa de runtime Node, não Edge nem exportação estática.

## Development

1. `npm ci` (inclui `postinstall: prisma generate`; não executa migration/seed).
2. Copiar `.env.example` para `.env` e preencher `DATABASE_URL` com a conexão
   PostgreSQL pooled e `DIRECT_URL` com a conexão direct do mesmo banco.
3. `npx prisma generate` se precisar regenerar o cliente após trocar de checkout.
4. `npm run dev` e abrir `http://localhost:3000`.

O banco deve possuir schema e dados já importados. Não versionar `.env` nem
`app/generated/prisma`. Nenhuma etapa acima provisiona ou migra o banco.

## Quality gates

Em checkout novo, executar `npx next typegen` antes do TypeScript para gerar
os helpers de rota/layout (também gerados por next dev/build).

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Testes automatizados usam mocks/fakes, sem banco ou APIs reais. Scripts manuais em
`scripts/`, `sync/` e `audit/` não fazem parte da descoberta de testes.

## Environment

| Variável | Necessidade |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL TCP pooled, obrigatória no runtime público/local e na Vercel. Build usa URL sintaticamente válida ao importar o singleton, sem consultar o banco. Não há fallback para DIRECT_URL. |
| `DIRECT_URL` | Conexão direct reservada à Prisma CLI/administração local e ao seed. Não é consumida pelo runtime público. |
| `SITE_URL` | Obrigatória em produção: origem pública HTTPS de canonical/hreflang/robots/sitemap. HTTP localhost permitido no smoke; rebuild ao trocar domínio. |
| `API_FOOTBALL_KEY` | Somente operações opcionais; não fornecer ao deployment do catálogo. |
| `DATABASE_MAX_RETRIES`, `DATABASE_RETRY_DELAY_MS`, `DATABASE_OPERATION_TIMEOUT_MS`, `EA_*` | Somente tuning operacional existente de retry/sync/audit/repair. Omitir para defaults. |
| `PORT` | Opcional no servidor próprio; também aceita next start --port. |
| `NODE_ENV` | Gerenciada pelo Next; não sobrescrever manualmente. |

Instalação/prisma generate precisam somente do schema, não de credenciais.
A configuração CLI tolera URL ausente para geração; comandos de banco exigem URL real.
O build não consulta PostgreSQL: CI usa placeholder em loopback, sem servidor.
**Nunca usar o placeholder de CI no runtime público.** Nenhum segredo usa NEXT_PUBLIC_.

### EA incremental auto-sync (prepared, not scheduled)

The existing EA Ratings pipeline is reused by the incremental runner. A read-only
preview requires the explicit `npm run ea:sync:auto:dry-run` command. Write mode is
disabled unless `EA_AUTO_SYNC_WRITE_ENABLED=true`, and must only be enabled after the
pending additive provenance migration is separately reviewed, backed up and applied.
Batch size, maximum batches, locale and gender are environment configuration; job
frequency belongs to the hosting scheduler. No cron or scheduler is active in this repo.

Catalog `ETag` and `Last-Modified` values are recorded when the source supplies them,
but are treated as evidence rather than an unconditional skip. The semantic hash/diff
remains authoritative, so unchanged players do not touch Player, Club, League,
PlayStyles or `Player.updatedAt`. Missing players are never automatically deleted.

## Production

Configurar SITE_URL com o domínio real e DATABASE_URL pooled no ambiente do servidor
(inclusive na Vercel). DIRECT_URL permanece no ambiente local de CLI/administração:

```sh
npm ci
npm run build
npm run start
```

Smoke local: `npm run start -- --hostname 127.0.0.1 --port 3100`.
Em hosting Node próprio, usar porta fornecida e bind 0.0.0.0, não loopback.
Não usar next dev em produção. Build/start não executam operações de dados.

### Rendering/cache

Home chama connection() antes de PostgreSQL: dados por request, sem congelar o
catálogo no build. Listagens usam searchParams; detalhes são rotas dinâmicas sem
geração prévia de slugs. Não há ISR. React.cache nos detalhes compartilha consultas
apenas por request. Robots, sitemap e ícone são estáticos.
Comparar/favoritos preservam noindex por serem seleções pessoais/URLs variáveis;
robots permite acesso, mas essas páginas não constam do sitemap.

### Idiomas (pt-BR e en)

Rotas públicas vivem em `app/[locale]`: `/pt` e `/en`, mantendo segmentos
como jogadores/clubes/ligas e os mesmos slugs persistidos. O layout servidor
valida o locale e define html lang, sem ajuste após hidratação. Não há biblioteca
i18n adicional, tradução de entidades ou mudanças no banco.

`proxy.ts` redireciona somente `/` e URLs públicas antigas sem prefixo. O cookie
de preferência válido prevalece sobre Accept-Language; a preferência de maior
peso pt* escolhe pt, demais idiomas escolhem en, ausência usa pt. URLs já
localizadas nunca são redirecionadas pela preferência. Locale inválido tem
fallback seguro/404. Assets e arquivos Next não passam pela negociação.

PT/EN no menu usa a mesma rota, query e fragmento; o cookie é local, SameSite=Lax,
com duração de um ano. Favoritos/comparação continuam com suas chaves originais
de localStorage, compartilhadas entre idiomas. Se o navegador bloquear storage,
a limitação preexistente de dados apenas na sessão continua aplicável.

Mensagens tipadas em `lib/i18n/dictionaries` incluem templates de apresentação
da análise heurística, sem mudar suas regras. Códigos de posição permanecem
iguais aos atuais. Moeda/data recebem locale explícito; datas usam UTC para
evitar mudança de dia. Nenhuma data ausente é inventada.

Cada página possui canonical e alternates pt-BR/en. O sitemap mínimo tem oito
URLs: Home, Jogadores, Clubes e Ligas em ambos os idiomas. Não enumera entidades
nem URLs de comparação/favoritos (noindex). Não há cache global de locale.

### KNOWN FRAMEWORK LIMITATION — ACCEPTED FOR BETA

Decisão de produto: a limitação SSR dos 404 é aceita temporariamente para a
primeira beta. Reproduzida no Next 16.3.1 e 16.3.4, entidades inexistentes retornam
HTTP 404, e a UI localizada aparece corretamente no navegador com JavaScript.
Porém, o HTML inicial de recuperação (`__next_error__`) não inclui o conteúdo
do not-found nem html lang; a recuperação cliente aplica o layout localizado.
O requisito de 404 totalmente localizado em SSR continua pendente, mas não bloqueia
esta beta por decisão explícita. Páginas válidas continuam exigindo HTTP 200,
SSR com lang e conteúdo localizados, canonical/hreflang e metadata corretos.
Não foi introduzido patch de framework, flag experimental ou alteração manual
de html lang após hidratação. Acompanhar correções upstream do Next e repetir o
gate abaixo em cada atualização do framework; qualquer piora é bloqueante.

A contraprova em produção local reproduziu o mesmo HTTP 404/HTML vazio numa
rota temporária com root layout estático, not-found síncrono e sem i18n, banco
ou componentes do catálogo. Essa rota foi removida após o diagnóstico. Portanto,
mover apenas o layout ou remover hooks da navegação não é uma correção comprovada.
O `getErrorRSCPayload` da versão instalada gera o documento de recuperação vazio
quando o `notFound()` escapa da renderização SSR. `global-not-found` continua
experimental e resolve rotas não correspondidas, não é uma solução comprovada
para as exceções de entidades. Não foi habilitado.

Gate HTTP obrigatório, separado dos testes mockados: após `npm run build`, iniciar
`npm run start -- --hostname 127.0.0.1 --port 3100` com `PGOPTIONS` definido como
`-c default_transaction_read_only=on`. Em outro terminal PowerShell, executar:

```powershell
$env:FUTSCOUT_SSR_TEST_ORIGIN = 'http://127.0.0.1:3100'
npx tsx --test tests/production/i18n404.test.ts
Remove-Item Env:FUTSCOUT_SSR_TEST_ORIGIN
```

Esse teste faz oito GETs locais e as páginas de entidades executam seus SELECTs
usuais. Ele consome as respostas inteiras, exclui scripts/Flight da verificação
de texto e exige HTTP 404, título traduzido e html lang no markup. Sem a variável,
os oito casos ficam explicitamente skipped em `npm test`; isso NÃO aprova o gate
SSR. Estado diagnosticado: oito falhas reais nesse gate, mantidas visíveis como
KNOWN FRAMEWORK LIMITATION — ACCEPTED FOR BETA, não como regressão nova do FutScout.
A aceitação não enfraquece as assertions nem autoriza falhas nos testes funcionais.
O aviso `The destination stream closed early` não reapareceu nos GETs completos
nem nas duas interrupções HTTP controladas. Sua causa permanece não confirmada;
não é necessário para reproduzir o defeito de HTML e não foi suprimido.

### Banco e segurança

PostgreSQL deve estar acessível pelo hosting. Preferir credencial SELECT para o
catálogo público, separada das credenciais operacionais. Não aplicar migrations
automaticamente: publicar com o schema existente já validado.
Configurar SSL/CA conforme provedor; não desabilitar verificação TLS.

Adapter-pg usa pool nativo pg: default máximo 10 conexões por instância, idle 10 s.
Prisma é reutilizado por módulo no runtime e por global no desenvolvimento.
Não abrir cliente por request nem chamar disconnect após cada página. Serverless
multiplica pools: escolher região próxima ao banco, limitar concorrência e usar
endpoint pooled em DATABASE_URL. Operações CLI usam DIRECT_URL direta, sem fallback
entre as variáveis. A URL legada prisma+postgres não é compatível com adapter-pg;
DATABASE_URL deve conter a conexão PostgreSQL TCP pooled fornecida pelo provedor.

Serviços públicos possuem server-only; não importam Prisma em Client Components.
Boundaries mostram mensagem genérica/retry, sem erro bruto, stack ou credenciais.
Logs operacionais não são executados pelas páginas públicas; logs do servidor são privados.

### Aceite temporário — audit do tooling Prisma

Triagem de 09/09/2026: `npm audit --omit=dev` reporta quatro findings altos na
cadeia Prisma 7.9.1 (`prisma`, `@prisma/config`, `deepmerge-ts@7.1.5` e
`mysql2@3.15.3`). Não foram identificados nos traces/chunks do runtime HTTP
público atual. A CLI já está em devDependencies, mas satisfaz um peer opcional
do cliente; deepmerge é usado no carregamento de configuração local da CLI.
MySQL2 atende ao Studio/MySQL; o FutScout usa PostgreSQL via adapter-pg.
Aceitos temporariamente para a beta, mantendo configuração local confiável e
CLI/Studio sem exposição pública. Isso não corrige os pacotes nem garante
segurança geral. Reavaliar quando o Prisma atualizar os pins ou mudar o grafo
de imports/deployment. Não usar `npm audit fix --force`, downgrade major ou
override não comprovado. Audit permanece informativo, não um novo gate da CI.

### Hosting e autorização

Recomendação: Vercel, preset Next.js, Node 24, instalação npm ci, build npm run build,
variáveis server-side e PostgreSQL acessível. Sem cron/sync/API keys.
Alternativa: servidor/container Node, por exemplo Render, com build + next start.
Hospedagem estática não atende. Standalone/container pode ser avaliado separadamente;
o artefato atual usa o servidor Next padrão.

Antes de autorizar deploy: confirmar domínio, região, TLS, limites de conexão,
credencial pública, schema existente e smoke 200/404 no destino. Preview deve usar
ambiente de leitura isolado e proteção contra indexação do hosting.
Não mover banco, conectar GitHub ou publicar sem autorização.

Referências: [Next.js](https://nextjs.org/docs/app/getting-started/deploying),
[Node na Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
[conexões Prisma](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections).

## CI

Workflow sem secrets/banco: instalação, testes, TypeScript, lint e build com URLs
fictícias em loopback para DATABASE_URL e DIRECT_URL. Não realiza smoke com dados
reais nem deploy. Uma dependência
futura de PostgreSQL no prerender deverá quebrar o gate. Instalação ainda usa o
registry npm; não há download de fontes no build.

## Data operations

Syncs EA/API-Football **não são necessários para rodar o catálogo público** já
importado. Scripts operacionais exigem leitura/autorização individual: podem escrever,
consumir quota ou resetar progresso. Não executar em install/build/start/CI.

Scripts que importam `lib/prisma.ts` também consomem DATABASE_URL; isso não lhes
concede permissões de escrita. Revisar credencial, duração e compatibilidade com
pooling antes de autorizar operações. O seed mantém seu cliente próprio em
DIRECT_URL. Nenhum script operacional é migrado ou executado automaticamente.

## Assets e licenças

Fotos, bandeiras e fallbacks aprovados permanecem. Não há novos escudos/logos.
public/flags/README.md e LICENSE.flag-icons preservam origem/MIT das bandeiras.
app/icon.svg é um desenho geométrico F original nas cores FutScout, sem fonte
externa nem marca de terceiros. Fontes são stacks do sistema, sem downloads.
