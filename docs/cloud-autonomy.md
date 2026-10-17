# FutScout: fila cloud até 30/11/2026

Fonte de verdade: `origin/beta-next`. Uma tarefa por branch `work/<area>-<objetivo>` e por workspace cloud isolado. Entregar PR curto para `beta-next`; não fazer merge automático. O PR exige `Quality gates` verde, revisão humana e riscos explícitos. Não configurar credenciais de Production nem chaves de APIs pagas no ambiente de desenvolvimento ou no GitHub Actions. Nenhum workflow de agente em cron ou loop ilimitado.

## Fila, em ordem

| Prioridade | Entrega verificável | Dependência / paralelismo |
| --- | --- | --- |
| P0 | Estabelecer ambiente Codex Cloud conectado a `Luisgabrielcm/futscout`, instalar com `npm ci`, validar o CI remoto e abrir um PR-piloto sem dados produtivos. | Depende da conexão GitHub e publicação do ambiente; primeiro trabalho cloud. |
| P0 | Value: versionar somente código/SQL candidatos revisados, sem journal, recibos ou seleção privada; implementar importação staging com retomada, read-back e token restrito. | Caminho crítico; evidência offline existe apenas no host local. Requer revisão separada antes de instalar no banco. |
| P0 | Value: resolver role restrita Prisma Postgres, backup fresco, barreira de writers e instalação controlada. | Depende de confirmação do provedor e autorização produtiva; não executar em tarefa cloud de desenvolvimento. |
| P1 | Potential: validar contrato de writer, identidade, histórico e testes nativos antes da integração pública. | Paralelo ao Value; sem migration Production automática. |
| P1 | Wage: obter referências individuais com direitos e semântica documentados; avaliar o motor contextual sem OVR. | Paralelo ao Potential; bloquear treinamento/publicação até elegibilidade. |
| P1 | Contract/Clause: consolidar evidências e permissões, preservar ausência e temporalidade, testar persistência. | Paralelo ao Wage; não usar dados inventados. |
| P2 | UX: finalizar estados vazios, responsividade e acessibilidade das telas públicas. | Paralelo aos dados; não publicar valores não confirmados. |
| P2 | SEO e infraestrutura: regressões PT/EN, canonical, sitemap, 404 SSR conhecido, observabilidade e proteção da branch. | Paralelo à UX; respeitar limitação SSR aceita para beta. |

## Marcos

- Até 23/10: ambiente cloud e primeiro PR-piloto; CI obrigatório em `beta-next`.
- Até 13/11: PRs de Value staging, Potential, Wage e Contract/Clause prontos para revisão; bloqueios de direitos/provedor resolvidos ou explicitamente isolados.
- Até 23/11: UX/SEO e regressões integradas; ensaio de release sem escrita produtiva.
- Até 30/11: decisão de release com gates verdes e aprovação humana de qualquer migration, importação, dados econômicos ou deploy Production.

Datas são metas, não autorização automática. Se uma dependência externa falhar, concluir as áreas independentes sem afrouxar os gates.

## Configuração cloud mínima

Após `npm ci`, executar `npm run validate:cloud` para os mesmos gates do CI:
typegen → testes offline → testes Value sintéticos/mockados → TypeScript → lint → build. O comando fixa URLs
PostgreSQL fictícias em `127.0.0.1:1/build` e `SITE_URL=https://example.invalid`
somente nos subprocessos, desativa o gate HTTP opt-in e interrompe na primeira
falha. Não provisiona banco, executa migrations ou inicia sincronizações.

Criar ambiente privado Codex Cloud para o repositório, selecionar `beta-next`, Node 24, `npm ci`, `npx next typegen`, `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build`. Usar apenas acesso de rede a gerenciadores de pacotes. Para build, usar os placeholders não secretos do CI (`DATABASE_URL` e `DIRECT_URL` em `127.0.0.1:1/build`, `SITE_URL=https://example.invalid`); não adicionar credenciais reais de banco, Live Football, Vercel ou Prisma Production. O CI não executa migrations. Tarefas cloud devem receber apenas escopo de branch de trabalho, testes e PR; sem push direto em `beta-next`.

Antes de ativar, proteger `beta-next`: exigir PR, `Quality gates` e ao menos uma aprovação humana; desabilitar auto-merge/bypass. Confirmar que a integração Vercel não usa credenciais de Production em previews de branches de trabalho. Confirmar configurações de billing e limite de gastos. GitHub Actions faz validação, não desenvolvimento autônomo. O Codex Cloud executa tarefas isoladas e pode ser retomado; não há garantia de concluir o backlog sozinho ou no prazo sem novas tarefas/revisões.

## Primeiro prompt cloud

"No repositório `Luisgabrielcm/futscout`, a partir de `beta-next`, valide o checkout cloud em uma branch `work/cloud-bootstrap`. Rode `npm ci`, `npm test`, `npx next typegen`, `npx tsc --noEmit`, `npm run lint` e `npm run build`. Corrija apenas problemas reproduzíveis do ambiente/CI; não acesse banco, APIs pagas, Vercel ou dados econômicos. Abra PR para `beta-next` com relatório curto. Se tudo passar sem mudança necessária, relate o resultado sem criar commit vazio."

Arquivos experimentais e recibos não versionados do host local não estarão disponíveis na nuvem. Não copiá-los por conveniência; preparar publicação seletiva e revisada em tarefa separada.
