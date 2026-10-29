/**
 * Free-text scrubbing for the PUBLIC job board.
 *
 * The candidate-side scrub (scrubContactDetails) only removes contactable
 * patterns, because a logged-in professional already sees city + distance and
 * the practice is protected by the claim flow. Anonymous visitors get less: the
 * description is also stripped of every identity string we know about the
 * practice (company name, office name, street, website host) and of
 * "Dr. <Name>" references, then cut down to a teaser.
 */
import { scrubContactDetails } from '$lib/server/privacy/clientIdentity';

export type KnownIdentity = {
	companyName?: string | null;
	locationName?: string | null;
	streetOne?: string | null;
	streetTwo?: string | null;
	/** One website, or several (company + office sites can differ). */
	website?: string | null | (string | null | undefined)[];
};

export const PRACTICE_PLACEHOLDER = 'the practice';
export const DENTIST_PLACEHOLDER = 'the dentist';
export const TEASER_MAX_LENGTH = 280;

const MIN_KNOWN_LENGTH = 3;

// "Smith Family Dental, PLLC" is routinely written as "Smith Family Dental" in
// the description, so the bare form is removed too.
const LEGAL_SUFFIX = /[\s,]+(?:llc|pllc|inc\.?|p\.?c\.?|p\.?a\.?|ltd\.?|dds|dmd|corp\.?)$/i;

// "Dr. Smith", "Dr Jane Smith", "Doctor Patel". Names are capitalised words, so
// the pattern is deliberately case-sensitive on the name part.
const DOCTOR_PATTERN =
	/\b(?:[Dd][Rr]\.?|[Dd]octor)\s+[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2}/g;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "https://www.smithdental.com/about" → "smithdental.com". */
export function websiteHost(website: string | null | undefined): string | null {
	if (!website) return null;
	const host = website
		.trim()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
		.replace(/^www\./i, '')
		.split(/[/?#]/)[0]
		.toLowerCase();
	return host || null;
}

function knownStrings(known: KnownIdentity): string[] {
	const values = new Set<string>();
	const add = (value: string | null | undefined) => {
		const trimmed = value?.trim();
		if (trimmed && trimmed.length >= MIN_KNOWN_LENGTH) values.add(trimmed);
	};

	add(known.companyName);
	add(known.companyName?.trim().replace(LEGAL_SUFFIX, ''));
	add(known.locationName);
	add(known.streetOne);
	add(known.streetTwo);
	const websites = Array.isArray(known.website) ? known.website : [known.website];
	for (const site of websites) add(websiteHost(site));

	// Longest first, so "Smith Family Dental of Tampa" goes before "Smith Family
	// Dental" and doesn't leave "the practice of Tampa" behind.
	return [...values].sort((a, b) => b.length - a.length);
}

/** Cut on a word boundary and mark the cut. */
export function truncateTeaser(text: string, maxLength = TEASER_MAX_LENGTH): string {
	if (text.length <= maxLength) return text;
	const slice = text.slice(0, maxLength);
	const lastSpace = slice.lastIndexOf(' ');
	const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
	return `${cut.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/**
 * Remove contact details and known identity strings from client-authored text.
 * Returns the full scrubbed text when `maxLength` is Infinity (used for the
 * detail endpoint's length hint) and a teaser otherwise.
 */
export function scrubPublicDescription(
	text: string | null | undefined,
	known: KnownIdentity,
	{ maxLength = TEASER_MAX_LENGTH }: { maxLength?: number } = {}
): string | null {
	let out = scrubContactDetails(text);
	if (!out) return null;

	for (const value of knownStrings(known)) {
		out = out.replace(new RegExp(escapeRegExp(value), 'gi'), PRACTICE_PLACEHOLDER);
	}

	out = out.replace(DOCTOR_PATTERN, DENTIST_PLACEHOLDER).replace(/\s+/g, ' ').trim();
	if (!out) return null;

	return Number.isFinite(maxLength) ? truncateTeaser(out, maxLength) : out;
}
