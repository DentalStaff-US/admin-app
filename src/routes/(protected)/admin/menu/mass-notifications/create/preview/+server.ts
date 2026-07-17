import { json, type RequestHandler } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import {
	getCampaignAudienceBreakdown,
	recipientKey,
	toCampaignFilters
} from '$lib/server/database/queries/campaigns';

// Recipient preview for the builder. Returns the eligible count, why others were
// excluded (opted out / no contact info), and the full deliverable list so the
// admin can select/deselect individuals before queueing — without sending
// anything. SUPERADMIN only.
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || user.role !== USER_ROLES.SUPERADMIN) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const payload = (await request.json()) as Record<string, unknown>;
	const audience = payload.audience === 'CLIENT' ? 'CLIENT' : 'CANDIDATE';
	const channel = payload.channel === 'EMAIL' ? 'EMAIL' : 'SMS';
	const filters = toCampaignFilters(payload);

	const breakdown = await getCampaignAudienceBreakdown(audience, channel, filters);
	const recipients = breakdown.recipients.map((r) => ({
		key: recipientKey(r, channel),
		name: [r.firstName, r.lastName].filter(Boolean).join(' ') || '(no name)',
		to: channel === 'SMS' ? r.phone : r.email
	}));

	return json({
		count: breakdown.eligible,
		total: breakdown.total,
		optedOut: breakdown.optedOut,
		noContact: breakdown.noContact,
		channel,
		recipients
	});
};
