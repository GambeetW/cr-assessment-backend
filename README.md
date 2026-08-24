# Contract Change Request Service

A small, self-contained procurement service. Your task is to make its **Change Request (CR)** workflow
correct, safe, and complete: amendments to a live Purchase Agreement that move through a guarded,
auditable, approval-gated state machine.

This package is fully self-contained — no external services or accounts are required. Start with
[`CANDIDATE_BRIEF.md`](./CANDIDATE_BRIEF.md) for the full scenario, tasks, acceptance criteria, AI-usage
policy, and submission instructions. This README covers setup, conventions, and where to work.

## Setup

```bash
nvm use            # Node 18.20.3 (see .nvmrc / engines)
npm ci             # install dependencies
npm test           # Jest — two tests fail on purpose; fixing the bugs behind them is your first task
npm run build      # type-check + compile to dist/
npm run lint       # eslint
npm run format     # prettier --write
```

No database is required: the suite operates on in-memory domain objects, so everything runs from a clean
clone after `npm ci`.

## Policy-string convention

Permissions are strings shaped **`cr_{action}_{scope}`**:

| action | meaning | | scope | meaning |
|---|---|---|---|---|
| `c` | create | | `u` | user — only your own CRs |
| `r` | read | | `w` | workspace |
| `u` | update | | `o` | org — all CRs in your org |
| `a` | approve | | | |
| `x` | apply | | | |

Examples: `cr_r_w` = read CRs in your workspace; `cr_a_o` = approve any CR in your org;
`cr_c_u` = create your own CRs. Read scope controls which CRs a user can even list/see.

## State machine

```
        ┌── RETURNED ◄──────────┐
        ▼                       │
DRAFT ─► SUBMITTED ─► PENDING_APPROVAL ─►(|delta| ≤ threshold)─► APPROVED ─► APPLIED
                          │
                          └─►(|delta| > threshold)─► COMMITTEE_VOTING ─► COMMITTEE_DECISION ─► APPROVED ─► APPLIED
   any non-terminal ─► REJECTED / CANCELLED
```

Terminal states (`APPLIED`, `REJECTED`, `CANCELLED`) are immutable.

## Where to work

- `src/change-requests/cr-state-machine.ts` — the transition table is incomplete, and the transition
  guard is too permissive. Complete and tighten it.
- `src/common/money.util.ts` — a money helper has a rounding defect (surfaced by `cr-totals.spec.ts`).
- `src/change-requests/cr-service.ts` — `sendForApproval`, `approve`, `castVote`, `returnToDraft`,
  `reject`, and `apply` are stubs to implement.
- `src/change-requests/cr-repo.ts` — the in-memory data layer, including the org-scope choke point reads
  are expected to route through.
- `test/` — add your own tests.

The visible tests are a starting point, not the full specification: implement against everything
described in [`CANDIDATE_BRIEF.md`](./CANDIDATE_BRIEF.md).

## Files

```
src/
  common/
    money.util.ts            # round2 / sumMoney / lineTotal
    policy.ts                # ReqUser + policy helpers (hasPolicy, crReadScope)
    errors.ts                # BusinessError (isBusinessError pattern)
  change-requests/
    cr.enums.ts              # CrStatus, CrAction, terminal set
    cr.types.ts              # ChangeRequest / LineItem / Budget / Agreement shapes
    cr-state-machine.ts      # transition table + guard  (incomplete)
    cr-totals.ts             # baseline / new / delta computation
    cr-repo.ts               # in-memory data layer + org-scope choke point
    cr-service.ts            # action orchestration  (stubs to implement)
  seed.ts                    # deterministic fixtures (two orgs, users, agreements, budgets, CRs)
test/
  cr-totals.spec.ts          # one failing case to start from
  cr-transitions.spec.ts     # one failing case to start from
```

## A note on AI tools

Using AI tools is allowed and expected — see the brief for the (light) disclosure policy. We care that
you understand and own what you submit; the follow-up interview is built around your own code.
