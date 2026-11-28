/**
 * Loader for the professional detail "Permanent" tab. Call it from the
 * professional page's +page.server.ts load:
 *
 *   permanentActivity: await loadCandidatePermanentTab(event.locals.user, candidateId)
 *
 * and render <CandidatePermanentTab items={data.permanentActivity ?? []} />.
 * Admins only: the items name practices, so anyone else gets null.
 */
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import type { CandidatePermanentItem } from '../candidatePermanent';
import { getCandidatePermanentActivity } from './permanent';

export async function loadCandidatePermanentTab(
	user: { role?: string } | null | undefined,
	candidateId: string
): Promise<CandidatePermanentItem[] | null> {
	if (!checkIsAdmin(user?.role) || !candidateId) return null;
	return getCandidatePermanentActivity(candidateId);
}
