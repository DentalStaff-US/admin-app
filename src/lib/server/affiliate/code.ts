/**
 * Referral code generation and normalisation. Pure and dependency-free.
 *
 * A referral code is public, permanent, and frequently transcribed by hand or
 * read aloud over the phone — so the alphabet excludes characters that are
 * routinely confused (0/O, 1/I/L, 5/S, 2/Z), and lookup is case-insensitive.
 */

/**
 * Crockford-ish alphabet: A–Z and 2–9 minus the confusable pairs.
 * Excluded: 0 O (round), 1 I L (stroke), 5 S, 2 Z, U (reads as V handwritten).
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTVWXY346789';

export const CODE_LENGTH = 8;

/**
 * Reserved words that must never be issued as a code — they'd collide with
 * routes, look official, or be embarrassing on a marketing asset.
 */
export const RESERVED_CODES = new Set([
	'ADMIN',
	'DTSS',
	'TEST',
	'NULL',
	'NONE',
	'ROOT',
	'HELP',
	'API',
	'WWW',
	'APP',
	'PARTNER',
	'PARTNERS',
	'AFFILIATE',
	'REFERRAL',
	'SIGNUP',
	'LOGIN'
]);

/** Substrings we refuse to emit anywhere inside a generated code. */
const PROFANITY_FRAGMENTS = ['FCK', 'FUK', 'SHT', 'CNT', 'DCK', 'ASS', 'RAPE', 'NGR'];

/**
 * The lookup key for a code. Codes are stored twice: `code` preserves the
 * display casing, `code_normalized` carries the UNIQUE index — so DTSS-SMILE and
 * dtss-smile can never both exist.
 */
export function normalizeCode(code: string): string {
	return code.trim().toUpperCase();
}

export type CodeValidation = { ok: true } | { ok: false; reason: string };

/** Whether a code is acceptable to issue or to accept from a URL. */
export function validateCode(code: string): CodeValidation {
	const normalized = normalizeCode(code);

	if (normalized.length === 0) return { ok: false, reason: 'EMPTY' };
	if (normalized.length < 4) return { ok: false, reason: 'TOO_SHORT' };
	if (normalized.length > 32) return { ok: false, reason: 'TOO_LONG' };
	// Allow hyphens so vanity codes like DTSS-SMILE work, but nothing exotic —
	// this value ends up in URLs, cookies and QR codes.
	if (!/^[A-Z0-9-]+$/.test(normalized)) return { ok: false, reason: 'INVALID_CHARACTERS' };
	if (RESERVED_CODES.has(normalized)) return { ok: false, reason: 'RESERVED' };
	if (containsProfanity(normalized)) return { ok: false, reason: 'PROFANITY' };

	return { ok: true };
}

export function containsProfanity(normalized: string): boolean {
	const stripped = normalized.replace(/-/g, '');
	return PROFANITY_FRAGMENTS.some((f) => stripped.includes(f));
}

/**
 * Generate one candidate code. `randomInt(max)` is injected so tests are
 * deterministic; production passes a crypto-backed source.
 *
 * Callers must still check the result against the DB's unique index — this
 * cannot know what already exists. See `generateUniqueCode`.
 */
export function generateCode(randomInt: (maxExclusive: number) => number): string {
	let out = '';
	for (let i = 0; i < CODE_LENGTH; i++) {
		out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	}
	return out;
}

/**
 * Generate a code that passes validation and is not already taken.
 *
 * `isTaken` is injected (it's the only impure part), so the retry/collision
 * logic itself stays unit-testable. Throws rather than returning a duplicate —
 * with a 26^8 space, exhausting `maxAttempts` means something is badly wrong.
 */
export async function generateUniqueCode(
	randomInt: (maxExclusive: number) => number,
	isTaken: (normalized: string) => Promise<boolean>,
	maxAttempts = 10
): Promise<string> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const code = generateCode(randomInt);
		if (!validateCode(code).ok) continue;
		if (await isTaken(normalizeCode(code))) continue;
		return code;
	}
	throw new Error(`Could not generate a unique referral code after ${maxAttempts} attempts`);
}

/** Crypto-backed random source for production use. */
export function cryptoRandomInt(maxExclusive: number): number {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	// Rejection-free modulo bias is irrelevant at this alphabet size, but keep the
	// distribution honest by discarding the top partial bucket.
	const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
	let v = buf[0];
	while (v >= limit) {
		crypto.getRandomValues(buf);
		v = buf[0];
	}
	return v % maxExclusive;
}
