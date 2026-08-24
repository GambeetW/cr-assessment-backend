/**
 * Business-error pattern (mirrors the platform's `isBusinessError` convention): expected,
 * user-facing failures are tagged so the API/UI layer can distinguish them from unexpected 500s.
 * Use these instead of bare `throw new Error(...)`.
 */
export type BusinessErrorCode =
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'ILLEGAL_TRANSITION'
	| 'TERMINAL_STATE'
	| 'INSUFFICIENT_BUDGET'
	| 'VALIDATION'
	| 'CONFLICT';

export class BusinessError extends Error {
	readonly isBusinessError = true;
	constructor(readonly code: BusinessErrorCode, message: string) {
		super(message);
		this.name = 'BusinessError';
	}
}

export const Errors = {
	forbidden: (msg = 'Not allowed') => new BusinessError('FORBIDDEN', msg),
	notFound: (msg = 'Not found') => new BusinessError('NOT_FOUND', msg),
	illegalTransition: (msg: string) => new BusinessError('ILLEGAL_TRANSITION', msg),
	terminal: (msg = 'Change request is in a terminal state') => new BusinessError('TERMINAL_STATE', msg),
	insufficientBudget: (msg = 'Budget balance cannot cover this change') => new BusinessError('INSUFFICIENT_BUDGET', msg),
	validation: (msg: string) => new BusinessError('VALIDATION', msg),
	conflict: (msg = 'Stale version') => new BusinessError('CONFLICT', msg),
};
