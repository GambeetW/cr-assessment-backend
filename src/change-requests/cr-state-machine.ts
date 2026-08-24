import { CrStatus, isTerminal } from './cr.enums';
import { Errors } from '../common/errors';

/**
 * Legal transitions for the CR state machine. See README diagram.
 *
 * Per the diagram, REJECTED and CANCELLED are reachable from any non-terminal state; the main
 * approval path is DRAFT -> SUBMITTED -> PENDING_APPROVAL -> (APPROVED | COMMITTEE_VOTING ->
 * COMMITTEE_DECISION -> APPROVED/REJECTED) -> APPLIED, with RETURNED -> DRAFT as the edit loop.
 */
export const LEGAL_TRANSITIONS: Partial<Record<CrStatus, CrStatus[]>> = {
	[CrStatus.DRAFT]: [CrStatus.SUBMITTED, CrStatus.REJECTED, CrStatus.CANCELLED],
	[CrStatus.SUBMITTED]: [CrStatus.PENDING_APPROVAL, CrStatus.REJECTED, CrStatus.CANCELLED],
	[CrStatus.PENDING_APPROVAL]: [CrStatus.APPROVED, CrStatus.COMMITTEE_VOTING, CrStatus.RETURNED, CrStatus.REJECTED, CrStatus.CANCELLED],
	[CrStatus.COMMITTEE_VOTING]: [CrStatus.COMMITTEE_DECISION, CrStatus.REJECTED, CrStatus.CANCELLED],
	[CrStatus.COMMITTEE_DECISION]: [CrStatus.APPROVED, CrStatus.REJECTED, CrStatus.CANCELLED],
	[CrStatus.APPROVED]: [CrStatus.APPLIED, CrStatus.REJECTED, CrStatus.CANCELLED],
	[CrStatus.RETURNED]: [CrStatus.DRAFT, CrStatus.REJECTED, CrStatus.CANCELLED],
};

export function canTransition(from: CrStatus, to: CrStatus): boolean {
	return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

/** Throw a BusinessError if the transition from->to is not allowed. */
export function assertTransition(from: CrStatus, to: CrStatus): void {
	if (isTerminal(from)) {
		throw Errors.terminal(`Cannot move a ${from} change request to ${to}`);
	}
	if (!canTransition(from, to)) {
		throw Errors.illegalTransition(`Illegal transition: ${from} -> ${to} is not allowed`);
	}
}
