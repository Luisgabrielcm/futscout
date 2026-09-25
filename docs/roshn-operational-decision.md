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

## Resultado efetivo — 25/09/2026

- Código publicado: `2786e75cd9d6c8e3db08261ae324161131eb8083`, 14 arquivos de suporte, testes e documentação. Preview `dpl_ts9p9RK4pEJP3wCFtxso13nbBtB4`, build Ready, 40 logos API-Football carregadas (21 + 19); flags oficiais de Preview permanecem desligadas. Banco compartilhado, sem considerar Preview isolado.
- Production inicial, mesmo SHA com ROSHN desligada: `dpl_4M4iv41Mw5guYsBwNuYge5MtNv99`. Este é o rollback compatível imediato da liberação; Brack/ISL permanecem ligadas. Desligar a flag e redeployar o mesmo código é outra forma de suspender entrega, sem alterar histórico.
- Preflight novo: `audit/output/roshn-preflight-20260925.json`, comparado integralmente ao checkpoint pós-ISL de 24/09; estados/hashes iguais, 20 migrations concluídas, nenhuma identidade da candidata, Club/League/Player preservados.
- Registro: `audit/output/roshn-registration-20260925.json`, **COMMITTED_INDEPENDENT_READ_CONFIRMED**. Writer `CREATED / COMMIT_CONFIRMED`, retries=0. Identidade `cmuh41vr80000zgucwxo35bgz` VERIFIED v1; asset `cmuh41vvh0001zgucwv6660b6` ACTIVE v1. HTTP 200, image/png, 32409 bytes, hash exato da tabela. `REVIEW_REQUIRED`, `storageUrl=null`, revogação individual e referência desta decisão confirmados. Marcador, candidato, validação de imagem e recibo do writer preservados ao lado do recibo final.
- Após confirmação, `ROSHN_BRAND_ASSET_DELIVERY_ENABLED=true` somente em Production. Deployment final `dpl_2NB4kDuWKZwAAFDY5KUZ1YKTpMQR`, URL imutável `https://futscout-dwse7h64t-fut-scout.vercel.app`, mesmo SHA 2786e75, Ready. Nenhuma variável de conexão, `.env` ou migration alterada.
- Página pública `/pt/ligas/roshn-saudi-league`: 16 imagens via `/api/brand-assets/roshn`, todas carregadas 512×512 naturais, inspeção visual de cabeçalho e cards aprovada. **Cobertura pública confirmada: 43/45.** A-League e Cyprus continuam em REVIEW, sem cadastro.
- Leitura final `audit/output/official-final-registry-20260925.json`, 2026-09-25T15:25:07.072Z: comparação integral de Club e Registry com baseline + três recibos oficiais, 618 identidades e 618 assets, 43 ligas e 574 clubes elegíveis, mesmos oito clubes sem escudo. Os dez casos suspeitos e o histórico Red Star permanecem inalterados; elegibilidade não equivale a prova de identidade correta.
- Validação: 1579 testes aprovados, zero falhas, oito HTTP ignorados pela suíte offline e depois **8/8 executados e aprovados** separadamente no build local/staging. TypeScript, lint, build e diff check aprovados. Um timeout de módulo VM na execução concorrente inicial foi resolvido executando a suíte com `--test-concurrency=2`, sem mudar timeout/assertivas; o teste isolado também passou. Logs `audit/output/roshn-*.log`.

Oito clubes sem escudo e dez associações suspeitas estão documentados em `docs/remaining-brand-audit-20260925.md`. Nenhum ID de clube foi alterado. A cobertura não é 45/45 e os escudos não estão todos concluídos.

Verificação HTTP final: `audit/output/official-public-final-http-20260925.json`, oito páginas 404 PT/EN com status e HTML inicial localizados corretos, sem shell de recuperação; três rotas oficiais HTTP 200, MIME/bytes/SHA exatos, no-store e nosniff. A inspeção de contagem pública confirmou 23 logos na primeira página e 20 na segunda, com fallback apenas para A-League e Cyprus.
