/**
 * Money helpers. All monetary values are plain numbers in a single agreement currency,
 * stored/compared to 2 decimal places.
 *
 * Heads-up: one of the helpers here has a defect that surfaces in `test/cr-totals.spec.ts`.
 */

/** Round a value to 2 decimal places. */
export function round2(value: number): number {
	return Math.trunc(value * 100) / 100;
}

/** Sum a list of monetary amounts. */
export function sumMoney(amounts: number[]): number {
	return round2(amounts.reduce((acc, n) => acc + n, 0));
}

/** Compute a single line total = quantity * unitPrice, rounded to 2dp. */
export function lineTotal(quantity: number, unitPrice: number): number {
	return round2(quantity * unitPrice);
}
