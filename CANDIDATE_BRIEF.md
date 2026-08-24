# Engineering Take-Home: Contract Change Request Service

Welcome, and thanks for investing your time. This exercise is deliberately built to feel like a normal
week on our team: you'll work **inside an existing codebase**, read code written by someone else, fix a
couple of bugs, implement a feature against real-world constraints, write tests, and explain your
decisions.

You're joining a team that builds a **procurement platform**. We care about how you reason about a
stateful domain, how you protect its invariants, how you test, and how you communicate.

---

## 1. Overview

Organizations ("buyers") purchase from suppliers ("vendors") under **Purchase Agreements**. Sometimes an
agreement needs to change after it's active — a quantity adjustment, an added line item, a date
extension. Those changes don't happen directly; they go through a **Change Request (CR)**: a controlled,
auditable, approval-gated amendment.

You are given a small, self-contained service that already models part of this flow. **Your job is to
make the Change Request workflow correct, safe, and complete.**

**Time budget:** ~10–16 focused hours across 4 days. If you hit the ceiling, **stop and document what's
left** — knowing what to cut is part of the signal.

## 2. Business / domain scenario

A Change Request is raised against an existing **Purchase Agreement** and moves through stages:

```
        ┌── RETURNED ◄──────────┐
        ▼                       │
DRAFT ─► SUBMITTED ─► PENDING_APPROVAL ─►(small delta)─► APPROVED ─► APPLIED
                          │
                          └─►(large delta)─► COMMITTEE_VOTING ─► COMMITTEE_DECISION ─► APPROVED ─► APPLIED
   any non-terminal ─► REJECTED / CANCELLED
```

Rules that matter (some are enforced in the scaffold, some are your job — see Tasks):

- **A CR belongs to exactly one organization.** Users see and act on CRs in their own org.
- **Money:** a CR proposes changes to the agreement's line items. The CR must compute
  `baselineTotal`, `newTotal`, and `delta = newTotal − baselineTotal`, to 2 decimals, in the
  agreement's currency.
- **Budget:** if `delta > 0`, applying the CR consumes budget. Apply must fail if the linked budget's
  `balance` can't cover the positive delta.
- **Approval routing:** if `|delta|` is at or below a configured threshold, a single approver may
  approve. If it exceeds the threshold, the CR must route to a **committee vote**; the CR is approved
  only when a majority of the committee approves *and* the committee head confirms.
- **Returns** move a pending CR to `RETURNED`, and from there back to `DRAFT` for editing; approval
  progress is reset.
- **Terminal states** (`APPLIED`, `REJECTED`, `CANCELLED`) are immutable — no further actions.
- **Audit:** every state change appends an immutable timeline entry (who, what, when).
- **Permissions:** actions are gated by policy strings shaped `cr_{action}_{scope}` (explained in the
  scaffold README). Read scope (`u`ser/`w`orkspace/`o`rg) controls which CRs a user can list/see.

The rules above describe the behavior we expect. Turning them into a correct, safe implementation — and
deciding what to do where the rules leave room — is the exercise. Where you make a judgment call, state
it in `IMPLEMENTATION_NOTES.md` and make it explicit in code and tests.

## 3. The provided scaffold

You'll receive a self-contained TypeScript service (see `README.md` for setup). It is deliberately
framework-light — plain service classes over an in-memory data layer, run via Jest — so there's no HTTP
server or database to stand up; you focus on the domain. It contains:

- Domain models and enums for `PurchaseAgreement`, `Budget`, `ChangeRequest`, `User`, `Org`.
- A data-access layer (`cr-repo.ts`) with an **org-scoping choke point** reads are expected to route
  through.
- A partially-implemented `ChangeRequest` service (`cr-service.ts`): some actions work, some are
  `TODO`, and a couple of provided helpers have bugs.
- **Seed fixtures** (`src/seed.ts`) providing two organizations, several users with different
  policies, agreements, budgets, and CRs in various states.
- A test suite. Some tests pass; two are written-but-failing on purpose to point you at your first bugs.
  Treat the provided tests as a starting point, not the full specification — implement against
  everything described in this brief, not only what the visible tests assert.

The `README.md` explains the policy-string convention, how to run, build, and test, and which files are
yours to change.

## 4. Required tasks

> Do these in order; each builds on the last. Commit as you go (see §11).

**Task 0 — Orient (no code).** Read the scaffold README and skim the models/enums. In
`IMPLEMENTATION_NOTES.md` write 3–5 sentences describing the domain model in your own words.

**Task 1 — Make the visible failing tests pass.** Two tests fail on purpose:
- a **money recalculation** case, and
- a **transition guard** case.

Find and fix the underlying cause of each.

**Task 2 — Implement the approval flow.** Complete the stubbed actions in `cr-service.ts` —
`sendForApproval`, `approve`, `returnToDraft`, `reject`, and `apply` (`submit` is already provided) — so
the state machine in §2 is fully and legally enforced, including the budget check and budget update on
`apply`, and an audit/timeline entry per transition.

