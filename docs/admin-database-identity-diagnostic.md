# Diagnóstico privado da identidade do banco

Este diagnóstico temporário fica no `instrumentation.ts`, sem rota HTTP. Permanece desligado por padrão. Só roda no runtime Node.js de Production quando `FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC=1`, `DATABASE_URL` e `FUTSCOUT_ADMIN_DATABASE_URL` estiverem presentes. A conexão administrativa deve ser dedicada e já é verificada por `adminPool()`; `DIRECT_URL` não é fallback. Enquanto a flag estiver ativa, o login e as sessões do painel permanecem bloqueados.

## Prova

O runtime abre uma transação `REPEATABLE READ READ ONLY` pela sua `DATABASE_URL` e exporta um snapshot. A transação exportadora permanece aberta enquanto a conexão administrativa, autenticada pelo PostgreSQL, abre outra transação somente leitura e importa o snapshot. O PostgreSQL rejeita a importação se as conexões não chegarem ao mesmo banco da mesma instância. O identificador transitório do snapshot passa diretamente entre as duas conexões no mesmo processo Node.js e permanece somente na memória desse processo. Depois da importação, o diagnóstico confere banco e schema. Ambas as transações terminam com `ROLLBACK`, inclusive se ocorrer erro. O diagnóstico não consulta `_prisma_migrations`.

O log privado contém somente `VERIFIED` ou `INCONCLUSIVE`. Não contém URLs, usuários, senhas, tokens, snapshot, nome do banco, schema nem mensagens brutas do driver. Quando a flag está ativa, mas uma condição de ambiente falha ou o módulo não inicia, também há uma linha `INCONCLUSIVE`; não há saída silenciosa. A importação falha de forma fechada se o pooler não aceitar snapshots exportados. Não há transporte pelo navegador, endpoint ou arquivo persistente.

## Observabilidade antes da próxima tentativa

A tentativa anterior não comprovou que o código da função executou: HTTP 401 pode vir da proteção da Vercel ou da rota do FutScout. Os logs históricos da CLI retornaram zero registros até após uma página pública com cache `MISS`, de modo que a causa da ausência de registros ainda não foi isolada. Logs de **build** mostram a compilação e não substituem logs de **runtime**. A CLI 65.12.1 avisa que `vercel logs --follow` não transmite mais logs ao vivo; para acompanhar ao vivo, usar o modo **Live** da página privada **Project → Logs** da Vercel. Os filtros devem selecionar o deployment temporário correto, a janela UTC da requisição, Production, o recurso Vercel Functions e a região efetiva, sem filtro de branch herdado. Consultas pela CLI podem usar `vercel logs --deployment <ID> --no-branch --json` para resultados históricos limitados.

Antes de qualquer novo deployment, confirmar nesse canal privado que uma requisição dinâmica conhecida ao deployment Production normal produz uma linha de runtime associada ao deployment e ao horário corretos. Se continuar zero, **NO-GO**: não publicar apenas para tentar diagnosticar a própria observabilidade. Na execução autorizada, chamar o deployment protegido pela CLI autenticada, comprovar que a resposta veio da aplicação (tipo de conteúdo e corpo/status esperados, sem registrar cookies), localizar uma única linha `FUTSCOUT_ADMIN_DATABASE_IDENTITY` e classificar somente `VERIFIED` ou `INCONCLUSIVE`. O parser local e o teste focado validam o formato e a recuperação do resultado; não substituem a prova de entrega nos logs da Vercel.

## Ativação futura, sujeita a autorização separada

1. Confirmar que somente administradores com MFA conseguem alterar variáveis de Production, publicar o deployment e ler logs privados. Sem essa confirmação, não ativar.
2. Confirmar no Prisma Console que a conexão administrativa existente pertence ao database ID `rknsog8tmbl5u4xqbogxfux5`, branch `main`; isso ainda não prova o destino do runtime. Disponibilizá-la em `FUTSCOUT_ADMIN_DATABASE_URL` somente em Production, por canal privado. Não usar `DIRECT_URL` nem copiar a credencial para o repositório.
3. Publicar somente o SHA isolado e revisado. Habilitar temporariamente `FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC=1` somente em Production. Alterações em variáveis só entram em novos deployments; não presumir que o deployment anterior recebeu a flag. A flag impede o login do painel; não configurar credenciais de proprietário nem aplicar a migration do painel nesta operação.
4. Ler `VERIFIED` ou `INCONCLUSIVE` apenas nos logs privados, com o filtro de deployment/tempo/região conferido. `VERIFIED` autoriza um **preflight posterior e separado** para consultar `_prisma_migrations` em READ ONLY e reconciliar as 25 migrations do artefato isolado (24 base + `20261106000000_manual_economic_admin`). As duas candidatas Wage locais ficam fora da operação.
5. Remover a flag e a configuração administrativa temporária quando não forem necessárias; publicar artefato sem a instrumentação temporária, após autorização específica. Se a prova falhar, manter o painel desativado e não consultar migrations pelo diagnóstico. Não executar `prisma migrate deploy` nesta operação.

Recursos necessários: projeto Vercel `prj_bxwmEhksloSEAEbCqdEUJRAmeiQm`, deployment Production novo a partir do SHA aprovado, logs privados com acesso restrito e MFA, `DATABASE_URL` Production existente, conexão administrativa Prisma dedicada e a flag temporária. Nenhum novo endpoint, serviço pago, tabela ou migration é necessário.

Reversão: desativar/remover a flag, retirar a configuração administrativa temporária, voltar ao deployment anterior se necessário e remover `lib/adminDatabaseIdentityDiagnostic.server.ts`, o teste, o guard em `instrumentation.ts` e o bloqueio temporário em `services/adminAuth.server.ts` em um commit de limpeza. As transações da prova já terminam com `ROLLBACK`; não há registros de banco para restaurar.

Nenhuma operação de banco, configuração ou deployment é executada ao preparar este artefato.
