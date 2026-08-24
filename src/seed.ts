import { ChangeRequest, Budget, PurchaseAgreement } from './change-requests/cr.types';
import { CrStatus } from './change-requests/cr.enums';
import { ReqUser } from './common/policy';

/**
 * Deterministic, anonymized fixtures. Two orgs (org-alpha, org-beta).
 * No real org codes, policies, thresholds, or data.
 */

export const users: Record<string, ReqUser> = {
	// org-alpha
	alice: { id: 'alice', orgCode: 'org-alpha', workspaceIds: ['ws-1'], policies: ['cr_c_u', 'cr_r_u', 'cr_u_u'] },
	mona: { id: 'mona', orgCode: 'org-alpha', workspaceIds: ['ws-1'], policies: ['cr_r_o', 'cr_a_o', 'cr_x_o', 'cr_u_o'] },
	carl: { id: 'carl', orgCode: 'org-alpha', workspaceIds: ['ws-1'], policies: ['cr_r_o', 'cr_a_o'] }, // committee member
	dina: { id: 'dina', orgCode: 'org-alpha', workspaceIds: ['ws-1'], policies: ['cr_r_o', 'cr_a_o'] }, // committee head
	// org-beta
	bob: { id: 'bob', orgCode: 'org-beta', workspaceIds: ['ws-9'], policies: ['cr_r_o', 'cr_a_o', 'cr_x_o'] },
};

export const agreements: PurchaseAgreement[] = [
	{
		id: 'AGR-1',
		orgCode: 'org-alpha',
		vendorOrgCode: 'vendor-x',
		currency: 'USD',
		status: 'ACTIVE',
		budgetId: 'BUD-1',
		endDate: '2026-12-31',
		lineItems: [
			{ sku: 'A', quantity: 10, unitPrice: 500 }, // 5000
			{ sku: 'B', quantity: 30, unitPrice: 100 }, // 3000
		],
		total: 8000,
	},
	{
		id: 'AGR-2',
		orgCode: 'org-beta',
		vendorOrgCode: 'vendor-y',
		currency: 'USD',
		status: 'ACTIVE',
		budgetId: 'BUD-9',
		endDate: '2026-12-31',
		lineItems: [{ sku: 'C', quantity: 5, unitPrice: 200 }],
		total: 1000,
	},
];

export const budgets: Budget[] = [
	{ id: 'BUD-1', orgCode: 'org-alpha', currency: 'USD', allocated: 20000, booked: 8000, spent: 2000, balance: 10000 },
	{ id: 'BUD-LOW', orgCode: 'org-alpha', currency: 'USD', allocated: 100, booked: 0, spent: 0, balance: 100 },
	{ id: 'BUD-9', orgCode: 'org-beta', currency: 'USD', allocated: 5000, booked: 1000, spent: 0, balance: 4000 },
];

const emptyTotals = { baselineTotal: 0, newTotal: 0, delta: 0 };

export const changeRequests: ChangeRequest[] = [
	{
		id: 'CR-DRAFT',
		orgCode: 'org-alpha',
		agreementId: 'AGR-1',
		createdBy: 'alice',
		workspaceId: 'ws-1',
		type: ['ITEMS'],
		status: CrStatus.DRAFT,
		draftChanges: { lineItems: [{ sku: 'A', quantity: 11, unitPrice: 500 }, { sku: 'B', quantity: 30, unitPrice: 100 }] }, // +500
		totals: emptyTotals,
		approvals: [],
		version: 1,
		audit: [],
	},
	{
		id: 'CR-PENDING-SMALL',
		orgCode: 'org-alpha',
		agreementId: 'AGR-1',
		createdBy: 'alice',
		workspaceId: 'ws-1',
		type: ['ITEMS'],
		status: CrStatus.PENDING_APPROVAL,
		draftChanges: { lineItems: [{ sku: 'A', quantity: 11, unitPrice: 500 }, { sku: 'B', quantity: 30, unitPrice: 100 }] }, // +500 (<= threshold)
		totals: { baselineTotal: 8000, newTotal: 8500, delta: 500 },
		approvals: [],
		version: 1,
		audit: [],
	},
	{
		id: 'CR-PENDING-LARGE',
		orgCode: 'org-alpha',
		agreementId: 'AGR-1',
		createdBy: 'alice',
		workspaceId: 'ws-1',
		type: ['ITEMS'],
		status: CrStatus.PENDING_APPROVAL,
		draftChanges: { lineItems: [{ sku: 'A', quantity: 18, unitPrice: 500 }, { sku: 'B', quantity: 30, unitPrice: 100 }] }, // +4000 (> threshold)
		totals: { baselineTotal: 8000, newTotal: 12000, delta: 4000 },
		approvals: [],
		version: 1,
		audit: [],
	},
	{
		id: 'CR-APPLIED',
		orgCode: 'org-alpha',
		agreementId: 'AGR-1',
		createdBy: 'alice',
		workspaceId: 'ws-1',
		type: ['ITEMS'],
		status: CrStatus.APPLIED,
		draftChanges: {},
		totals: { baselineTotal: 8000, newTotal: 8500, delta: 500 },
		approvals: [{ userId: 'mona', action: 'APPROVE', at: '2026-01-01T00:00:00.000Z' }],
		version: 3,
		audit: [],
	},
	{
		id: 'CR-BETA',
		orgCode: 'org-beta',
		agreementId: 'AGR-2',
		createdBy: 'bob',
		workspaceId: 'ws-9',
		type: ['ITEMS'],
		status: CrStatus.PENDING_APPROVAL,
		draftChanges: { lineItems: [{ sku: 'C', quantity: 6, unitPrice: 200 }] },
		totals: { baselineTotal: 1000, newTotal: 1200, delta: 200 },
		approvals: [],
		version: 1,
		audit: [],
	},
];

/** Committee membership for large-delta routing (see `CrService`'s constructor). */
export const committeeConfig = { members: ['carl', 'dina'], head: 'dina' };

export function buildSeed() {
	return {
		users,
		agreements: new Map(agreements.map((a) => [a.id, a])),
		budgets: new Map(budgets.map((b) => [b.id, b])),
		changeRequests,
		committeeConfig,
	};
}
