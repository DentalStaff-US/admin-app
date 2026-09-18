import { describe, it, expect } from 'vitest';
import {
	normalizeCode,
	validateCode,
	generateCode,
	generateUniqueCode,
	containsProfanity,
	CODE_ALPHABET,
	CODE_LENGTH
} from '$lib/server/affiliate/code';

/** Deterministic cycling "random" source. */
function seq(values: number[]) {
	let i = 0;
	return () => values[i++ % values.length];
}

describe('normalizeCode', () => {
	it('upper-cases and trims so lookups are case-insensitive', () => {
		expect(normalizeCode('  dtss-smile ')).toBe('DTSS-SMILE');
	});

	it('collapses casing variants onto one key', () => {
		expect(normalizeCode('DtSs-SmIlE')).toBe(normalizeCode('dtss-smile'));
	});
});

describe('CODE_ALPHABET', () => {
	it('excludes visually confusable characters', () => {
		for (const ch of ['0', 'O', '1', 'I', 'L', '5', 'S', '2', 'Z', 'U']) {
			expect(CODE_ALPHABET).not.toContain(ch);
		}
	});

	it('has no duplicate characters', () => {
		expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
	});
});

describe('validateCode', () => {
	it('accepts a generated-shape code', () => {
		expect(validateCode('ABCD2345')).toEqual({ ok: true });
	});

	it('accepts a hyphenated vanity code', () => {
		expect(validateCode('DTSS-SMILE')).toEqual({ ok: true });
	});

	it('accepts regardless of input casing', () => {
		expect(validateCode('abcd2345').ok).toBe(true);
	});

	it('rejects empty and whitespace', () => {
		expect(validateCode('')).toMatchObject({ ok: false, reason: 'EMPTY' });
		expect(validateCode('   ')).toMatchObject({ ok: false, reason: 'EMPTY' });
	});

	it('rejects codes that are too short to be unguessable', () => {
		expect(validateCode('ABC')).toMatchObject({ ok: false, reason: 'TOO_SHORT' });
	});

	it('rejects absurdly long input rather than storing it', () => {
		expect(validateCode('A'.repeat(33))).toMatchObject({ ok: false, reason: 'TOO_LONG' });
	});

	it('rejects characters that would break a URL, cookie or QR payload', () => {
		for (const bad of ['ABCD 234', 'ABCD/234', 'ABCD?234', 'ABCD|234', 'ABCD@234']) {
			expect(validateCode(bad)).toMatchObject({ ok: false, reason: 'INVALID_CHARACTERS' });
		}
	});

	it('rejects reserved words that collide with routes or look official', () => {
		for (const word of ['ADMIN', 'admin', 'DTSS', 'PARTNER', 'AFFILIATE', 'LOGIN']) {
			expect(validateCode(word)).toMatchObject({ ok: false, reason: 'RESERVED' });
		}
	});

	it('rejects profanity', () => {
		expect(validateCode('BADFCKER')).toMatchObject({ ok: false, reason: 'PROFANITY' });
	});
});

describe('containsProfanity', () => {
	it('sees through hyphens used to split a fragment', () => {
		expect(containsProfanity('FC-KER')).toBe(true);
	});

	it('does not fire on clean codes', () => {
		expect(containsProfanity('ABCD2345')).toBe(false);
	});
});

describe('generateCode', () => {
	it('produces a code of the configured length', () => {
		expect(generateCode(() => 0)).toHaveLength(CODE_LENGTH);
	});

	it('draws only from the safe alphabet', () => {
		const code = generateCode(seq([0, 5, 10, 15, 20, 25, 3, 7]));
		for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
	});

	it('is deterministic for a deterministic source', () => {
		expect(generateCode(seq([1, 2, 3]))).toBe(generateCode(seq([1, 2, 3])));
	});

	it('always produces a code that passes validation', () => {
		for (let i = 0; i < 200; i++) {
			const code = generateCode(() => Math.floor(Math.random() * CODE_ALPHABET.length));
			const result = validateCode(code);
			// Profanity is the one legitimate rejection; generateUniqueCode retries on it.
			if (!result.ok) expect(result.reason).toBe('PROFANITY');
		}
	});
});

describe('generateUniqueCode', () => {
	it('returns the first code that is free', async () => {
		const code = await generateUniqueCode(seq([0]), async () => false);
		expect(code).toBe('A'.repeat(CODE_LENGTH));
	});

	it('retries past a collision', async () => {
		let calls = 0;
		const code = await generateUniqueCode(
			seq([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]),
			async () => {
				calls++;
				return calls === 1; // first candidate taken, second free
			}
		);
		expect(code).toBe('B'.repeat(CODE_LENGTH));
	});

	it('throws rather than returning a duplicate when it cannot find a free code', async () => {
		await expect(generateUniqueCode(seq([0]), async () => true, 3)).rejects.toThrow(
			/could not generate a unique referral code/i
		);
	});
});
