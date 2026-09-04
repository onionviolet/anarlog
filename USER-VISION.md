# User vision, verbatim and additive

**Owner:** Weibao Chen
**Status:** authoritative intent record
**Editing rule:** preserve entries verbatim. Do not silently correct spelling, grammar, emphasis, or ambiguity. Add new dated entries instead of rewriting old ones. A dated interpretation note may follow an entry, but it must stay visibly separate from the quotation and point to any binding decision in the project's contract, requirements, or plan files.

**Scope:** this fork of `fastrepl/anarlog`, and the local meeting-capture workflow it serves. Format follows `onionviolet/user-vision-skill` v0.1.

## Verbatim goal statements

### 2026-06-24, the fork is a learning artifact, not just a tool

> Add dissections like this for future learning cases ... think of other similar learning scenarios

*Provenance note: recorded in `99_Meta_Workflow/Agent_Logic_Log.md` on 2026-06-24, not captured live here. Treated as verbatim to the extent the log preserved it, with the ellipsis as logged.*

#### Interpretation recorded 2026-09-04

**Status:** active.

**Current interpretation:** the fork exists partly to be built by him. The session that created it also created the grammar-versus-vocabulary teaching method and the coached-coding rule, which say the agent reviews and he writes. That makes this repository a place where the explanation of a change is part of the deliverable, not a courtesy.

**Open questions:** where the line falls between work he should write and work that is plumbing. Unresolved in practice: the 2026-09-04 ungating patch was written by the agent on his explicit instruction, which is a deviation he has not ruled on.

**Planning effect:** `FORK_SETUP.md` carries `[grammar]` and `[vocab]` tags on every block, and commits explain why rather than what. No requirement yet.

**Relationship to earlier entries:** first entry.

### 2026-09-04, the opening instruction

> setup the local meeting transcriber, consider better options and more, update my fork accordingly,

#### Interpretation recorded 2026-09-04

**Status:** resolved.

**Current interpretation:** three requests in one sentence. Install a working local transcriber; do not accept the incumbent choice without checking the field; then bring the fork into line with whatever the check concludes. "Update my fork accordingly" is conditional on the second clause, which is what allowed the fork's stated goal to be retired rather than pursued.

**Open questions:** none remaining. "And more" was read as permission to widen scope, not as a specific ask.

**Planning effect:** produced the 1.4.19 install, the sync of `main` to upstream, the rewrite of `FORK_SETUP.md`, and the update to `Capture_Protocol §Recording` in the planning vault.

**Relationship to earlier entries:** extends 2026-06-24 by giving the fork a concrete near-term job.

### 2026-09-04, the incumbent must justify itself

> Is anarlog the best option now? are there better? cool pr and alternatives and more?

#### Interpretation recorded 2026-09-04

**Status:** resolved.

**Current interpretation:** a request to re-examine the tool choice against the field and against the health of the upstream project, not only its features. "Cool pr" asked what is happening in the codebase worth knowing, which surfaced the finding that the pull-request queue is pricing and marketing work.

**Open questions:** whether upstream's commercial direction eventually degrades the free local path. Nothing to test yet; the local pipeline is intact as of 1.4.19. Revisit if a currently free local feature moves behind a gate.

**Planning effect:** the verdict and the governance risk are recorded in `Capture_Protocol §Recording` so the question is not re-litigated. Established that keeping a synced fork is insurance rather than a hobby.

**Relationship to earlier entries:** confirms the 2026-09-04 opening instruction's second clause and supplies its answer.

### 2026-09-04, the fork's standing purpose

> yes, register the local MCP server, update accordingly, make our fork with the goal of not gating anything local pro features behind a paywall or login, make a uservision.md based on my words

#### Interpretation recorded 2026-09-04

**Status:** active.

**Current interpretation:** the fork now has a standing goal rather than a one-off patch. Anything that runs on his machine should work without paying and without signing in. The word "login" is doing real work here and is not redundant with "paywall": it rules out sign-in walls independently of price, which is what the Automations finding turned out to be.

**Open questions:** three. (1) Does "local" include features that run here but call the user's own third-party accounts, such as Linear and Notion automations? Read as yes, on the ground that no Anarlog server is involved; he has not confirmed it. (2) Does the goal extend to Rust-side or cloud-mirroring gates not yet found? (3) Is maintaining this against roughly thirty upstream commits a day worth the rebase cost, or should the branch be regenerated on demand instead? Resolved only by living with it for a term.

**Planning effect:** binding on branch `local-first-no-gates`. The rule is stated once in `apps/desktop/src/auth/local-entitlements.ts` and tested in its sibling test file, so the policy is inspectable in one place rather than scattered across call sites. `FORK_SETUP.md §What this fork is for` states it in prose.

**Relationship to earlier entries:** supersedes the fork's original 2026-06-24 goal of unlocking hidden multilingual speech-to-text models, which upstream met independently. The old goal is not deleted; it survives in `FORK_SETUP.md` with the reasoning intact.

## Interpretation pointers

These files interpret, but do not replace, the statements above.

- `FORK_SETUP.md` — the fork's current goal, verification status, and build blockers.
- `apps/desktop/src/auth/local-entitlements.ts` — the binding statement of which features are billable, in code.
- `99_Meta_Workflow/Capture_Protocol.md §Recording` (planning vault) — the tool decision and the recording policy this fork serves.
- `99_Meta_Workflow/Agent_Logic_Log.md` (planning vault) — dated record of why the original fork goal was retired.

## Not yet created

`USER-VISION-INBOX.md` and `DISPOSITION-LEDGER.md` from the same skill are not present. Nothing has been rejected or backburnered here yet, so the ledger has no entries to hold. Create it the first time an idea for this fork is turned down, because the skill's binding rule is that a rejection keeps its reasoning rather than disappearing.
