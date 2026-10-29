import { describe, it, expect } from 'vitest';
import {
	DENTIST_PLACEHOLDER,
	PRACTICE_PLACEHOLDER,
	scrubPublicDescription,
	truncateTeaser,
	websiteHost
} from './scrub';

const known = {
	companyName: 'Bayshore Smiles Dentistry, PLLC',
	locationName: 'Bayshore Smiles South Tampa',
	streetOne: '1234 W Kennedy Blvd',
	streetTwo: 'Suite 200',
	website: 'https://www.bayshoresmiles.com/careers'
};

describe('websiteHost', () => {
	it('strips protocol, www and path', () => {
		expect(websiteHost('https://www.BayshoreSmiles.com/careers?x=1')).toBe('bayshoresmiles.com');
		expect(websiteHost('bayshoresmiles.com')).toBe('bayshoresmiles.com');
		expect(websiteHost('')).toBeNull();
		expect(websiteHost(null)).toBeNull();
	});
});

describe('scrubPublicDescription', () => {
	it('returns null for empty input', () => {
		expect(scrubPublicDescription(null, known)).toBeNull();
		expect(scrubPublicDescription('', known)).toBeNull();
	});

	it('removes contact details before identity strings', () => {
		const out = scrubPublicDescription(
			'Email jobs@bayshoresmiles.com or call (813) 555-0134 today.',
			known,
			{ maxLength: Infinity }
		)!;
		expect(out).not.toMatch(/bayshore/i);
		expect(out).not.toContain('555-0134');
	});

	it('replaces known identity strings case-insensitively, longest first', () => {
		const out = scrubPublicDescription(
			'Join BAYSHORE SMILES SOUTH TAMPA, part of Bayshore Smiles Dentistry. Visit bayshoresmiles.com. Office at 1234 W Kennedy Blvd, suite 200.',
			known,
			{ maxLength: Infinity }
		)!;
		expect(out).not.toMatch(/bayshore/i);
		expect(out).not.toMatch(/kennedy/i);
		expect(out).not.toMatch(/suite 200/i);
		expect(out).toContain(PRACTICE_PLACEHOLDER);
		// Longest-first: no "the practice South Tampa" fragment left behind.
		expect(out).not.toMatch(/South Tampa/);
	});

	it('also removes the company name without its legal suffix', () => {
		const out = scrubPublicDescription('Bayshore Smiles Dentistry is hiring.', known)!;
		expect(out).toBe(`${PRACTICE_PLACEHOLDER} is hiring.`);
	});

	it('replaces doctor names', () => {
		const out = scrubPublicDescription(
			'Work alongside Dr. Smith and Doctor Jane Patel; dr Lee is on Fridays.',
			{},
			{ maxLength: Infinity }
		)!;
		expect(out).not.toMatch(/Smith|Patel|Lee/);
		expect(out.match(new RegExp(DENTIST_PLACEHOLDER, 'g'))).toHaveLength(3);
	});

	it('escapes regex metacharacters in known strings and skips very short ones', () => {
		const out = scrubPublicDescription(
			'We are A+ Dental (Tampa) and the AB team.',
			{ companyName: 'A+ Dental (Tampa)', locationName: 'AB' },
			{ maxLength: Infinity }
		)!;
		expect(out).toBe(`We are ${PRACTICE_PLACEHOLDER} and the AB team.`);
	});

	it('collapses whitespace and truncates on a word boundary', () => {
		const long = `Great   team.\n\n${'Lovely office with modern equipment '.repeat(20)}`;
		const out = scrubPublicDescription(long, {})!;
		expect(out.startsWith('Great team. Lovely')).toBe(true);
		expect(out.length).toBeLessThanOrEqual(281);
		expect(out.endsWith('…')).toBe(true);
		expect(out).not.toMatch(/\s…$/);
	});
});

describe('truncateTeaser', () => {
	it('leaves short text alone', () => {
		expect(truncateTeaser('short', 280)).toBe('short');
	});
	it('cuts at the last space', () => {
		expect(truncateTeaser('alpha beta gamma delta', 13)).toBe('alpha beta…');
	});
});
