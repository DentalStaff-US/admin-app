/**
 * Pure helpers for signature requests: correlating envelopes to our rows and
 * mapping a Documenso template onto a send. No database, no network.
 */
import type { DocumensoEnvelope, PrefillField } from './documensoClient';

const EXTERNAL_ID_PREFIX = 'sigreq:';

export const externalIdFor = (requestId: string) => `${EXTERNAL_ID_PREFIX}${requestId}`;

export function requestIdFromExternalId(externalId: string | null | undefined): string | null {
	if (!externalId?.startsWith(EXTERNAL_ID_PREFIX)) return null;
	const id = externalId.slice(EXTERNAL_ID_PREFIX.length);
	return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export const bySigningOrder = <T extends { signingOrder: number | null; id: number }>(a: T, b: T) =>
	(a.signingOrder ?? Number.MAX_SAFE_INTEGER) - (b.signingOrder ?? Number.MAX_SAFE_INTEGER) ||
	a.id - b.id;

/**
 * PURE: which template recipient is the subject, and which field ids the prefill
 * labels map to. The subject is the FIRST signer by signing order — that is the
 * contract every template in kinds.ts is built to.
 */
export function planTemplateUse(
	template: Pick<DocumensoEnvelope, 'recipients' | 'fields'>,
	prefillValues: Record<string, string>
): { subjectTemplateRecipientId: number; prefillFields: PrefillField[] } {
	const signers = template.recipients.filter((r) => r.role === 'SIGNER').sort(bySigningOrder);
	const subject = signers[0];
	if (!subject) throw new Error('Template has no signer');

	const prefillFields: PrefillField[] = [];
	for (const [label, value] of Object.entries(prefillValues)) {
		const field = template.fields.find(
			(f) => f.fieldMeta?.label?.trim().toLowerCase() === label.trim().toLowerCase()
		);
		if (!field) throw new Error(`Template has no field labelled "${label}"`);
		if (field.type !== 'TEXT') {
			throw new Error(`Template field "${label}" is ${field.type}; only TEXT fields are prefilled`);
		}
		prefillFields.push({ id: field.id, type: 'text', value });
	}
	return { subjectTemplateRecipientId: subject.id, prefillFields };
}
