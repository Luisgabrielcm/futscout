# ROSHN — marca oficial atual 2026/27

Registro em 2026-09-25T15:01:34Z (11:01:34 America/Cuiaba). O horário é o deste registro, não um timestamp presumido da mensagem. Referência: `owner-message:2026-09-25:roshn-current-2026-27`; decisão individual `FUTSCOUT-OFFICIAL-ROSHN-20260925-v1`.

O proprietário autorizou todas as logos e escudos nesta tarefa e, consultado especificamente sobre a temporalidade, escolheu: **“Usar a marca oficial atual de 2026/27, documentando essa versão”**. Esta decisão permite exibição remota da tupla exata abaixo, sem representar licença de marca, sem afirmar que estes bytes eram usados em 2025/26 e sem aprovar IDs divergentes de clubes.

| Campo | Valor autorizado |
|---|---|
| League.id | `cmt99f99p005gvsuclbx5elkf` |
| Competição | ROSHN Saudi League, Arábia Saudita, primeira divisão masculina; API 307 é evidência de competição, não o provedor da imagem |
| Provider | `official-spl` |
| Provider entity ID | `v1785321708/prd/assets/icons/Roshn-Saudi-League_pchauk.png` |
| URL exata | `https://images.spl.com.sa/image/private/t_q_good/v1785321708/prd/assets/icons/Roshn-Saudi-League_pchauk.png` |
| SHA-256 | `30f9b6a053a80f9b45e9c77b99c62efc3d73dd1da3d3d9295d70b609788a8bc1` |
| Formato | PNG, 32409 bytes, 512×512 |
| Versão temporal escolhida | 2026/27, marca atual; não altera temporada dos jogadores ou participantes persistidos |
| Entrega / flag | `/api/brand-assets/roshn` / `ROSHN_BRAND_ASSET_DELIVERY_ENABLED`, desligada por padrão |
| Política | OWNER_AUTHORIZED_REMOTE_USE, DISPLAY_ALLOWED, REVIEW_REQUIRED, storageUrl=null, revocable=true |

Evidências: `audit/output/five-current-branding-20260924/307.json` e imagem arquivada, [site oficial](https://www.spl.com.sa/en), [notícia oficial de 15/09/2026 sobre a temporada 2026/27](https://www.spl.com.sa/en/news/top-eleven-brings-rsl-and-global-superstars-to-2026-27-season). A imagem específica já foi localizada no site oficial no checkpoint de branding. Revisão local dos bytes originais a 24/48/72 px: emblema quadrado reconhecível, contraste satisfatório no fundo escuro; nenhuma alteração de cor, corte ou redesenho. Participantes 14/15 no cache auditado; Al Hilal 8097 (Líbia) versus candidato saudita 2932 permanece em fila própria, sem correção automática.

Riscos aceitos: termos/licença não comprovados, indisponibilidade da origem, mudança de bytes/URL e necessidade de fallback. Entrega transitória em memória, sem armazenamento persistente de cópia, sem redirects, hash e dimensões exatos, tempo/bytes limitados, no-store. Limite por processo de 60 requisições/minuto e quatro simultâneas; não é limite global. BLOCKED/REVOKED em qualquer provedor dessa liga impedem seleção alternativa. A autorização não transforma candidatas em REVIEW em VERIFIED.

## Execução condicionada

O preflight de 24/09 é histórico (`audit/output/roshn-approved-preflight-20260924.json`): destino identificado Production `rknsog8tmbl5u4xqbogxfux5`, identidade ausente, 20 migrations concluídas, 617 identidades/assets após Brack e ISL; Club/League/Player preservados. Fazer **novo preflight** após publicação do SHA compatível; não reutilizar esse arquivo de ontem como estado atual.

Usar exclusivamente o arquivo restrito da conexão direct emitida no Console para esse ID, sem carregar `.env`. `$connectionFile` abaixo é o caminho privado já verificado, não a URL.

```powershell
npx tsx scripts/officialLeagueOperation.ts preflight roshn $connectionFile audit/output/roshn-preflight-20260925.json
Get-FileHash audit/output/roshn-preflight-20260925.json -Algorithm SHA256
# Após comparar estado/hash e criar aprovação individual pinando este preflight:
npx tsx scripts/officialLeagueOperation.ts register roshn $connectionFile audit/output/roshn-registration-20260925.json $approvalFile
# Leitura/reconciliação, sem repetir transação:
npx tsx scripts/officialLeagueOperation.ts confirm roshn $connectionFile audit/output/roshn-registration-20260925.json
```

Arquivo de aprovação individual: approved=true, databaseId exato, entityId/provider/providerEntityId/sourceUrl/contentHash da tabela, decisionRef desta decisão, approvedAt=2026-09-25T15:01:34.000Z (registro efetivo do aceite específico), approvedBy=proprietário FutScout, riskReason acima, preflightFile e preflightSha256 reais. Nunca imprimir o arquivo de conexão. O writer executa uma transação com expectativas de identidade/asset ausentes e leitura independente após commit. Preservar todos os marcadores e recibos; qualquer falha/indeterminação exige investigação de leitura antes de nova escrita.

Publicar primeiro o SHA validado, conferir Preview como banco compartilhado e promover o mesmo SHA com ROSHN desligada. Cadastrar individualmente, confirmar, habilitar somente sua flag e reimplantar o mesmo SHA. Contar **43/45 somente após inspeção pública**. Rollback do código/flag preserva o Registry; revogação individual mantém histórico e não apaga o asset. Não reutilizar deployment anterior incompatível com o provedor oficial.