**Task 3 — Committee routing.** When `|delta|` exceeds the threshold, route to `COMMITTEE_VOTING`:
accept committee votes (`castVote`) and resolve to `APPROVED`/`REJECTED` per the majority-plus-head rule.

**Task 4 — Permissions.** Ensure every action and every read is gated by policy and organization,
and that read scope is honored.

**Task 5 — Tests.** Add your own tests. We value tests that encode the invariants and edge cases you
consider important over a high coverage number — cover the behavior you implemented, not just the happy
path.

**Task 6 — (Fullstack/Frontend variants only — skip for the backend version of this exercise.)** If your
package includes the `web/` Angular app, build a minimal CR **list** (filter by status, scoped to the
user's org) and a CR **detail** view that shows the totals/delta and exposes only the actions the current
user is permitted to perform. Plain, correct, and permission-accurate beats pretty.

## 5. Acceptance criteria

- The originally-visible tests pass.
- The CR state machine enforces only legal transitions, and terminal states stay immutable.
- Money math (`baselineTotal`, `newTotal`, `delta`) is correct and consistently rounded.
- Applying a CR respects the budget and never over-spends it.
- Committee routing triggers correctly and resolves correctly.
- A user cannot read or affect a CR outside their org, and read scope is honored.
- Every state change is recorded in the audit/timeline.
- Your added tests meaningfully cover the behavior you implemented.
- (FS/FE) The UI never offers an action the user isn't permitted to take.

## 6. Non-functional requirements

- Keep the existing architecture and patterns; don't rewrite the scaffold to your taste. Match the
  surrounding code style (the repo ships ESLint + Prettier — run them).
- Errors should be meaningful and use the provided error/exception pattern, not bare `throw new Error`.
- No new heavyweight dependencies without justification in your notes.

## 7. Testing expectations

- Tests run with `npm test` and must pass on a clean checkout after `npm ci`.
- Prefer fast, deterministic tests. Build on the in-memory seed fixtures the scaffold provides
  (`src/seed.ts`).
- Tell us your testing strategy in your notes.

## 8. Documentation expectations — `IMPLEMENTATION_NOTES.md`

A short, honest engineering note (aim for 1–2 pages), covering:
1. **What you changed** and why (per task is fine).
2. **Your domain model** — entities, the state machine, and how transitions are guarded.
3. **Invariants** you enforce and how.
4. **Testing strategy** — what you tested, what you deliberately didn't, and why.
5. **Assumptions** you made and any judgment calls you had to reason through.
6. **Where you used AI** (see §9) — what for, and how you verified it.
7. **What you'd improve with more time** and the riskiest part of your solution.

## 9. AI usage policy

**Using AI tools is allowed and expected** — it's how we work too. There is no penalty for using them.
There **is** a strong expectation that you understand and own every line you submit. We ask only that you:

- Briefly disclose where and how you used AI in `IMPLEMENTATION_NOTES.md` (no need for transcripts).
- Be ready, in the follow-up interview, to explain any part of your code and to **modify and extend it
  live**. The interview is designed around your own submission, so surface-level generated code that you
  can't reason about will become obvious — not through detection tools, but through conversation and
  live changes.

## 10. Submission instructions

- Submit a **git repository** (zipped, or a private repo you share with us) with your **full commit
  history** intact. Please don't squash to a single commit.
- Include `IMPLEMENTATION_NOTES.md` at the root.
- Include a **5–8 minute screen-recording walkthrough** (unlisted link or attached file) in which you:
  (a) demo the main flow (submit → approve/committee → apply, plus a rejection/return),
  (b) walk through one **non-trivial design decision** and the tradeoff you made, and
  (c) point to one part you'd improve.
- Make sure `npm ci && npm test` works from a clean clone. Tell us if anything needs special setup.

## 11. Suggested 4-day timeline

| Day | Focus |
|---|---|
| **Day 1** | Set up, run, seed, read the code (Task 0). Fix the visible failing tests (Task 1). Sketch the state machine in your notes. |
| **Day 2** | Implement the core approval flow (Task 2). Commit incrementally. |
| **Day 3** | Committee routing (Task 3) + permissions (Task 4). Write your tests (Task 5). |
| **Day 4** | (FS/FE) the UI (Task 6) *or* polish + edge cases. Finalize notes, record the video, clean up commits. |

Commit in meaningful steps as you go — we read commit history as part of evaluating how you work.

## 12. What happens in the follow-up interview

A 45–60 minute session built entirely around **your** submission. Expect to:
- Walk us through your state machine and where you guard transitions.
- **Make a live change to your own code** — e.g. add a new transition or change an approval rule — and
  explain the blast radius.
- **Debug a scenario** we describe (e.g. "a CR shows up as `APPROVED` in the audit log without ever
  passing through `PENDING_APPROVAL` — walk us through how that could happen in your code and how
  you'd prove it can't").
- Discuss a design tradeoff and what you'd do differently at scale.

There are no trick questions. If you understand what you built, this part is straightforward — and
enjoyable. Good luck, and have fun with it.
