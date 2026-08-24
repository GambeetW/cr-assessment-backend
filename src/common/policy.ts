/**
 * Policy-string RBAC + request-user model. Policies are `cr_{action}_{scope}` (see README).
 *
 * The request user carries the org code used for tenant scoping. Read scope (u/w/o) determines
 * which CRs the user may list/see; action policies gate create/update/approve/apply.
 */
export type ReadScope = 'u' | 'w' | 'o';

export interface ReqUser {
	id: string;
	orgCode: string;
	workspaceIds: string[];
	policies: string[]; // e.g. ['cr_c_u', 'cr_r_o', 'cr_a_o']
}

/** True if the user holds the exact policy string. */
export function hasPolicy(user: ReqUser, policy: string): boolean {
	return user.policies.includes(policy);
}

/** The user's highest read scope for CRs, or null if they cannot read CRs at all. */
export function crReadScope(user: ReqUser): ReadScope | null {
	if (hasPolicy(user, 'cr_r_o')) return 'o';
	if (hasPolicy(user, 'cr_r_w')) return 'w';
	if (hasPolicy(user, 'cr_r_u')) return 'u';
	return null;
}
