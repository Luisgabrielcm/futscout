# Leitores: piloto privado de quatro identidades

Preparação em branch `codex/club-contexts-readers-preview`, baseada em beta-next
`c0822041a7b8c96dbd14db13230cc5b24a75914c`. Nenhuma ativação de Production.

O leitor exige simultaneamente ambiente permitido, flag geral, lista exata dos
IDs EA 218191, 83924, 261176 e 225964, hash do manifesto aprovado e seleção
privada versão 1 com revisionId, decisionReference e hash de payload aprovados.
IDs adicionais, duplicados ou ausentes impedem toda a leitura. Não há associação
por nome. Production exige ainda uma flag independente, desligada por padrão.

## Preview local isolado

URL: http://127.0.0.1:3144. Perfis `/pt/jogadores/fixture-<ID EA>` e sufixo
`/vida-real`. Banco descartável local, usuário exclusivamente SELECT, sem
credenciais de Production ou APIs externas. Identidades e evidências vêm do
piloto congelado; atributos e economia são **fixtures sintéticas**, não valores
reais dos jogadores. Não reutilizar a conexão Preview hospedada que aponta para
Production.

Configuração apenas do processo local:

```dotenv
VERCEL_ENV=preview
CLUB_CONTEXTS_READ_ENABLED=1
CLUB_CONTEXTS_READ_EA_IDS=218191,83924,261176,225964
CLUB_CONTEXTS_READ_PILOT_HASH=dd33d9a81f4c97a62de1bd7eaf739579966d0d7e3d67602f3970f0dd855b869e
CLUB_CONTEXTS_READ_PRODUCTION_ENABLED=0
```

NG - FA permanece rótulo exclusivo do snapshot. A UI informa que ele não
comprova ausência de contrato real. Palmeiras (Gómez, Mauricio, López) e Flamengo
(Carrascal) aparecem separadamente, conforme evidência revisada em 12/11/2026.
A data efetiva do elenco não está comprovada; o snapshot continua em revisão e
não foi escolhido como referência canônica Career Mode.

## Verificação e reversão

`prepareClubContextReaderPreview.mts` cria apenas um banco local novo com
fixtures. `validateClubContextReaderPreview.mts` compara leitores desligados e
ligados, as duas páginas de cada jogador em desktop/mobile e um homônimo fora
do piloto, bloqueia tráfego externo e compara fingerprints de todas as tabelas.
Recibo e screenshots ficam em `audit/output/club-contexts-readers-preview/`,
ignorados pelo Git. O teste não modifica os dados enquanto os leitores rodam.

Rollback do leitor: desligar `CLUB_CONTEXTS_READ_ENABLED` e reiniciar somente o
processo Preview. Nenhuma correção de vínculo, migration ou rollback de dados é
necessário. Seleções/evidências privadas e vínculos legados permanecem intactos.

Antes de qualquer futura ativação em Production: autorização específica,
revalidação read-only das quatro seleções e flags, revisão/integração do código
e decisão operacional sobre sua publicação. Este trabalho não faz deploy,
importação, migration ou escrita em Production. Os grupos 184/240/27/577/3040
permanecem fora de qualquer ativação automática.

## Bloqueio temporário de deployments automáticos

Autorizado em 12/11/2026 para integrar o PR #27 sem deployment:
`vercel.json` mantém a regra da branch do PR e acrescenta exclusivamente
`git.deploymentEnabled["beta-next"] = false`. Não há wildcard nem regra para
`master` (Production); outras branches conservam o comportamento anterior.
Isso não ativa leitores nem impede deployments manuais, que continuam proibidos
nesta operação. O bloqueio de beta-next permanece até autorização específica
posterior do usuário, mesmo depois do merge.

Para restaurar a configuração anterior, somente após essa autorização: abrir
um PR separado para beta-next removendo apenas a entrada `"beta-next": false`,
preservar a regra da branch do piloto e todas as demais configurações, validar
o CI e integrar. A remoção volta ao comportamento padrão de deploy automático;
o próprio merge desse PR poderá iniciar um Preview. Não alterar flags de
leitores ou executar migrations/importações como parte dessa restauração.
