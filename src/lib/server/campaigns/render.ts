// Personalization + light HTML rendering for mass-notification bodies.

/**
 * Replace {{firstName}} / {{lastName}} tokens (case-insensitive, tolerant of
 * inner whitespace). Missing first name falls back to a friendly "there" so a
 * greeting never renders as "Hi ,".
 */
export function renderTokens(
	template: string,
	vars: { firstName?: string | null; lastName?: string | null }
): string {
	const first = vars.firstName?.trim() || 'there';
	const last = vars.lastName?.trim() || '';
	return template
		.replace(/\{\{\s*firstName\s*\}\}/gi, first)
		.replace(/\{\{\s*lastName\s*\}\}/gi, last);
}

export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Turn an admin-typed plain-text body into minimal, safe HTML. */
export function textToHtml(input: string): string {
	return escapeHtml(input).replace(/\r?\n/g, '<br>');
}
