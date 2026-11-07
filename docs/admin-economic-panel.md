# Painel econômico privado

Implementação local: `/admin`. O login exige a conta do proprietário, senha forte e TOTP; todas as operações consultam a sessão no servidor. A edição exige `FUTSCOUT_ADMIN_DATABASE_URL` separada de `DATABASE_URL` e `DIRECT_URL`; não há fallback. A sessão de banco do painel usa TLS em Production.

## Bloqueador do provedor

O Production atual usa Prisma Postgres. Segundo a [FAQ oficial](https://www.prisma.io/docs/postgres/faq#can-i-create-my-own-database-roles), ele não permite `CREATE ROLE`. A [documentação de conexões](https://www.prisma.io/docs/postgres/database/connecting-to-your-database#access-and-permissions) afirma que todas as credenciais do mesmo banco têm acesso integral; senhas distintas não oferecem privilégios SQL distintos. Portanto, `prisma/admin-economic-role.candidate.sql` é válido apenas no ensaio PostgreSQL descartável ou em outro provedor que suporte roles. **Não executá-lo no Prisma Postgres Production.** Tampouco é possível conceder SELECT somente à view para a credencial pública atual nesse provedor.

O proprietário escolheu manter Prisma Postgres e aceitou o isolamento na aplicação com credencial exclusiva para o painel, ciente de que ela terá acesso integral ao banco. A identidade do banco do runtime e da conexão administrativa foi comprovada por `VERIFIED/VERIFIED`.

## Estado desta preparação

- O checkout de origem `beta-next` contém alterações locais de Value e Wage. Este worktree isolado contém somente o painel, as leituras públicas manuais e os contratos puros de apresentação salarial (`lib/wagePublication.ts` e `lib/wageClassification.ts`); não contém o leitor, a publicação ou as migrations Wage.
- No checkout de origem, as migrations locais de novembro são `20261102000000_wage_strategy_a_release`, `20261104000000_wage_reference_classification` e `20261106000000_manual_economic_admin`. Este worktree contém apenas a última, além das 24 anteriores. O pós-check de Production confirmou **27 migrations concluídas, zero falhas e checksum correto**: as 24 anteriores, as duas Wage e a migration administrativa. Nenhuma migration deve ser reaplicada durante a publicação do painel.
- A migration administrativa foi instalada isoladamente, sem executar as migrations Wage novamente. O pós-check preservou 16.228 Players, 17.231 States, 17.231 Observations, 16.213 Currents e 11/22/1 registros Wage Release/Event/Head.

Pacote isolado: `app/admin/`, `lib/adminAuth.ts`, `lib/adminEconomic.ts`, os dois contratos puros de apresentação, `services/adminAuth.server.ts`, `services/adminEconomic.server.ts`, `prisma/migrations/20261106000000_manual_economic_admin/`, a parte correspondente de `prisma/schema.prisma`, as leituras públicas de perfil, cards, busca e seleção e os testes correspondentes. O SQL `prisma/admin-economic-role.candidate.sql` existe apenas para o ensaio descartável; nunca executar em Prisma Postgres Production.

## Publicação futura em Production

O schema administrativo já está instalado. A publicação do código exige autorização específica e não deve executar migrations:

1. Confirmar que `FUTSCOUT_ADMIN_DATABASE_URL`, `FUTSCOUT_ADMIN_OWNER_LOGIN`, `FUTSCOUT_ADMIN_PASSWORD_HASH` e `FUTSCOUT_ADMIN_TOTP_SECRET` existem como Secrets apenas em Production. Reutilizar a conexão administrativa dedicada já verificada. Não aplicar `prisma/admin-economic-role.candidate.sql` no Prisma Postgres. O hash da senha usa `scrypt` no formato `saltHex:hashHex`; o segredo TOTP é base32 de 20 bytes. Cadastrar o TOTP no autenticador do proprietário em canal privado. Exigir HTTPS, `sslmode=require` e sessão de 30 minutos.
2. Revisar o commit isolado e exigir testes, TypeScript, lint, build e CI verdes no SHA exato. Não publicar o checkout de origem com alterações Value/Wage. Configurar o deployment para **não executar** `prisma migrate deploy`, `prisma db push` ou qualquer rotina de migration; o histórico tem 27 migrations concluídas.
3. Após autorização de deploy, publicar somente o código revisado. Verificar login do proprietário, MFA e rejeição de visitantes; ensaiar uma edição autorizada e confirmar leitura pública de salário, vencimento e cláusula em PT/EN, cards e busca. Confirmar prioridade manual frente ao writer automático. Cada edição posterior deve aparecer na próxima leitura pública sem outro deploy.

Para criar as três variáveis de autenticação ausentes, executar `node scripts/setupAdminOwnerLocal.mjs` **em um terminal local privado fora do Codex**. O script solicita o login e uma senha forte sem eco, gera salt e segredo TOTP com `node:crypto`, imprime os três valores apenas nesse terminal e valida um código do aplicativo autenticador. Cadastrar cada valor em Vercel → projeto FutScout → Settings → Environment Variables, tipo **Secret**, ambiente **Production** exclusivamente. Não copiar a saída para chats, arquivos ou histórico de shell; fechar o terminal após o cadastro. O script não grava arquivos, não altera a conexão administrativa e não executa deploy. As variáveis novas só chegam a um novo deployment após a publicação autorizada.

Cada gravação exige `Player.id` e ID EA, revisão esperada e requestId, usa transação serializável e preserva uma revisão imutável. O painel só retorna sucesso depois do commit, leitura pública da revisão e invalidação de cache. Se a confirmação falhar, consultar a revisão atual antes de repetir a operação. Para desfazer um campo, usar **Restaurar esta revisão** no painel; isso cria uma nova revisão, sem apagar o histórico.

As Functions administrativas têm `maxDuration=45s`. O pool administrativo limita conexão e consulta a 10s; cada transação aplica `statement_timeout=8s`, `lock_timeout=3s` e `transaction_timeout=20s` com `SET LOCAL`, compatível com PostgreSQL 17 e pool transacional. Uma confirmação incerta não gera sucesso: o mesmo formulário conserva o `requestId` para uma nova tentativa da mesma operação; alterações no jogador, payload ou revisão criam outro identificador. Não repetir automaticamente. O limite de 45s fica abaixo do máximo de 60s do plano Hobby sem Fluid Compute; confirmar no artefato publicado que a configuração foi aplicada.

## Rollback operacional

Se o deploy falhar, interromper o acesso ao painel e voltar o deployment anterior; não apagar as novas tabelas nem desabilitar seus guards. Preservar o Secret administrativo permanente, salvo falha de segurança ou revogação expressamente necessária. Invalidar sessões `AdminSession` em procedimento autorizado; em incidente de credencial, revogar a conexão dedicada na Console após drenar as instâncias. A exclusão da credencial pode não encerrar sessões PostgreSQL já abertas. O código público anterior continua lendo seus valores existentes. Revisar as revisões do painel e corrigir individualmente após a recuperação. A restauração integral de banco requer procedimento separado e autorização específica.

O painel não publica sozinho uma migration: sem role, variáveis e deploy autorizados ele permanece inativo. A edição manual não reescreve `WagePublicationRelease`; sua precedência ocorre nas leituras públicas pela revisão em `AdminEconomicHead`, preservando os 16.228 salários e a fonte histórica.
