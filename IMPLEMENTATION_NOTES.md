# Implementation Notes

## 1. What I changed

- **Task 1a — money defect:** `round2()` used `Math.trunc`, silently dropping sub-cent amounts (3 × 6.669 = 20.007 → 20.00). Replaced with nearest-cent rounding, half-away-from-zero so negative deltas round symmetrically (`Math.round(-0.5)` in JS rounds toward +∞, which would bias credits vs. charges).
- **Task 1b — transition guard:** `assertTransition` only rejected moves out of terminal states, so e.g. `DRAFT → APPROVED` passed. It now consults the completed `LEGAL_TRANSITIONS` table; illegal moves throw `ILLEGAL_TRANSITION`, terminal moves throw `TERMINAL_STATE`.
- **Org-scope hole:** `CrRepo.findOne` bypassed the `scoped()` choke point — any user could load any org's CR by id. Single-record reads now route through it; cross-org CRs surface as `NOT_FOUND` (no existence leak).
- **Task 2:** implemented `sendForApproval`, `approve`, `returnToDraft`, `reject`, `apply` with policy gates, guarded transitions, budget check/update on apply, agreement amendment on apply, an audit entry per transition, and a version bump per mutation.
- **Task 3:** committee initialization + routing in `sendForApproval` when `|delta| > COMMITTEE_DELTA_THRESHOLD`; `castVote` with membership/single-vote checks and early resolution via `COMMITTEE_DECISION`.
- **Task 4:** action authorization helper (`cr_{action}_{scope}`, widest scope wins: `o` → org, `w` → own workspace, `u` → own CRs); `get`/`list` additionally honor read scope on top of the repo's org choke point.
- **Task 5:** `test/cr-service.spec.ts` — 15 invariant-focused tests (20 total with the originals).

## 2. Domain model

A **ChangeRequest** proposes an amendment (line items and/or end date) to an active **PurchaseAgreement**, which belongs to one **Org** and is funded by a **Budget**. The CR carries computed `totals` (`baselineTotal` from the agreement, `newTotal` from the draft changes, `delta` = difference, all 2dp). It moves through a state machine — draft/submit editing stages, then either a single-approver path (small `|delta|`) or a committee-vote path (large `|delta|`), converging on `APPROVED → APPLIED`; `RETURNED → DRAFT` is the rework loop; `REJECTED`/`CANCELLED`/`APPLIED` are terminal. Transitions are guarded centrally: every mutation funnels through `CrService.transition()` → `assertTransition()`, which is the only place status changes, and which appends the audit entry in the same step — so a state change without an audit record is structurally impossible.

## 3. Invariants I enforce (and how)

| Invariant | How it's enforced | Where |
|---|---|---|
| Only declared transitions occur | Table lookup, throw on miss | `cr-state-machine.ts` `assertTransition` |
| Terminal states immutable | Terminal check before table check | same |
| Money is 2dp, nearest cent, sign-symmetric | Single rounding primitive used by all math | `money.util.ts` `round2` |
| Budget never overspent | `balance < delta` check before mutation; check-then-update in one synchronous step | `cr-service.ts` `apply` |
| Large deltas cannot take the single-approver path | Routing at `sendForApproval` on fresh totals **and** a defense-in-depth re-check in `approve` | `cr-service.ts` |
| Committee approval = strict majority + head confirms | `evaluateCommittee`, resolves early (head veto / unreachable majority) | `cr-service.ts` |
| Cross-org CRs invisible | Org-scope choke point on `list` **and** `findOne` | `cr-repo.ts` `scoped` |
| Read scope honored (u/w/o) | Scope filter in `list`, scope check in `get` | `cr-service.ts` |
| Every state change audited | Audit append lives inside the transition helper | `cr-service.ts` `transition` |
| Rework resets approval progress | `returnToDraft` clears `approvals` + `committee` | `cr-service.ts` |

## 4. Testing strategy

I tested the invariants above rather than chasing coverage: one full happy path asserting budget/agreement/audit/version side effects together, then targeted tests per rule (stage-skipping, terminal immutability, both committee outcomes, head veto, non-member/double votes, insufficient budget leaving state unchanged, cross-org `NOT_FOUND`, read-scope narrowing, missing-policy `FORBIDDEN`). Fixtures are deep-cloned per test because `apply` intentionally mutates agreements and budgets and the seed module exports shared references. Deliberately not tested: concurrency (single-threaded in-memory layer — see §7), `CANCEL` (no service action exposes it yet; the transition table supports it), and currency mismatches (single-currency fixtures).

## 5. Assumptions / judgment calls

- **`returnToDraft` performs both hops** (`PENDING_APPROVAL → RETURNED → DRAFT`, two audit entries) since the brief says a return goes "back to DRAFT for editing" and no separate "reopen" action exists.
- **Reject/cancel from any non-terminal state**, per the README diagram's "any non-terminal → REJECTED / CANCELLED" — including `APPROVED` (an approved-but-not-yet-applied CR can still be withdrawn).
- **`apply` recomputes totals from the live agreement** before the budget check, so the budget is charged for the delta as it stands at apply time, not a stale approval-time figure.
- **Applying amends the agreement** (line items, total, end date). The brief doesn't state it explicitly, but an applied amendment that never touches the agreement would be meaningless.
- **Negative deltas don't touch the budget** — the brief only defines consumption for `delta > 0`; releasing budget on savings is a product decision I left out and would raise with the team.
- **Committee membership is constructor config**, snapshotted onto the CR at routing time so later config changes don't alter an in-flight vote.
- **In-org reads outside read scope throw `FORBIDDEN`; cross-org reads throw `NOT_FOUND`** — no information leak across tenants, clearer signal inside one.
- **`submit` recomputes totals** so a routing decision can never be made on never-computed seed totals.

## 6. Where I used AI

I used Claude (Anthropic) as a pair programmer throughout: reading the scaffold, locating the two seeded defects and the `findOne` scoping gap, drafting the service implementation and the test suite, and drafting these notes. I directed the design decisions listed in §5, reviewed every line, and verified behavior by running the suite, lint, format, and build from a clean install. All code was AI-assisted rather than handwritten; I can walk through and modify any part of it.

## 7. What I'd improve with more time

The riskiest part is **`apply`'s check-then-update on the budget**: safe in this synchronous in-memory model, but racy against a real database — two concurrent applies could both pass the balance check. I'd move to an atomic conditional update (e.g. `findOneAndUpdate` with `balance: { $gte: delta }` decrementing in the same operation) and use the existing `version`/`CONFLICT` machinery for optimistic locking on the CR itself. Next: expose `cancel`, per-agreement committee/threshold configuration instead of a global constant, a currency assertion between budget and agreement, and property-based tests for the money helpers.
