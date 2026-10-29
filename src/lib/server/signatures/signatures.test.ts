import { describe, it, expect } from 'vitest';
import { deriveState, isForward, isOpen } from './status';
import { externalIdFor, planTemplateUse, requestIdFromExternalId } from './planning';
import { verifyDocumensoSecret } from './webhookAuth';
import type { DocumensoEnvelope, DocumensoRecipient } from './documensoClient';

function recipient(over: Partial<DocumensoRecipient> = {}): DocumensoRecipient {
	return {
		id: 10,
		name: 'Jane Owner',
		email: 'jane@practice.test',
		role: 'SIGNER',
		signingOrder: 1,
		token: 't',
		readStatus: 'NOT_OPENED',
		signingStatus: 'NOT_SIGNED',
		sendStatus: 'SENT',
		signedAt: null,
		expired: null,
		expiresAt: null,
		rejectionReason: null,
		...over
	};
}

function envelope(over: Partial<DocumensoEnvelope> = {}): DocumensoEnvelope {
	return {
		id: 'envelope_x',
		type: 'DOCUMENT',
		status: 'PENDING',
		externalId: null,
		title: 'DTSS Client Agreement',
		completedAt: null,
		recipients: [
			recipient(),
			recipient({ id: 11, name: 'Brett Cole', email: 'brett@dtss.test', signingOrder: 2 })
		],
		fields: [],
		envelopeItems: [{ id: 'item_1', title: 'agreement.pdf', order: 1 }],
		...over
	};
}

describe('deriveState', () => {
	it('is SENT until the subject opens it', () => {
		expect(deriveState(envelope(), 10).status).toBe('SENT');
	});

	it('is OPENED once the subject has viewed it', () => {
		const e = envelope({ recipients: [recipient({ readStatus: 'OPENED' })] });
		expect(deriveState(e, 10).status).toBe('OPENED');
	});

	it('waits on the countersigner once the subject has signed', () => {
		const e = envelope({
			recipients: [
				recipient({ readStatus: 'OPENED', signingStatus: 'SIGNED', signedAt: '2026-10-20T15:00:00Z' }),
				recipient({ id: 11, signingOrder: 2 })
			]
		});
		const s = deriveState(e, 10);
		expect(s.status).toBe('AWAITING_COUNTERSIGN');
		expect(s.subjectSignedAt?.toISOString()).toBe('2026-10-20T15:00:00.000Z');
	});

	it('only looks at the SUBJECT, not whichever recipient signed', () => {
		// The countersigner can't sign first in a sequential envelope, but a stored
		// recipient id that matches nobody must not read as "signed".
		const e = envelope({
			recipients: [recipient(), recipient({ id: 11, signingStatus: 'SIGNED', signingOrder: 2 })]
		});
		expect(deriveState(e, 10).status).toBe('SENT');
	});

	it('is COMPLETED when Documenso says so', () => {
		const e = envelope({ status: 'COMPLETED', completedAt: '2026-10-21T12:00:00Z' });
		const s = deriveState(e, 10);
		expect(s.status).toBe('COMPLETED');
		expect(s.completedAt?.toISOString()).toBe('2026-10-21T12:00:00.000Z');
	});

	it('carries the rejection reason', () => {
		const e = envelope({
			status: 'REJECTED',
			recipients: [recipient({ signingStatus: 'REJECTED', rejectionReason: 'Wrong rates' })]
		});
		expect(deriveState(e, 10)).toMatchObject({ status: 'REJECTED', closedReason: 'Wrong rates' });
	});

	it('is EXPIRED when the subject link has lapsed', () => {
		const e = envelope({ recipients: [recipient({ expired: '2026-12-01T00:00:00Z' })] });
		expect(deriveState(e, 10).status).toBe('EXPIRED');
	});

	it('maps CANCELLED', () => {
		expect(deriveState(envelope({ status: 'CANCELLED' }), 10).status).toBe('CANCELLED');
	});
});

describe('isForward', () => {
	it('only moves along the lifecycle', () => {
		expect(isForward('SENT', 'OPENED')).toBe(true);
		expect(isForward('OPENED', 'AWAITING_COUNTERSIGN')).toBe(true);
		expect(isForward('AWAITING_COUNTERSIGN', 'COMPLETED')).toBe(true);
		expect(isForward('OPENED', 'SENT')).toBe(false);
		expect(isForward('OPENED', 'OPENED')).toBe(false);
	});

	it('never leaves a terminal state', () => {
		expect(isForward('COMPLETED', 'OPENED')).toBe(false);
		expect(isForward('COMPLETED', 'CANCELLED')).toBe(false);
		expect(isForward('CANCELLED', 'COMPLETED')).toBe(false);
	});

	it('isOpen matches the signer-actionable states', () => {
		expect(isOpen('AWAITING_COUNTERSIGN')).toBe(true);
		expect(isOpen('COMPLETED')).toBe(false);
		expect(isOpen('FAILED')).toBe(false);
	});
});

describe('planTemplateUse', () => {
	const template = {
		recipients: [
			recipient({ id: 4, name: 'Brett Cole', signingOrder: 2 }),
			recipient({ id: 3, name: 'Client', email: '', signingOrder: 1 })
		],
		fields: [
			{ id: 192, type: 'TEXT', recipientId: 3, envelopeItemId: 'i', fieldMeta: { label: 'Practice Name' } },
			{ id: 5, type: 'SIGNATURE', recipientId: 3, envelopeItemId: 'i', fieldMeta: null },
			{ id: 31, type: 'SIGNATURE', recipientId: 4, envelopeItemId: 'i', fieldMeta: { label: 'Owner sig' } }
		]
	};

	it('picks the first signer by signing order as the subject', () => {
		expect(planTemplateUse(template, {}).subjectTemplateRecipientId).toBe(3);
	});

	it('maps prefill labels to field ids, case-insensitively', () => {
		expect(planTemplateUse(template, { 'practice name': 'Bright Smiles' }).prefillFields).toEqual([
			{ id: 192, type: 'text', value: 'Bright Smiles' }
		]);
	});

	it('refuses to send when a label is missing from the template', () => {
		expect(() => planTemplateUse(template, { 'Practice Address': 'x' })).toThrow(/Practice Address/);
	});

	it('refuses to prefill a non-text field', () => {
		expect(() => planTemplateUse(template, { 'Owner sig': 'x' })).toThrow(/only TEXT/);
	});
});

describe('externalId round trip', () => {
	it('recovers our request id', () => {
		const id = '3f1c2b9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c';
		expect(requestIdFromExternalId(externalIdFor(id))).toBe(id);
	});

	it('ignores envelopes that are not ours', () => {
		expect(requestIdFromExternalId(null)).toBeNull();
		expect(requestIdFromExternalId('pandadoc:123')).toBeNull();
		expect(requestIdFromExternalId("sigreq:1' or 1=1")).toBeNull();
	});
});

describe('verifyDocumensoSecret', () => {
	it('accepts the configured secret', () => {
		expect(verifyDocumensoSecret('s3cret', 's3cret')).toBe(true);
	});

	it('rejects a wrong or missing header', () => {
		expect(verifyDocumensoSecret('nope', 's3cret')).toBe(false);
		expect(verifyDocumensoSecret(null, 's3cret')).toBe(false);
		expect(verifyDocumensoSecret('', 's3cret')).toBe(false);
	});

	it('rejects everything when no secret is configured', () => {
		// Documenso sends an empty header when its webhook has no secret.
		expect(verifyDocumensoSecret('', '')).toBe(false);
		expect(verifyDocumensoSecret('', undefined)).toBe(false);
	});
});
