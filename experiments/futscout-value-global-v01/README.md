# FutScout Value handoff

Offline Value collection, immutable journal validation and import batch preparation. No datasets, credentials, operational receipts or approvals are shipped. Frozen evidence under audit/output must be supplied and independently authorized before any operational execution. SQL files are review candidates only; this PR does not install them or authorize database writes.

Manual quarantines remain bound to their exact request hash, player and explicit approval reference through private local configuration (see LOCAL_BINDINGS.md). Missing bindings block dependent operations. Uncertain attempts cannot be retried automatically. Import batches require selectCurrent=false. The public runtime does not import this experiment.

Local tests: npx tsx --test experiments/futscout-value-global-v01/*.test.ts. Separate PostgreSQL harnesses require a disposable local cluster. Matcher and nationality helpers were relocated from local audit output without changing their behavior.

One prepared batch can now be handed to the existing journal runner without provider collection. See [STAGING_IMPORT.md](STAGING_IMPORT.md) for the bounded API, target prerequisites and remaining isolated rehearsal. No operational CLI is enabled.
