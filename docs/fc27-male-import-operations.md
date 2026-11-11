# FC 27 male catalog import: controlled operation

This branch is a preparation artifact. No data from the private manifest is bundled with the site. The roster date is unknown, and the source manifests still say `UNVERIFIED` for public reuse. Keep publication disabled until a separate, evidence-backed approval file names the exact source and selection hashes and acknowledges the undated roster. Never describe these club links as current transfers.

`scripts/runEaMaleImport.mts` operates on one batch or `all`. Every player batch has at most 100 rows; the 127 club candidates are divided into batches of 100 and 26. One club with homonym ambiguity is excluded from staging, together with its 15 linked new players. The 188 possible free agents remain staged and cannot be promoted by this command.

Set the following only in the local operator process, through a private channel: `FUTSCOUT_EA_IMPORT_DATABASE_URL`, `FUTSCOUT_EA_IMPORT_TARGET`, `FUTSCOUT_EA_IMPORT_PLAYERS_DIR`, `FUTSCOUT_EA_IMPORT_CLUBS_DIR`. For Production, also set `FUTSCOUT_EA_IMPORT_PRODUCTION_AUTHORIZED=1` and the independently verified `FUTSCOUT_EA_IMPORT_DATABASE_NAME`, `FUTSCOUT_EA_IMPORT_DATABASE_OID`, `FUTSCOUT_EA_IMPORT_CLUSTER_ID`, and `FUTSCOUT_EA_IMPORT_DATABASE_USER`. The command checks all four database identifiers inside every write transaction. Never put the URL or approval in command arguments or Git.

Before a production run, reconcile this branch with the migration and public-reader code already deployed in Production, verify a restorable backup, apply only the reviewed additive migrations, and deploy a compatible public reader. Validate an authenticated Preview first. The existing 16,228 players must still read as `PUBLIC`; all new rows start as `STAGED`.

After those gates, the order is: `stage-clubs all`, then `stage-players all`, then `publish-clubs all`, then `publish-players all`. The exact command is `node --import tsx scripts/runEaMaleImport.mts <mode> <batch-id-or-all>`. Publication additionally requires `FUTSCOUT_EA_IMPORT_APPROVAL_FILE` pointing to a private approval JSON tied to the frozen source hashes. Stop on any blocked result; do not skip a failed batch by changing source identity. Use `rollback-player <EA ID>` before `rollback-club <EA ID>` for an individual reversal. Rollback retains receipt and historical events; it hides rather than deletes records.

Staging is not publication. A Preview build without private source data verifies code compilation only. National-team navigation remains disabled; its roster needs a verified date and separate release gate.
