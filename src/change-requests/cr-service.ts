import { CrRepo } from './cr-repo';
import { ChangeRequest, Budget, PurchaseAgreement, Committee, COMMITTEE_DELTA_THRESHOLD } from './cr.types';
import { CrStatus, CrAction } from './cr.enums';
import { assertTransition } from './cr-state-machine';
import { computeTotals } from './cr-totals';
import { round2 } from '../common/money.util';
import { Errors } from '../common/errors';
import { ReqUser, hasPolicy, crReadScope } from '../common/policy';

/**
 * Orchestrates CR actions. Every mutating action follows the same shape:
 * load (org-scoped) -> authorize (policy) -> validate domain rules -> transition (guarded, audited)
 * -> bump version -> save.
 */
export class CrService {
	constructor(
		private readonly repo: CrRepo,
		private readonly agreements: Map<string, PurchaseAgreement>,
		private readonly budgets: Map<string, Budget>,
		// Committee membership used when routing large changes to a vote (Task 3).
		private readonly committeeConfig?: { members: string[]; head: string },
	) {}

	/** Load a CR for this user or throw NOT_FOUND. Cross-org CRs are invisible (repo choke point). */
	private getOrThrow(user: ReqUser, id: string): ChangeRequest {
		const cr = this.repo.findOne(user, id);
		if (!cr) throw Errors.notFound(`CR ${id} not found`);
		return cr;
	}

	/**
	 * Authorize an action via `cr_{action}_{scope}` policies, widest scope first:
	 * `o` = any CR in the caller's org (org already guaranteed by the repo choke point),
	 * `w` = CRs in one of the caller's workspaces, `u` = only CRs the caller created.
	 */
	private assertAction(user: ReqUser, cr: ChangeRequest, action: 'c' | 'r' | 'u' | 'a' | 'x', verb: string): void {
		if (hasPolicy(user, `cr_${action}_o`)) return;
		if (hasPolicy(user, `cr_${action}_w`) && user.workspaceIds.includes(cr.workspaceId)) return;
		if (hasPolicy(user, `cr_${action}_u`) && cr.createdBy === user.id) return;
		throw Errors.forbidden(`Not allowed to ${verb} this change request`);
	}

	/** Apply a legal transition and append an immutable audit entry. Provided helper. */
	private transition(cr: ChangeRequest, to: CrStatus, action: CrAction, byUserId: string, at: string, note?: string): void {
		assertTransition(cr.status, to);
		cr.status = to;
		cr.audit = [...cr.audit, { action, byUserId, at, note }];
	}

	/** Recompute totals from the agreement so routing/budget decisions never use stale numbers. */
	private refreshTotals(cr: ChangeRequest): void {
		const agreement = this.agreements.get(cr.agreementId);
		if (!agreement) throw Errors.notFound(`Agreement ${cr.agreementId} not found`);
		cr.totals = computeTotals(agreement, cr);
	}

	private saveBumped(cr: ChangeRequest): ChangeRequest {
		cr.version += 1;
		return this.repo.save(cr);
	}

	// ---- Actions -------------------------------------------------------------

	submit(user: ReqUser, id: string, at: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		this.assertAction(user, cr, 'u', 'submit');
		this.refreshTotals(cr);
		this.transition(cr, CrStatus.SUBMITTED, CrAction.SUBMIT, user.id, at);
		return this.saveBumped(cr);
	}

	sendForApproval(user: ReqUser, id: string, at: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		this.assertAction(user, cr, 'u', 'send for approval');
		// Recompute before routing: the single-approver vs committee decision must be made on
		// fresh totals, not whatever was persisted when the draft was last edited.
		this.refreshTotals(cr);
		this.transition(cr, CrStatus.PENDING_APPROVAL, CrAction.SEND_FOR_APPROVAL, user.id, at);
		if (Math.abs(cr.totals.delta) > COMMITTEE_DELTA_THRESHOLD) {
			if (!this.committeeConfig || this.committeeConfig.members.length === 0) {
				throw Errors.validation('Large delta requires a committee, but none is configured');
			}
			const committee: Committee = { members: [...this.committeeConfig.members], head: this.committeeConfig.head, votes: [] };
			cr.committee = committee;
			this.transition(
				cr,
				CrStatus.COMMITTEE_VOTING,
				CrAction.SEND_FOR_APPROVAL,
				user.id,
				at,
				`|delta| ${Math.abs(cr.totals.delta)} exceeds threshold ${COMMITTEE_DELTA_THRESHOLD}; routed to committee`,
			);
		}
		return this.saveBumped(cr);
	}

