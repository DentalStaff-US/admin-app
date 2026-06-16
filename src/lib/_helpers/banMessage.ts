// Builds the user-facing message shown when a banned user attempts to sign in:
// reason (if any) + how long the ban lasts + how to appeal.
const SUPPORT_LINE = 'Please contact support if you believe this is a mistake.';

export function formatBanMessage(
	banReason?: string | null,
	banExpires?: Date | string | null
): string {
	let duration: string;
	if (!banExpires) {
		duration = 'permanently';
	} else {
		const expires = banExpires instanceof Date ? banExpires : new Date(banExpires);
		if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
			// No/expired end date → treat as a standing suspension.
			duration = 'permanently';
		} else {
			duration = `until ${expires.toLocaleString('en-US', {
				dateStyle: 'medium',
				timeStyle: 'short'
			})}`;
		}
	}

	const reason = banReason ? ` Reason: ${banReason}.` : '';
	return `Your account has been suspended ${duration}.${reason} ${SUPPORT_LINE}`;
}
