import { json, type RequestHandler } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import {
	getCampaignAudienceBreakdown,
	toCampaignFilters
} from '$lib/server/database/queries/campaigns';

// Recipient preview for the builder. Returns the eligible count, why others were
// excluded (opted out / no contact info), and a small sample — without sending
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
	const sample = breakdown.recipients.slice(0, 10).map((r) => ({
		name: [r.firstName, r.lastName].filter(Boolean).join(' ') || '(no name)',
		to: channel === 'SMS' ? r.phone : r.email
	}));

	return json({
		count: breakdown.eligible,
		total: breakdown.total,
		optedOut: breakdown.optedOut,
		noContact: breakdown.noContact,
		channel,
		sample
	});
};
