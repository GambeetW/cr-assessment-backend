import { computeTotals } from '../src/change-requests/cr-totals';
import { PurchaseAgreement } from '../src/change-requests/cr.types';

/**
 * One case below fails on purpose because of a money-rounding defect; the root cause lives in
 * `src/common/money.util.ts`.
 *
 * Procurement supports per-unit prices with more than 2 decimals (e.g. metered/commodity items),
 * so line totals must ROUND to the nearest cent, not truncate.
 */
describe('computeTotals', () => {
	const agreement: PurchaseAgreement = {
		id: 'AGR-1',
		orgCode: 'org-alpha',
		vendorOrgCode: 'vendor-x',
		currency: 'USD',
		status: 'ACTIVE',
		budgetId: 'BUD-1',
		endDate: '2026-12-31',
		lineItems: [{ sku: 'A', quantity: 1, unitPrice: 100 }], // baseline 100.00
		total: 100,
	};

	it('computes a clean baseline total', () => {
		const t = computeTotals(agreement, { draftChanges: {} });
		expect(t.baselineTotal).toBe(100);
		expect(t.newTotal).toBe(100);
		expect(t.delta).toBe(0);
	});

	it('rounds fractional line totals to the nearest cent (not truncating)', () => {
		// 3 units @ 6.669 = 20.007 -> must round to 20.01 (truncating yields 20.00).
		const t = computeTotals(agreement, { draftChanges: { lineItems: [{ sku: 'A', quantity: 3, unitPrice: 6.669 }] } });
		expect(t.newTotal).toBe(20.01); // ← FAILS while round2() truncates
		expect(t.delta).toBe(-79.99);
	});
});
