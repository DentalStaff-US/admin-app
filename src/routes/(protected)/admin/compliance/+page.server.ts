import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import { logger } from '$lib/server/logger';
import { getComplianceItems } from '$lib/server/compliance/queries';
import {
	COMPLIANCE_SEVERITIES,
	summarizeCompliance,
	type ComplianceSeverity
} from '$lib/server/compliance/complianceRule';
import {
	sendComplianceReminder,
	snoozeComplianceItem,
	unsnoozeComplianceItem,
	type ComplianceActionResult
} from '$lib/server/compliance/actions';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/dashboard');

	const q = event.url.searchParams;
	const severityParam = q.get('severity');
	const severity = (COMPLIANCE_SEVERITIES as readonly string[]).includes(severityParam ?? '')
		? (severityParam as ComplianceSeverity)
		: null;
	const showSnoozed = q.get('snoozed') === '1';

	try {
		const all = await getComplianceItems();
		const items = all.filter(
			(i) => (showSnoozed ? !!i.snoozedUntil : !i.snoozedUntil) && (!severity || i.severity === severity)
		);
		return { items, summary: summarizeCompliance(all, 0), severity, showSnoozed };
	} catch (e) {
		logger.error('compliance: failed to load items', { error: e });
		return {
			items: [],
			summary: summarizeCompliance([], 0),
			severity,
			showSnoozed,
			loadError: 'Could not load compliance data.'
		};
	}
};

function requireAdmin(event: RequestEvent) {
	const user = event.locals.user;
	return user && user.role === USER_ROLES.SUPERADMIN ? user : null;
}

/** Posted from the widget and the page; both send candidateId + ruleKey. */
async function readItem(event: RequestEvent) {
	const form = await event.request.formData();
	return {
		form,
		candidateId: String(form.get('candidateId') ?? '').trim(),
		ruleKey: String(form.get('ruleKey') ?? '').trim()
	};
}

function respond(event: RequestEvent, result: ComplianceActionResult) {
	setFlash({ type: result.ok ? 'success' : 'error', message: result.message }, event);
	return result.ok ? { success: true, message: result.message } : fail(result.status, { error: result.message });
}

export const actions = {
	sendReminder: async (event: RequestEvent) => {
		const user = requireAdmin(event);
		if (!user) return fail(403);
		const { candidateId, ruleKey } = await readItem(event);
		if (!candidateId || !ruleKey) return fail(400, { error: 'Missing item' });
		try {
			return respond(event, await sendComplianceReminder({ candidateId, ruleKey, actorUserId: user.id }));
		} catch (e) {
			logger.error('compliance: reminder failed', { error: e, candidateId, ruleKey });
			return respond(event, { ok: false, status: 500, message: 'Failed to send reminder.' });
		}
	},

	snooze: async (event: RequestEvent) => {
		const user = requireAdmin(event);
		if (!user) return fail(403);
		const { form, candidateId, ruleKey } = await readItem(event);
		if (!candidateId || !ruleKey) return fail(400, { error: 'Missing item' });
		const note = String(form.get('note') ?? '').trim() || null;
		try {
			return respond(
				event,
				await snoozeComplianceItem({
					candidateId,
					ruleKey,
					days: Number(form.get('days')),
					note,
					actorUserId: user.id
				})
			);
		} catch (e) {
			logger.error('compliance: snooze failed', { error: e, candidateId, ruleKey });
			return respond(event, { ok: false, status: 500, message: 'Failed to snooze.' });
		}
	},

	unsnooze: async (event: RequestEvent) => {
		const user = requireAdmin(event);
		if (!user) return fail(403);
		const { candidateId, ruleKey } = await readItem(event);
		if (!candidateId || !ruleKey) return fail(400, { error: 'Missing item' });
		try {
			return respond(event, await unsnoozeComplianceItem({ candidateId, ruleKey, actorUserId: user.id }));
		} catch (e) {
			logger.error('compliance: unsnooze failed', { error: e, candidateId, ruleKey });
			return respond(event, { ok: false, status: 500, message: 'Failed to remove snooze.' });
		}
	}
};
