# Experimental permission policy v0.2

Internal planning, review, catalog storage and history-only bridge proposals require
ACCESS (`access`), STORE (`storage`) and HISTORY (`history`) CONFIRMED, with a
permission evidence reference. UNKNOWN and RESTRICTED block the respective operation.
These grants must cover the intended internal use; this policy does not reinterpret
personal-use permission as permission for commercial internal storage.

PUBLISH additionally requires `publication` and the existing `commercialUse` grant
CONFIRMED. A passing permission gate is necessary, not sufficient, for publication.
No publication implementation or automatic Current selection is introduced.

Previously planner, eligibility and bridge required every source permission even
for internal operations. Catalog already required access/storage/history. All now
use the explicit INTERNAL operation policy. Identity HIGH, temporal consistency,
evidence integrity and conflicts remain independently checked; selectCurrent=false.

Registry `enabled` and `sourceGate` retain their legacy all-permissions semantics
for serialized envelope/hash compatibility. Callers must use `operationGate` for
operational decisions. Existing source classifications, sync/bridge versions,
record hashes and economic fingerprints are unchanged. Historical frozen plans
are not rewritten; new plans may admit internal-only sources under v0.2.

Kane and other real sources remain unauthorized unless actual access, storage and
history evidence is confirmed. No real data is persisted. Future production work
requires reviewed rights for the intended use, identity/evidence approval and an
explicit publication/current policy. Synthetic tests do not establish legal rights.
