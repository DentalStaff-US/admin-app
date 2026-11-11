/**
 * DTSS admin dashboard loader (10 §3). The header and the queue are awaited; the
 * coverage board, KPIs, pipeline, receivables and permanent pipeline stream in
 * behind skeletons (10 §7). Every streamed promise resolves (never rejects): a
 * failure is `{ ok: false }` and renders "—".
 */
import { superValidate } from 'sveltekit-superforms/server';
import { adminNewUserSchema, adminRequisitionSchema } from '$lib/config/zod-schemas';
import { getComplianceItems } from '$lib/server/compliance/queries';
import { adminSummaryLine } from '../attention';
import { complianceSection } from '../compliance';
import { nextBusinessDays, parseKpiWindow } from '../window';
import { adminKpis, permPipeline, receivables, shiftPipeline } from './adminMetrics';
import { shiftsOnDays } from './coverage';
import { adminAttention, complianceGroups } from './needsAttention';
import { adminScope } from './scope';
import { settle } from './settle';

export const COVERAGE_DAYS = 7;

export async function loadAdminDashboard(url: URL, role?: string) {
	const scope = adminScope(role);
	const now = new Date();
	const window = parseKpiWindow(url.searchParams.get('window'));
	const coverageDays = nextBusinessDays(COVERAGE_DAYS, now);

	// Streamed: started now, awaited by the page.
	const coverage = settle('coverage', () => shiftsOnDays(scope, coverageDays));
	const kpis = adminKpis(scope, window, now);
	const pipeline = shiftPipeline(scope, window, now);
	const ageing = receivables(scope, now);
	const perm = permPipeline(scope);

	const [compliance, groups, adminForm, newProfessionalForm, newClientForm] = await Promise.all([
		settle('compliance', getComplianceItems),
		adminAttention(scope, now),
		superValidate(adminRequisitionSchema),
		// Two forms, two ids: the Add dialogs no longer share state (10 §2.4).
		superValidate(adminNewUserSchema, { id: 'new-professional' }),
		superValidate(adminNewUserSchema, { id: 'new-client' })
	]);

	const attention = [...complianceGroups(compliance, now), ...groups];

	return {
		audience: 'admin' as const,
		scope,
		attention,
		summary: adminSummaryLine(attention),
		compliance: complianceSection(compliance),
		window,
		coverageDays,
		coverage,
		kpis,
		pipeline,
		receivables: ageing,
		permPipeline: perm,
		adminForm,
		newProfessionalForm,
		newClientForm
	};
}