	approve(user: ReqUser, id: string, at: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		this.assertAction(user, cr, 'a', 'approve');
		// Committee CRs are approved only through committee resolution (castVote), never directly.
		if (cr.status === CrStatus.COMMITTEE_VOTING || cr.status === CrStatus.COMMITTEE_DECISION) {
			throw Errors.illegalTransition('Committee-routed change requests are approved via committee resolution, not direct approval');
		}
		// Defense in depth: a large delta must never take the single-approver path, even if it
		// somehow sits in PENDING_APPROVAL with stale routing.
		if (Math.abs(cr.totals.delta) > COMMITTEE_DELTA_THRESHOLD) {
			throw Errors.validation(`|delta| exceeds ${COMMITTEE_DELTA_THRESHOLD}; this change request requires a committee vote`);
		}
		this.transition(cr, CrStatus.APPROVED, CrAction.APPROVE, user.id, at);
		cr.approvals = [...cr.approvals, { userId: user.id, action: 'APPROVE', at }];
		return this.saveBumped(cr);
	}

	castVote(user: ReqUser, id: string, decision: 'APPROVE' | 'REJECT', at: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		if (cr.status !== CrStatus.COMMITTEE_VOTING || !cr.committee) {
			throw Errors.illegalTransition('Votes can only be cast while a change request is in committee voting');
		}
		const committee = cr.committee;
		if (!committee.members.includes(user.id)) throw Errors.forbidden('Only committee members may vote');
		if (committee.votes.some((v) => v.userId === user.id)) throw Errors.validation('Committee member has already voted');
		committee.votes = [...committee.votes, { userId: user.id, decision, at }];

		const outcome = this.evaluateCommittee(committee);
		if (outcome) {
			committee.resolvedAt = at;
			this.transition(cr, CrStatus.COMMITTEE_DECISION, CrAction.RESOLVE_COMMITTEE, user.id, at, `committee resolved: ${outcome}`);
			if (outcome === 'APPROVED') {
				this.transition(cr, CrStatus.APPROVED, CrAction.APPROVE, user.id, at, 'majority approved and committee head confirmed');
				cr.approvals = [...cr.approvals, { userId: committee.head, action: 'COMMITTEE_APPROVE', at }];
			} else {
				this.transition(cr, CrStatus.REJECTED, CrAction.REJECT, user.id, at, 'committee vote failed');
			}
		}
		return this.saveBumped(cr);
	}

	/**
	 * Majority-plus-head rule. Approval requires BOTH: strict majority of members voting APPROVE,
	 * and the head voting APPROVE. Resolves early once the outcome is mathematically decided:
	 * - head voted REJECT -> REJECTED (head confirmation can never be met);
	 * - enough REJECT votes that a majority of APPROVEs is unreachable -> REJECTED;
	 * - majority reached and head approved -> APPROVED. Otherwise voting continues.
	 */
	private evaluateCommittee(committee: Committee): 'APPROVED' | 'REJECTED' | null {
		const n = committee.members.length;
		const majority = Math.floor(n / 2) + 1;
		const approvals = committee.votes.filter((v) => v.decision === 'APPROVE').length;
		const rejections = committee.votes.filter((v) => v.decision === 'REJECT').length;
		const headVote = committee.votes.find((v) => v.userId === committee.head)?.decision;

		if (headVote === 'REJECT') return 'REJECTED';
		if (rejections > n - majority) return 'REJECTED';
		if (approvals >= majority && headVote === 'APPROVE') return 'APPROVED';
		if (committee.votes.length === n) return 'REJECTED'; // everyone voted, conditions unmet
		return null;
	}

