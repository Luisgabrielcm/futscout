# Preview Club Contexts: isolamento SQL READ ONLY

Correção preparada a partir de `40f386585acd4a335a36105368929bc54e3e4dbe`.
O novo código precisa de revisão/integração e autorização operacional antes
de um deployment. Nenhum deploy, migration ou escrita em Production foi feito.

## Política de ativação

O cliente compartilhado `lib/prisma.ts` ativa o adapter protegido quando
`VERCEL_ENV=preview` e os leitores do piloto estão ligados. A configuração
`CLUB_CONTEXTS_PREVIEW_READ_ONLY=1` também protege o Preview com leitores off,
permitindo uma comparação de apresentação sem abrir um cliente com escrita.
Pedir essa opção fora de Preview falha na inicialização. A apresentação continua
restrita aos quatro IDs e hashes do PR #27; jogadores fora da lista mantêm o
fluxo legado, também executado em SQL READ ONLY dentro desse Preview.

Variáveis exclusivas do futuro deployment:

```dotenv
CLUB_CONTEXTS_PREVIEW_READ_ONLY=1
CLUB_CONTEXTS_READ_ENABLED=1
CLUB_CONTEXTS_READ_EA_IDS=218191,83924,261176,225964
CLUB_CONTEXTS_READ_PILOT_HASH=dd33d9a81f4c97a62de1bd7eaf739579966d0d7e3d67602f3970f0dd855b869e
CLUB_CONTEXTS_READ_PRODUCTION_ENABLED=0
```

`DATABASE_URL` desse deployment deve apontar a pooled. A normalização local
remove exclusivamente a opção de startup diagnosticada
`options=-c default_transaction_read_only=on` e exige TLS verify-full. Qualquer
outra opção de startup é rejeitada. Não modifica process.env nem variáveis
compartilhadas; não lê DIRECT_URL, não troca direct por pooled silenciosamente
e rejeita host diferente de pooled.db.prisma.io. Build continua sem destino real
e com as flags de leitura/proteção off; runtime com as flags acima.

## Garantia de transação

`readOnlyPgAdapter` envolve o adapter oficial PrismaPg 7.9.1, sem refazer
conversão de valores/argumentos/erros. Cada query normal adquire uma conexão
reservada via startTransaction, executa SET TRANSACTION READ ONLY antes da query
e finaliza SQL/cleanup uma única vez. Transações Prisma interativas e em lote
recebem a mesma proteção. Não depende de SET de sessão entre transações.

SQL mutante é rejeitado na camada, inclusive CREATE TEMP e SELECT INTO. O
PostgreSQL rejeita DML/DDL persistente em READ ONLY como segunda defesa. Scripts, múltiplas instruções e comandos
de sessão/transação enviados pelo aplicativo são bloqueados adicionalmente;
set_config não pode desligar a proteção. A política SQL é conservadora e pode
rejeitar futuros raw SQL legítimos que usem esses termos: ampliar somente após
revisão e testes de escape. O adapter não expõe o pool original nem shadow DB.
Handles fechados não podem ser reutilizados. Savepoints aninhados não são
expostos; o piloto não depende deles.

Perfis EA, Vida real, economia, potenciais, brand assets e demais consultas
auxiliares usam o cliente comum. Os caminhos independentes adminPool,
diagnóstico administrativo e runner de importação rejeitam execução no modo
protegido antes de abrir conexão, inclusive se credenciais administrativas
tiverem sido herdadas. Não há mudança no comportamento desses caminhos no
runtime normal de Production.

## Validação focada

- Unitários: escopo, política, ciclo de conexão, concorrência, rollback,
  transações fechadas, bloqueio de controle SQL e de pools alternativos.
- `scripts/validateClubContextReadOnly.mts`: clone PostgreSQL local descartável,
  INSERT/UPDATE/DELETE via raw e transação Prisma, tentativa de update de jogador,
  controles de escape, oito leituras concorrentes e hashes de todas as tabelas
  iguais antes/depois. PostgreSQL independente confirma SQLSTATE 25006 para
  cada uma das três operações. Nenhum negativo roda em Production.
- Modo `--pooled`: somente SELECT na identidade Production esperada, quatro
  serviços de perfil EA e quatro Vida real com auxiliares, controle fora da
  allowlist, comparação de hashes pontuais de Player/economia/potencial. Não
  executa tentativas de escrita, testes de interface ou auditorias globais.
- TypeScript e lint dos arquivos afetados.

Recibos locais ignorados pelo Git: `audit/output/club-contexts-readonly-runtime/`.
O runner Node pode resolver o marcador server-only com NODE_PATH apontando ao
`next/dist/compiled` instalado e `--conditions react-server`; isso não altera
o código de aplicação ou o pacote Next.

`vercel.json`, `beta-next:false`, vínculos e dados existentes permanecem intactos.
Não escolher referência Career Mode nem modificar as seleções privadas. O plano
de Preview protegido e sua remoção por URL exata continuam aplicáveis; alterar
env não desliga um deployment Vercel existente. Nenhum deployment foi criado.
