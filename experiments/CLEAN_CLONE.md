# Economic experiments: clean-clone tests

Install the repository's locked development dependencies and use its supported Node runtime.

`node experiments/economic-tests.mjs unit`

Unit tests use invented fixtures, filesystem temp journals and mock writers only. They do not read audit datasets, access PostgreSQL, train on provider labels or call APIs. The native PostgreSQL harness is separate and is NOT run by this command.

`node experiments/economic-tests.mjs scientific`

This is real-artifact regression/integrity verification, not model training. Missing local prerequisites yield `SCIENTIFIC_BLOCKED` and exit 2; incomplete or changed artifacts fail nonzero, never skip or substitute synthetic data. Explicit separation replaces 19 formerly dataset-dependent tests with 17 scientific checks (overlapping value/contract hash checks consolidated); all 14 original evidence-adapter regressions are retained.

Provide authorized original files locally under ignored `audit/output/`: `futscout-economic-dataset-v1-20261008` (dataset manifest and every file it pins, including validation manifest), `salarysport-wage-sample-preflight-20261008/selection.json`, and `contract-evidence-pilot-20261008/{selection,evidence}.json`. Obtain permission and secure transfer independently; these commands do not download or create them. Never commit datasets, receipts, personal records or credentials. Existing expected hashes remain unchanged. No environment variable bypass or synthetic replacement exists.

Inventory: Value engine/hybrid freeze checks, Wage selection check, Contract adapter suite and temporal/sync pilot regressions formerly depended on those files. Synthetic temporal/sync tests remain in the unit suite; the contract historical artifact assertion is now scientific. The new adapter unit fixture is explicitly synthetic and its result must never be represented as a real observation.

A clean clone reproduces algorithms, safety gates and mock durability behavior, not real model quality, historical provider collection, licensing or PostgreSQL integration results. Real-label training remains license-blocked. No Production configuration is needed.
