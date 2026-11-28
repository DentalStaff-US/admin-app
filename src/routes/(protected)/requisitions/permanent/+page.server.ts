import { redirect } from '@sveltejs/kit';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { readFilters } from '$features/requisitions/requestList';
import { getPermanentPipeline } from '$features/requisitions/server/permanent';
import type { PageServerLoad } from './$types';

/**
 * Admin pipeline (06 › Permanent hiring): one row per permanent request with
 * its stage counts. Admin-only, like every other admin page. There is no single
 * request in the URL, so there is nothing for resolveRequisitionAccess to
 * resolve here; each count links to the request page, which resolves it.
 */
export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (!checkIsAdmin(user.role)) redirect(302, '/requisitions');

	const url = event.url;
	const done = url.searchParams.get('tab') === 'done';
	const view: 'table' | 'board' = url.searchParams.get('view') === 'board' ? 'board' : 'table';
	const filters = readFilters(url);

	const [all, otherTab] = await Promise.all([
		getPermanentPipeline({ done }),
		getPermanentPipeline({ done: !done })
	]);

	const matches = (r: (typeof all)[number]) =>
		(!filters.location.length || filters.location.includes(r.locationId)) &&
		(!filters.discipline.length || filters.discipline.includes(r.disciplineName)) &&
		(!filters.practice.length || filters.practice.includes(r.companyId));

	const tally = (pick: (r: (typeof all)[number]) => [string, string]) => {
		const map = new Map<string, { value: string; label: string; count: number }>();
		for (const r of all) {
			const [value, label] = pick(r);
			const e = map.get(value) ?? { value, label, count: 0 };
			e.count++;
			map.set(value, e);
		}
		return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
	};

	return {
		tab: done ? ('done' as const) : ('active' as const),
		view,
		rows: all.filter(matches),
		tabCounts: {
			active: done ? otherTab.filter(matches).length : all.filter(matches).length,
			done: done ? all.filter(matches).length : otherTab.filter(matches).length
		},
		facets: {
			location: tally((r) => [r.locationId, r.locationName]),
			discipline: tally((r) => [r.disciplineName, r.disciplineName]),
			practice: tally((r) => [r.companyId, r.companyName])
		}
	};
};
