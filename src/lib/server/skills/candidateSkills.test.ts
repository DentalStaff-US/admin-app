import { describe, it, expect, vi } from 'vitest';

// The audit writer resolves the SvelteKit request event; nothing here writes.
vi.mock('$lib/server/audit/audit', () => ({ recordAction: vi.fn() }));
import { canEditCandidateSkills } from './candidateSkills';
import { validateSkillCredentialLink } from '$lib/server/certifications/credentialLink';

describe('canEditCandidateSkills (pending = open to all, approved = admin only)', () => {
	const pending = { status: 'PENDING', approved: false };
	const active = { status: 'ACTIVE', approved: true };

	it('lets the professional edit while pending', () => {
		expect(canEditCandidateSkills(pending, 'CANDIDATE')).toEqual({ allowed: true });
	});

	it('locks the professional out once approved', () => {
		expect(canEditCandidateSkills(active, 'CANDIDATE')).toMatchObject({
			allowed: false,
			reason: 'APPROVED'
		});
	});

	it('treats either approval signal as frozen (survives drift)', () => {
		expect(canEditCandidateSkills({ status: 'PENDING', approved: true }, 'CANDIDATE').allowed).toBe(
			false
		);
		expect(canEditCandidateSkills({ status: 'ACTIVE', approved: false }, 'CANDIDATE').allowed).toBe(
			false
		);
	});

	it('always lets a SUPERADMIN edit', () => {
		expect(canEditCandidateSkills(active, 'SUPERADMIN')).toEqual({ allowed: true });
		expect(canEditCandidateSkills(pending, 'SUPERADMIN')).toEqual({ allowed: true });
	});
});

/** Minimal stand-in for the one select chain validateSkillCredentialLink runs. */
function fakeTx(row: { requiresCertificate: boolean; held: string | null } | undefined) {
	const chain = {
		select: () => chain,
		from: () => chain,
		leftJoin: () => chain,
		where: () => chain,
		limit: async () => (row ? [row] : [])
	};
	return chain;
}

describe('validateSkillCredentialLink', () => {
	const base = {
		candidateId: 'cand-1',
		skillId: 'skill-cpr',
		disciplineId: null,
		type: 'CERTIFICATE',
		expiryDate: '2027-01-01'
	};
	const heldCertSkill = fakeTx({ requiresCertificate: true, held: 'skill-cpr' });

	it('is a no-op when no skill is linked', async () => {
		expect(
			await validateSkillCredentialLink({ ...base, skillId: null }, fakeTx(undefined))
		).toEqual({
			ok: true
		});
	});

	it('accepts a dated CERTIFICATE for a held, cert-requiring skill', async () => {
		expect(await validateSkillCredentialLink(base, heldCertSkill)).toEqual({ ok: true });
	});

	it('refuses a document linked to both a discipline and a skill', async () => {
		const r = await validateSkillCredentialLink(
			{ ...base, disciplineId: 'disc-rdh' },
			heldCertSkill
		);
		expect(r).toMatchObject({ ok: false, reason: 'BOTH_LINKS' });
	});

	it('refuses anything but a CERTIFICATE', async () => {
		const r = await validateSkillCredentialLink({ ...base, type: 'LICENSE' }, heldCertSkill);
		expect(r).toMatchObject({ ok: false, reason: 'NOT_A_CERTIFICATE' });
	});

	it('refuses a skill the professional has not claimed', async () => {
		const r = await validateSkillCredentialLink(
			base,
			fakeTx({ requiresCertificate: true, held: null })
		);
		expect(r).toMatchObject({ ok: false, reason: 'NOT_HELD' });
	});

	it('refuses a skill that takes no certificate', async () => {
		const r = await validateSkillCredentialLink(
			base,
			fakeTx({ requiresCertificate: false, held: 'skill-cpr' })
		);
		expect(r).toMatchObject({ ok: false, reason: 'NO_CERT_REQUIRED' });
	});

	it('requires an expiry date', async () => {
		const r = await validateSkillCredentialLink({ ...base, expiryDate: null }, heldCertSkill);
		expect(r).toMatchObject({ ok: false, reason: 'NO_EXPIRY' });
	});
});
