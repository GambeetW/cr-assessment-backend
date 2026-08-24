export enum CrStatus {
	DRAFT = 'DRAFT',
	SUBMITTED = 'SUBMITTED',
	PENDING_APPROVAL = 'PENDING_APPROVAL',
	COMMITTEE_VOTING = 'COMMITTEE_VOTING',
	COMMITTEE_DECISION = 'COMMITTEE_DECISION',
	APPROVED = 'APPROVED',
	APPLIED = 'APPLIED',
	RETURNED = 'RETURNED',
	REJECTED = 'REJECTED',
	CANCELLED = 'CANCELLED',
}

export enum CrAction {
	SUBMIT = 'SUBMIT',
	SEND_FOR_APPROVAL = 'SEND_FOR_APPROVAL',
	APPROVE = 'APPROVE',
	RETURN = 'RETURN',
	REJECT = 'REJECT',
	APPLY = 'APPLY',
	CANCEL = 'CANCEL',
	CAST_VOTE = 'CAST_VOTE',
	RESOLVE_COMMITTEE = 'RESOLVE_COMMITTEE',
}

/** Terminal statuses are immutable — no further action is permitted. */
export const TERMINAL_STATUSES: ReadonlySet<CrStatus> = new Set([CrStatus.APPLIED, CrStatus.REJECTED, CrStatus.CANCELLED]);

export function isTerminal(status: CrStatus): boolean {
	return TERMINAL_STATUSES.has(status);
}
