/**
 * Deterministic one-line summary for a public job card. Built only from the
 * already-masked fields (discipline, city/state, experience, open dates), so it
 * can never carry anything the DTO itself doesn't.
 *
 *   "Temporary Dental Hygienist shifts in Tampa, FL · 2-5 years experience preferred · 4 open dates starting Nov 3."
 *   "Permanent Dental Assistant position in Spokane, WA."
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type SummaryInput = {
	permanent: boolean;
	disciplineName: string;
	city: string | null;
	state: string | null;
	experienceLevel: string | null;
	openDateCount?: number;
	firstOpenDate?: string | null;
};

/** "2026-11-03" → "Nov 3". Parsed by hand: no timezone can shift a calendar date. */
export function formatShortDate(isoDate: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
	if (!match) return null;
	const month = MONTHS[Number(match[2]) - 1];
	if (!month) return null;
	return `${month} ${Number(match[3])}`;
}

export function formatPlace(city: string | null, state: string | null): string | null {
	if (city && state) return `${city}, ${state}`;
	return city || state || null;
}

function experiencePhrase(level: string | null): string | null {
	const value = level?.trim();
	if (!value) return null;
	const lower = value.toLowerCase();
	return lower.includes('experience') ? `${lower} preferred` : `${lower} experience preferred`;
}

export function buildPublicJobSummary(input: SummaryInput): string {
	const place = formatPlace(input.city, input.state);
	const where = place ? ` in ${place}` : '';
	const parts = [
		input.permanent
			? `Permanent ${input.disciplineName} position${where}`
			: `Temporary ${input.disciplineName} shifts${where}`
	];

	const experience = experiencePhrase(input.experienceLevel);
	if (experience) parts.push(experience);

	if (!input.permanent && input.openDateCount && input.firstOpenDate) {
		const first = formatShortDate(input.firstOpenDate);
		if (first) {
			parts.push(
				input.openDateCount === 1
					? `1 open date on ${first}`
					: `${input.openDateCount} open dates starting ${first}`
			);
		}
	}

	return `${parts.join(' · ')}.`;
}
