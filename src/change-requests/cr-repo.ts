import { ChangeRequest } from './cr.types';
import { ReqUser } from '../common/policy';

/**
 * Minimal in-memory repository standing in for the Mongoose data layer. In the full scaffold this
 * is backed by MongoDB and an org-scope helper that auto-injects `{ orgCode }` into every query;
 * here, `scoped()` is that helper's in-memory stand-in.
 */
export class CrRepo {
	private store = new Map<string, ChangeRequest>();

	seed(crs: ChangeRequest[]): void {
		for (const cr of crs) this.store.set(cr.id, { ...cr });
	}

	/** The org-scope choke point: filter a candidate set down to the caller's org. */
	private scoped(user: ReqUser, crs: ChangeRequest[]): ChangeRequest[] {
		return crs.filter((cr) => cr.orgCode === user.orgCode);
	}

	list(user: ReqUser): ChangeRequest[] {
		return this.scoped(user, [...this.store.values()]);
	}

	findOne(user: ReqUser, id: string): ChangeRequest | undefined {
		return this.store.get(id);
	}

	save(cr: ChangeRequest): ChangeRequest {
		this.store.set(cr.id, { ...cr });
		return cr;
	}
}