	returnToDraft(user: ReqUser, id: string, at: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		this.assertAction(user, cr, 'a', 'return');
		this.transition(cr, CrStatus.RETURNED, CrAction.RETURN, user.id, at);
		// Immediately reopen for editing; approval progress is reset per the brief.
		this.transition(cr, CrStatus.DRAFT, CrAction.RETURN, user.id, at, 'reopened as draft; approval progress reset');
		cr.approvals = [];
		cr.committee = undefined;
		return this.saveBumped(cr);
	}

	reject(user: ReqUser, id: string, at: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		this.assertAction(user, cr, 'a', 'reject');
		this.transition(cr, CrStatus.REJECTED, CrAction.REJECT, user.id, at);
		// Budget is intentionally untouched: nothing was consumed before APPLY.
		return this.saveBumped(cr);
	}

	apply(user: ReqUser, id: string, at: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		this.assertAction(user, cr, 'x', 'apply');
		const agreement = this.agreements.get(cr.agreementId);
		if (!agreement) throw Errors.notFound(`Agreement ${cr.agreementId} not found`);
		// Recompute from the agreement as it stands right now (it may have changed since approval).
		this.refreshTotals(cr);
		const { newTotal, delta } = cr.totals;

		// Guard the transition BEFORE moving money: assertTransition throws on non-APPROVED states.
		assertTransition(cr.status, CrStatus.APPLIED);

		if (delta > 0) {
			const budget = this.budgets.get(agreement.budgetId);
			if (!budget) throw Errors.notFound(`Budget ${agreement.budgetId} not found`);
			if (budget.orgCode !== cr.orgCode) throw Errors.forbidden('Budget belongs to another organization');
			if (budget.balance < delta) {
				throw Errors.insufficientBudget(`Budget balance ${budget.balance} cannot cover delta ${delta}`);
			}
			budget.balance = round2(budget.balance - delta);
			budget.booked = round2(budget.booked + delta);
		}

		// Amend the agreement: the CR's draft changes become the new contractual reality.
		if (cr.draftChanges.lineItems && cr.draftChanges.lineItems.length) {
			agreement.lineItems = cr.draftChanges.lineItems.map((li) => ({ ...li }));
			agreement.total = newTotal;
		}
		if (cr.draftChanges.newEndDate) {
			agreement.endDate = cr.draftChanges.newEndDate;
		}

		this.transition(cr, CrStatus.APPLIED, CrAction.APPLY, user.id, at, `delta ${delta} applied to agreement ${agreement.id}`);
		return this.saveBumped(cr);
	}

	/** Read a single CR. Cross-org is NOT_FOUND; in-org but outside read scope is FORBIDDEN. */
	get(user: ReqUser, id: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		if (!this.canRead(user, cr)) throw Errors.forbidden('Not allowed to read this change request');
		return cr;
	}

	/** List the CRs this user is allowed to see. Honor the user's read scope (u/w/o). */
	list(user: ReqUser): ChangeRequest[] {
		const scope = crReadScope(user);
		if (!scope) return [];
		const inOrg = this.repo.list(user); // org scoping happens at the repo choke point
		if (scope === 'o') return inOrg;
		if (scope === 'w') return inOrg.filter((cr) => user.workspaceIds.includes(cr.workspaceId));
		return inOrg.filter((cr) => cr.createdBy === user.id);
	}

	private canRead(user: ReqUser, cr: ChangeRequest): boolean {
		const scope = crReadScope(user);
		if (!scope) return false;
		if (scope === 'o') return true;
		if (scope === 'w') return user.workspaceIds.includes(cr.workspaceId);
		return cr.createdBy === user.id;
	}

	/** Recompute and persist totals for a CR (used by tests and before routing). Provided. */
	recomputeTotals(user: ReqUser, id: string): ChangeRequest {
		const cr = this.getOrThrow(user, id);
		this.refreshTotals(cr);
		return this.repo.save(cr);
	}
}
