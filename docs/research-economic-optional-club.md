# Economic references without a legacy club

Research references remain bound to the exact Player ID and EA ID. `clubId: null` means that the legacy Player record had no club when the reference was selected. It does not mean that the athlete is a free agent or has no real contract.

The writer and public view use a null-safe comparison. Null matches null; it never matches a populated club. A later change of the player's legacy club hides the earlier selection, as it does for references with a populated club. Existing foreign keys, immutable revisions, head guards and manual priority are unchanged.

The public view keeps its columns, owner and grants. Existing readers can consume these references without a deployment. No Player, club, contract, wage, potential or market-value row is changed by the migration.

## Application

Validate the target identity, recoverable backup and migration checksums. Run the migration only when it is the sole pending migration and no failed migration exists. Use the approved direct administrative connection, never a runtime fallback. Builds and postinstall do not apply migrations.

Publish only frozen, individually supported economic fields through the existing versioned writer with expected-head revisions. Preserve evidence and original currency; unknown dates retain their known precision. Do not manufacture a club to satisfy a reference.

## Rollback

Reconcile uncertain writes by request ID before retrying. Roll back only the selected heads whose revision and hash still match the receipt, using append-only rollback revisions. Retain the source history and leave Player unchanged.

To disable only null-club references, restore the previous view predicate (`p."clubId" = r."clubId"`) after recording the operation. Do not automatically restore NOT NULL while immutable null-club history exists. The nullable column itself does not expose a reference without a valid selected head.

`beta-next: false` is retained. The correction branch also disables automatic deployments; no new public deployment is required for the data operation. MODEL_B_CONSENT_GAP remains open independently.
