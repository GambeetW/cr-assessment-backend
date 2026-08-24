import { CrService } from '../src/change-requests/cr-service';
import { CrRepo } from '../src/change-requests/cr-repo';
import { CrStatus } from '../src/change-requests/cr.enums';
import { Budget, PurchaseAgreement } from '../src/change-requests/cr.types';
import { BusinessError } from '../src/common/errors';
import { buildSeed, users } from '../src/seed';

/**
 * Invariant-focused service tests. Each block encodes one rule from the brief:
 * legal/illegal paths, terminal immutability, budget limits, committee outcomes,
 * org isolation, read scope, and audit behavior.
 *
 * Fixtures are deep-cloned per test: `apply` mutates agreements/budgets, and the seed module
 * exports shared object references, so isolation matters.
 */
const T = (n: number) => `2026-08-0${n}T00:00:00.000Z`;

function freshService() {
	const seed = buildSeed();
	const agreements = new Map<string, PurchaseAgreement>([...seed.agreements].map(([k, v]) => [k, structuredClone(v)]));
	const budgets = new Map<string, Budget>([...seed.budgets].map(([k, v]) => [k, structuredClone(v)]));
	const repo = new CrRepo();
	repo.seed(seed.changeRequests.map((cr) => structuredClone(cr)));
	const service = new CrService(repo, agreements, budgets, seed.committeeConfig);
	return { service, agreements, budgets };
}

function expectBusinessError(fn: () => unknown, code: string) {
	try {
		fn();
		fail(`expected BusinessError ${code}`);
	} catch (e) {
		expect(e).toBeInstanceOf(BusinessError);
		expect((e as BusinessError).code).toBe(code);
	}
}

describe('happy path: small delta, single approver', () => {
	it('runs draft -> submitted -> pending -> approved -> applied, consuming budget and auditing every step', () => {
		const { service, agreements, budgets } = freshService();

		service.submit(users.alice, 'CR-DRAFT', T(1));
		service.sendForApproval(users.mona, 'CR-DRAFT', T(2));
		let cr = service.get(users.mona, 'CR-DRAFT');
		expect(cr.status).toBe(CrStatus.PENDING_APPROVAL); // +500 <= 1000: no committee
		expect(cr.committee).toBeUndefined();

		service.approve(users.mona, 'CR-DRAFT', T(3));
		cr = service.apply(users.mona, 'CR-DRAFT', T(4));

		expect(cr.status).toBe(CrStatus.APPLIED);
		expect(cr.totals).toEqual({ baselineTotal: 8000, newTotal: 8500, delta: 500 });
		const budget = budgets.get('BUD-1')!;
		expect(budget.balance).toBe(9500); // 10000 - 500
		expect(budget.booked).toBe(8500); // 8000 + 500
		const agreement = agreements.get('AGR-1')!;
		expect(agreement.total).toBe(8500); // agreement amended
		// one audit entry per transition, in order
		expect(cr.audit.map((a) => a.action)).toEqual(['SUBMIT', 'SEND_FOR_APPROVAL', 'APPROVE', 'APPLY']);
		expect(cr.version).toBe(5); // 4 mutations on top of seed version 1
	});
});

describe('state machine legality', () => {
	it('rejects skipping stages (draft cannot be approved or applied directly)', () => {
		const { service } = freshService();
		expectBusinessError(() => service.approve(users.mona, 'CR-DRAFT', T(1)), 'ILLEGAL_TRANSITION');
		expectBusinessError(() => service.apply(users.mona, 'CR-DRAFT', T(1)), 'ILLEGAL_TRANSITION');
	});

	it('keeps terminal states immutable', () => {
		const { service } = freshService();
		expectBusinessError(() => service.reject(users.mona, 'CR-APPLIED', T(1)), 'TERMINAL_STATE');
		expectBusinessError(() => service.returnToDraft(users.mona, 'CR-APPLIED', T(1)), 'TERMINAL_STATE');
		expectBusinessError(() => service.apply(users.mona, 'CR-APPLIED', T(1)), 'TERMINAL_STATE');
	});

	it('return moves a pending CR back to an editable draft and resets approval progress', () => {
		const { service } = freshService();
		const cr = service.returnToDraft(users.mona, 'CR-PENDING-SMALL', T(1));
		expect(cr.status).toBe(CrStatus.DRAFT);
		expect(cr.approvals).toEqual([]);
		expect(cr.committee).toBeUndefined();
		expect(cr.audit.filter((a) => a.action === 'RETURN')).toHaveLength(2); // RETURNED, then DRAFT
		// and the loop is usable: it can be submitted again
		expect(service.submit(users.mona, 'CR-PENDING-SMALL', T(2)).status).toBe(CrStatus.SUBMITTED);
	});

	it('reject is terminal and leaves the budget untouched', () => {
		const { service, budgets } = freshService();
		const before = budgets.get('BUD-1')!.balance;
		const cr = service.reject(users.mona, 'CR-PENDING-SMALL', T(1));
		expect(cr.status).toBe(CrStatus.REJECTED);
		expect(budgets.get('BUD-1')!.balance).toBe(before);
		expectBusinessError(() => service.submit(users.mona, 'CR-PENDING-SMALL', T(2)), 'TERMINAL_STATE');
	});
});

