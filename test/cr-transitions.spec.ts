import { assertTransition, canTransition } from '../src/change-requests/cr-state-machine';
import { CrStatus } from '../src/change-requests/cr.enums';

/**
 * One case below fails on purpose because the transition guard allows ANY move out of a
 * non-terminal state instead of only legal ones. The root cause lives in `assertTransition`
 * (complete the transition table as you implement the flow).
 */
describe('CR state machine transitions', () => {
	it('allows the declared legal transition DRAFT -> SUBMITTED', () => {
		expect(() => assertTransition(CrStatus.DRAFT, CrStatus.SUBMITTED)).not.toThrow();
		expect(canTransition(CrStatus.DRAFT, CrStatus.SUBMITTED)).toBe(true);
	});

	it('rejects an illegal transition DRAFT -> APPROVED (must go through approval)', () => {
		// ← FAILS while assertTransition only checks "from is non-terminal".
		expect(() => assertTransition(CrStatus.DRAFT, CrStatus.APPROVED)).toThrow(/ILLEGAL_TRANSITION|illegal|not allowed/i);
	});

	it('rejects any transition out of a terminal state', () => {
		expect(() => assertTransition(CrStatus.APPLIED, CrStatus.APPROVED)).toThrow();
		expect(() => assertTransition(CrStatus.REJECTED, CrStatus.DRAFT)).toThrow();
	});
});
