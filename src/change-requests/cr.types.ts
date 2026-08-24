import { CrStatus } from './cr.enums';

export interface LineItem {
	sku: string;
	quantity: number;
	unitPrice: number;
	lineTotal?: number;
}

export interface PurchaseAgreement {
	id: string;
	orgCode: string;
	vendorOrgCode: string;
	currency: string;
	status: string;
	lineItems: LineItem[];
	total: number;
	budgetId: string;
	endDate: string; // ISO date
}

export interface Budget {
	id: string;
	orgCode: string;
	currency: string;
	allocated: number;
	booked: number;
	spent: number;
	balance: number;
}

export interface ApprovalRecord {
	userId: string;
	action: string;
	at: string;
}

export interface CommitteeVote {
	userId: string;
	decision: 'APPROVE' | 'REJECT';
	at: string;
}

export interface Committee {
	members: string[];
	head: string;
	votes: CommitteeVote[];
	resolvedAt?: string;
}

export interface AuditEntry {
	action: string;
	byUserId: string;
	at: string;
	note?: string;
}

export interface ChangeRequest {
	id: string;
	orgCode: string;
	agreementId: string;
	createdBy: string;
	workspaceId: string;
	type: ('ITEMS' | 'DURATION')[];
	status: CrStatus;
	draftChanges: { lineItems?: LineItem[]; newEndDate?: string };
	totals: { baselineTotal: number; newTotal: number; delta: number };
	approvals: ApprovalRecord[];
	committee?: Committee;
	version: number;
	audit: AuditEntry[];
}

/** Routing config (anonymized analogue values). */
export const COMMITTEE_DELTA_THRESHOLD = 1000;
