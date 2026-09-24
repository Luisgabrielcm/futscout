# Red Star FC — autorização operacional do escudo 104

Decisão do proprietário de 23/09/2026 (America/Cuiaba), explicitamente concedida nesta tarefa para cadastro pelo writer transacional em Production `rknsog8tmbl5u4xqbogxfux5`.

Referência auditável: `owner-decision:red-star-104-remote-crest-2026-09-23`.

| Campo | Identidade e imagem autorizadas |
| --- | --- |
| Clube | Red Star FC, França, Ligue 2 BKT |
| Club.id | `cmt9g1wkq037v1sucum6ntyxn` |
| EA / Club.externalId | `111273` |
| Provider / providerEntityId | `api-football` / `104` |
| Entity / asset type | `CLUB` / `CREST` |
| URL | `https://media.api-sports.io/football/teams/104.png` |
| SHA-256 | `b73f17d20d59d3bf0bb060afdd572b82f3e297a1910038657750ddfc4159f2f7` |
| Operational decision | `OWNER_AUTHORIZED_REMOTE_USE` |
| Display policy | `DISPLAY_ALLOWED` |
| Rights status | `REVIEW_REQUIRED` |
| Storage URL | `null` |
| Revogação individual | `revocable=true`; interromper a exibição por `REVOKED` / `DISPLAY_BLOCKED`, preservando o registro e histórico |

O proprietário autoriza a exibição remota desta identidade e destes bytes sob risco operacional. Essa decisão **não representa licença de uso da marca**, não comprova direitos e não autoriza uma cópia hospedada. Os timestamps efetivos e esta referência devem constar no asset e no recibo. Não se autoriza reativar ou reutilizar `4396`.

## Controles de execução

Exigir a migration `20260923170000_brand_identity_blocked_history` concluída e o índice parcial vigente; Club.apiFootballId=104; ausência de identidade externa 104 e de identidade local não bloqueada; EA 111273, mesma Ligue 2 e mesmos 25 jogadores. Preservar integralmente a identidade `cmuczcaug0000dcuc8nlf6dn5` BLOCKED/v2 e seu escudo `cmuczcaz60001dcucwvus8unq`, operacionalmente REVOKED / DISPLAY_BLOCKED/v2 (lifecycle ACTIVE).

Revalidar a imagem uma vez, sem retry. Se o SHA-256 mudar, parar para revisão visual. Usar o writer existente em uma transação Serializable com estado esperado vazio para a nova identidade e asset. Reconfirmar os dados protegidos e o histórico dentro da transação, confirmar independentemente após commit e parar diante de conflito ou resultado indeterminado. Não executar reversão automática.

Escopo da allowlist: adicionar somente CLUB / `cmt9g1wkq037v1sucum6ntyxn` / api-football / 104 / CREST. As nove ligas em REVIEW ficam fora desta operação. Nenhum push ou deploy é autorizado.