describe('committee routing (large |delta|)', () => {
	it('routes above-threshold deltas to committee voting', () => {
		const { service } = freshService();
		service.submit(users.mona, 'CR-DRAFT', T(1));
		// make the draft large: quantity 18 x 500 + 30 x 100 = 12000 => delta 4000
		const repoCr = service.get(users.mona, 'CR-DRAFT');
		repoCr.draftChanges.lineItems = [
			{ sku: 'A', quantity: 18, unitPrice: 500 },
			{ sku: 'B', quantity: 30, unitPrice: 100 },
		];
		const cr = service.sendForApproval(users.mona, 'CR-DRAFT', T(2));
		expect(cr.status).toBe(CrStatus.COMMITTEE_VOTING);
		expect(cr.committee).toBeDefined();
		expect(cr.committee!.head).toBe('dina');
	});

	it('cannot send an already-pending CR for approval again', () => {
		const { service } = freshService();
		expectBusinessError(() => service.sendForApproval(users.mona, 'CR-PENDING-LARGE', T(1)), 'ILLEGAL_TRANSITION');
	});
});

describe('committee voting from COMMITTEE_VOTING state', () => {
	function votingService() {
		const { service, budgets, agreements } = freshService();
		service.submit(users.mona, 'CR-DRAFT', T(1));
		const cr = service.get(users.mona, 'CR-DRAFT');
		cr.draftChanges.lineItems = [
			{ sku: 'A', quantity: 18, unitPrice: 500 },
			{ sku: 'B', quantity: 30, unitPrice: 100 },
		];
		service.sendForApproval(users.mona, 'CR-DRAFT', T(2)); // delta 4000 -> committee
		return { service, budgets, agreements };
	}

	it('stays in voting until the outcome is decided, then approves on majority + head', () => {
		const { service, budgets } = votingService();
		let cr = service.castVote(users.carl, 'CR-DRAFT', 'APPROVE', T(3));
		expect(cr.status).toBe(CrStatus.COMMITTEE_VOTING); // 1/2 approvals, head silent
		cr = service.castVote(users.dina, 'CR-DRAFT', 'APPROVE', T(4));
		expect(cr.status).toBe(CrStatus.APPROVED); // majority (2/2) + head confirmed
		expect(cr.audit.map((a) => a.action)).toContain('RESOLVE_COMMITTEE');

		cr = service.apply(users.mona, 'CR-DRAFT', T(5));
		expect(cr.status).toBe(CrStatus.APPLIED);
		expect(budgets.get('BUD-1')!.balance).toBe(6000); // 10000 - 4000
	});

	it('rejects as soon as the head rejects, regardless of other approvals', () => {
		const { service } = votingService();
		service.castVote(users.carl, 'CR-DRAFT', 'APPROVE', T(3));
		const cr = service.castVote(users.dina, 'CR-DRAFT', 'REJECT', T(4));
		expect(cr.status).toBe(CrStatus.REJECTED);
	});

	it('only committee members may vote, and only once', () => {
		const { service } = votingService();
		expectBusinessError(() => service.castVote(users.mona, 'CR-DRAFT', 'APPROVE', T(3)), 'FORBIDDEN');
		service.castVote(users.carl, 'CR-DRAFT', 'APPROVE', T(3));
		expectBusinessError(() => service.castVote(users.carl, 'CR-DRAFT', 'APPROVE', T(4)), 'VALIDATION');
	});

	it('blocks direct approval of a committee-routed CR', () => {
		const { service } = votingService();
		expectBusinessError(() => service.approve(users.mona, 'CR-DRAFT', T(3)), 'ILLEGAL_TRANSITION');
	});
});

describe('budget safety', () => {
	it('refuses to apply when the balance cannot cover a positive delta, leaving state unchanged', () => {
		const { service, agreements, budgets } = freshService();
		agreements.get('AGR-1')!.budgetId = 'BUD-LOW'; // balance 100 < delta 500
		service.approve(users.mona, 'CR-PENDING-SMALL', T(1));
		expectBusinessError(() => service.apply(users.mona, 'CR-PENDING-SMALL', T(2)), 'INSUFFICIENT_BUDGET');
		const cr = service.get(users.mona, 'CR-PENDING-SMALL');
		expect(cr.status).toBe(CrStatus.APPROVED); // not APPLIED
		expect(budgets.get('BUD-LOW')!.balance).toBe(100); // untouched
	});
});

describe('org isolation and read scope', () => {
	it('hides other orgs entirely (reads and actions resolve to NOT_FOUND)', () => {
		const { service } = freshService();
		expectBusinessError(() => service.get(users.bob, 'CR-PENDING-SMALL'), 'NOT_FOUND');
		expectBusinessError(() => service.approve(users.bob, 'CR-PENDING-SMALL', T(1)), 'NOT_FOUND');
		expect(service.list(users.bob).map((c) => c.id)).toEqual(['CR-BETA']);
	});

	it('honors read scope: cr_r_u sees only own CRs, cr_r_o sees the whole org', () => {
		const { service } = freshService();
		const aliceIds = service.list(users.alice).map((c) => c.id);
		expect(aliceIds.sort()).toEqual(['CR-APPLIED', 'CR-DRAFT', 'CR-PENDING-LARGE', 'CR-PENDING-SMALL']); // all created by alice
		const monaIds = service.list(users.mona).map((c) => c.id);
		expect(monaIds).toHaveLength(4); // org scope
	});

	it('denies actions the user lacks a policy for', () => {
		const { service } = freshService();
		expectBusinessError(() => service.approve(users.alice, 'CR-PENDING-SMALL', T(1)), 'FORBIDDEN'); // alice has no cr_a_*
		expectBusinessError(() => service.apply(users.carl, 'CR-APPLIED', T(1)), 'FORBIDDEN'); // carl has no cr_x_*
	});
});
