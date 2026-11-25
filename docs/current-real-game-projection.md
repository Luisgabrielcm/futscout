# Current real club and free-agent projections

The owner decision of 25 November 2026 permits the FutScout projection to mirror
a positively confirmed real free agent, provided identity and FC 27 availability
are evidenced. Missing club information, retirement and absence in an old squad
are not evidence of real free-agent status.

Projection payload version 2 has a separate policy hash and approval reference.
Version 1 is evaluated with its original rules and hashes. Existing selection
indexes remain compatible and authenticate each versioned payload individually.
All reader flags remain off by default.

For real free agents, version 2 requires positive, bound employment evidence and
no destination, origin, or loan. Club destinations retain the existing identity,
availability, licensing and chronology checks. An old squad's NOT_IN_SQUAD
national-team coverage becomes UNKNOWN in a current projection supported by new
game evidence; this does not create a national-team membership. The original EA
membership and snapshot remain unchanged.

REAL brand aliases use the real club name while the game keeps its EA brand and
identity. Inter and Lombardia FC, for example, share the existing EA identity;
this does not rename the canonical club, create a new club, or grant brand rights.

Publishing an update uses an append-only revision, compare-and-swap selection,
and separately authenticated before, after and rollback index roots. Deploy the
compatible reader with all three roots and validate the unchanged public state
before changing selections. Rollback restores prior revision pointers with an
incremented selection version; the transition reader accepts that exact root.
Do not blindly restore an older deployment pinned to a different root. No
migration, legacy Player.clubId change, economic update, or automatic deploy is
part of this operation.
