import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time check of the `X-Documenso-Secret` header. Refuses everything when
 * no secret is configured: Documenso sends an empty header when its webhook has no
 * secret, and an unset env var must not turn that into a match.
 */
export function verifyDocumensoSecret(
	provided: string | null | undefined,
	expected: string | null | undefined
): boolean {
	if (!expected || !provided) return false;
	// Hash both sides so the comparison is fixed-length and leaks nothing about
	// the secret's length.
	const a = createHash('sha256').update(provided).digest();
	const b = createHash('sha256').update(expected).digest();
	return timingSafeEqual(a, b);
}
