import { CrStatus, isTerminal } from './cr.enums';
import { Errors } from '../common/errors';

/**
 * Legal transitions for the CR state machine. See README diagram.
 *
 * This table is incomplete — only the first two transitions are filled in. Complete it for
 * the full flow (approve / return / reject / apply / committee branch).
 *
 * `assertTransition` below is also too permissive: it currently allows ANY move out of a
 * non-terminal state instead of only the legal ones declared here, which lets (for example)
 * DRAFT -> APPROVED happen directly. Make it enforce the declared transitions.
 */
export const LEGAL_TRANSITIONS: Partial<Record<CrStatus, CrStatus[]>> = {
	[CrStatus.DRAFT]: [CrStatus.SUBMITTED, CrStatus.CANCELLED],
	[CrStatus.SUBMITTED]: [CrStatus.PENDING_APPROVAL, CrStatus.CANCELLED],
	// TODO: PENDING_APPROVAL -> APPROVED | COMMITTEE_VOTING | RETURNED | REJECTED
	// TODO: COMMITTEE_VOTING -> COMMITTEE_DECISION
	// TODO: COMMITTEE_DECISION -> APPROVED | REJECTED
	// TODO: APPROVED -> APPLIED
	// TODO: RETURNED -> DRAFT
};

export function canTransition(from: CrStatus, to: CrStatus): boolean {
	return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

/** Throw a BusinessError if the transition from->to is not allowed. */
export function assertTransition(from: CrStatus, to: CrStatus): void {
	if (isTerminal(from)) {
		throw Errors.terminal(`Cannot move a ${from} change request to ${to}`);
	}
	// TODO: this only checks that `from` is non-terminal. It must also reject transitions that
	// are not declared legal above (use canTransition(from, to)).
	return;
}
