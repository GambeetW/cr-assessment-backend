import { ChangeRequest, LineItem, PurchaseAgreement } from './cr.types';
import { lineTotal, round2, sumMoney } from '../common/money.util';

/**
 * Compute baseline (current agreement), new (after draftChanges), and delta totals for a CR.
 *
 * Depends on `money.util` — if those helpers round incorrectly, totals/delta will be wrong
 * (this is what `test/cr-totals.spec.ts` exercises). The aggregation logic here is correct;
 * the defect to find lives in the money helper.
 */
export function computeBaselineTotal(agreement: PurchaseAgreement): number {
	return sumMoney(agreement.lineItems.map((li) => lineTotal(li.quantity, li.unitPrice)));
}

export function computeNewTotal(agreement: PurchaseAgreement, draftItems?: LineItem[]): number {
	const items = draftItems && draftItems.length ? draftItems : agreement.lineItems;
	return sumMoney(items.map((li) => lineTotal(li.quantity, li.unitPrice)));
}

export function computeTotals(agreement: PurchaseAgreement, cr: Pick<ChangeRequest, 'draftChanges'>) {
	const baselineTotal = computeBaselineTotal(agreement);
	const newTotal = computeNewTotal(agreement, cr.draftChanges?.lineItems);
	const delta = round2(newTotal - baselineTotal);
	return { baselineTotal, newTotal, delta };
}
