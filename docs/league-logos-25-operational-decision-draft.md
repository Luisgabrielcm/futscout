# Proposta de decisão operacional — lote de 25 ligas

**PENDENTE DE APROVAÇÃO — NÃO ATRIBUÍDA AO PROPRIETÁRIO.** Proposta preparada em 23/09/2026; não é autorização para executar. Aprovador: não informado. Data do aceite: não informada. Referência proposta: `proposed-decision:brand-assets-25-verified-leagues-2026-09-23`; registrar referência definitiva e evidência do aceite somente após aprovação explícita.

Escopo fechado: as 25 relações League.id/API-Football/URL/SHA-256 do [manifesto JSON](league-logos-25-manifest-2026-09-23.json), hash `b86f64b18714736d2911692c7d6f74e15e258bee598b0ef1acded0854ddeb401`. Mudança de ID, bytes ou URL exige nova revisão; não estender às nove REVIEW ou ao escudo do Red Star 104.

| Liga local | League.id | API-Football | País / tipo | Participantes locais confirmados |
|---|---|---:|---|---:|
| Ligue 2 BKT | `cmt9ekar7005c1suckjql1hd7` | 62 | France / League | 16/16 |
| EFL League Two | `cmtaeiyxf06iv9gucrl6c0tgf` | 42 | England / League | 22/22 |
| 1A Pro League | `cmt9bm48f01cyukuceuen03tr` | 144 | Belgium / League | 15/15 |
| 3F Superliga | `cmt9ctsxc03xvukucfasxm83t` | 119 | Denmark / League | 10/10 |
| Allsvenskan | `cmt9fu0ae02rd1sucnoizd50d` | 113 | Sweden / League | 13/13 |
| Česká Liga | `cmt9c5bdm02gkukucb8hsabf1` | 345 | Czech-Republic / League | 3/3 |
| CSL | `cmt9f016a011q1suczc7j6xy8` | 169 | China / League | 16/16 |
| Eliteserien | `cmt9coo6003nbukuc6lkgnwmb` | 103 | Norway / League | 13/13 |
| Finnliiga | `cmtacixca01ve9gucjr6aozya` | 244 | Finland / League | 1/1 |
| Hellas Liga | `cmt9blzhv01clukucvic0ft70` | 197 | Greece / League | 4/4 |
| K League 1 | `cmt9eyo4u00y41suczayaz18g` | 292 | South-Korea / League | 10/10 |
| Liga Azerbaijan | `cmtaask4c006bgguc2j5lxa3m` | 419 | Azerbaijan / League | 1/1 |
| Liga Chile | `cmt9gmvaa04g41suc5iyzcop4` | 265 | Chile / League | 1/1 |
| Liga Hrvatska | `cmt9bga6b00zkukucbiqk0hj7` | 210 | Croatia / League | 2/2 |
| Magyar Liga | `cmt9cgwsv0362ukuc54mlun2o` | 271 | Hungary / League | 1/1 |
| Ö. Bundesliga | `cmt9f4vwv01c91suc25b5ctd1` | 218 | Austria / League | 12/12 |
| PKO BP Ekstraklasa | `cmt9fwhb402wv1suchlrareu6` | 106 | Poland / League | 15/15 |
| Scottish Prem | `cmt9bqcur01lrukucj5mdg07t` | 179 | Scotland / League | 12/12 |
| SSE Airtricity PD | `cmtakrz8k05hlq0ucue6rdb9a` | 357 | Ireland / League | 10/10 |
| Trendyol Süper Lig | `cmt99979i00brt4uc8h2cv0d2` | 203 | Turkey / League | 15/15 |
| Ukrayina Liha | `cmt9c5mh102hfukucxmmcjf8z` | 333 | Ukraine / League | 2/2 |
| United Emirates League | `cmt9bx8dt01yvukuc00bxtnka` | 301 | United-Arab-Emirates / League | 1/1 |
| SUPERLIGA | `cmt9gcakd03tm1sucmbno6tuo` | 283 | Romania / League | 13/13 |
| Libertadores | `cmt9c3i3502dgukuc28vz7prp` | 13 | World / Cup | 18/18 |
| Sudamericana | `cmtdae90p04wlogucj7s3c2in` | 11 | World / Cup | 18/18 |

## Texto proposto para aprovação futura

Permitir exibição remota exclusivamente dos 25 arquivos identificados no manifesto, sob risco operacional aceito explicitamente pelo proprietário. Registrar `OWNER_AUTHORIZED_REMOTE_USE` e `DISPLAY_ALLOWED`, manter `rightsStatus=REVIEW_REQUIRED`, `storageUrl=null` e revogação individual obrigatória. A decisão não representa licença, cessão de marca ou comprovação de direitos documentais. A disponibilidade HTTP e a identidade técnica não resolvem a análise jurídica.

O aceite precisa reconhecer dependência da URL remota, possível alteração/indisponibilidade dos bytes, variações históricas de patrocinador (descritas na evidência visual) e contraste baixo em certas logos. A marca da liga irlandesa é institucional; a evidência não afirma que o arquivo escreve Premier Division. Não modificar as imagens oficiais.

Aprovação deve identificar responsável, data/hora, referência auditável e motivo de aceitação do risco. Preencher campos operacionais somente com esse fato efetivo. Aprovar a proposta não identifica por si só um banco nem autoriza alterações em Production: comprovar o destino e escopo da execução separadamente.

## Revogação e confirmação

Cada identidade/asset deve poder ser revogado isoladamente, com IDs e versões esperados, motivo e recibo; bloquear exibição, preservar histórico e confirmar fallback por leitura e localhost. Não excluir registros ou afetar outros assets. Divergência, hash inesperado ou retirada de autorização bloqueia a publicação correspondente.

Executar futuramente uma liga por transação do writer, seguida de confirmação independente. Não repetir transação com resultado indeterminado. Cobertura 11/45 → 36/45 apenas com 25 confirmações e preservação das 11 logos existentes. Allowlist e banco permanecem inalterados nesta proposta.

## Registro posterior de autorização — 23/09/2026

O proprietário solicitou a exibição das 25 identidades exatas nesta tarefa. O estado pendente acima é histórico do rascunho. A decisão posterior está em [autorização operacional](league-logos-25-operational-authorization-2026-09-23.md); o JSON original permanece imutável. Execução bloqueada até comprovar o destino da conexão; zero gravações nesta rodada.

## Resultado posterior — execução autorizada em Production

As 25 transações foram concluídas com confirmação independente no database ID `rknsog8tmbl5u4xqbogxfux5`, usando conexão isolada obtida no Console. Cobertura pública confirmada: **36/45**, preservando as 11 anteriores. O bloqueio/estado pendente descrito acima é histórico. Consulte [resultado por liga e recibos](league-logos-25-production-result-2026-09-23.md). Nenhuma migration foi aplicada; Red Star 104 continua fora desta operação.
