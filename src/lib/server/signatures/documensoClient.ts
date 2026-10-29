/**
 * Thin typed client for the self-hosted Documenso API (v2).
 *
 * Only the calls this integration makes, typed to the fields it reads. Shapes were
 * taken from the instance's own /api/v2/openapi.json (Documenso v2.21.1); if an
 * upgrade changes them, that file is the reference.
 */
import { env } from '$env/dynamic/private';

export type DocumensoRecipientRole = 'CC' | 'SIGNER' | 'VIEWER' | 'APPROVER' | 'ASSISTANT';

export type DocumensoRecipient = {
	id: number;
	name: string;
	email: string;
	role: DocumensoRecipientRole;
	signingOrder: number | null;
	token: string;
	readStatus: 'NOT_OPENED' | 'OPENED';
	signingStatus: 'NOT_SIGNED' | 'SIGNED' | 'REJECTED';
	sendStatus: 'NOT_SENT' | 'SENT';
	signedAt: string | null;
	expired: string | null;
	expiresAt: string | null;
	rejectionReason: string | null;
};

export type DocumensoField = {
	id: number;
	type: string;
	recipientId: number;
	envelopeItemId: string;
	fieldMeta: { label?: string; type?: string } | null;
};

export type DocumensoEnvelope = {
	id: string;
	type: 'DOCUMENT' | 'TEMPLATE';
	status: 'DRAFT' | 'PENDING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
	externalId: string | null;
	title: string;
	completedAt: string | null;
	recipients: DocumensoRecipient[];
	fields: DocumensoField[];
	envelopeItems: { id: string; title: string; order: number }[];
};

/** A recipient as returned by /envelope/use and /envelope/distribute. */
export type DocumensoSentRecipient = {
	id: number;
	name: string;
	email: string;
	token: string;
	role: DocumensoRecipientRole;
	signingOrder: number;
	signingUrl: string;
};

export type PrefillField = { id: number; type: 'text'; value: string };

export class DocumensoError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: string
	) {
		super(message);
		this.name = 'DocumensoError';
	}
}

function config() {
	const baseUrl = env.DOCUMENSO_API_URL?.replace(/\/+$/, '');
	const apiKey = env.DOCUMENSO_API_KEY;
	if (!baseUrl || !apiKey) {
		throw new Error('Documenso is not configured (DOCUMENSO_API_URL / DOCUMENSO_API_KEY)');
	}
	return { baseUrl, apiKey };
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
	const { baseUrl, apiKey } = config();
	const res = await fetch(`${baseUrl}${path}`, {
		...init,
		headers: { Authorization: apiKey, ...(init.headers ?? {}) },
		signal: init.signal ?? AbortSignal.timeout(30_000)
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new DocumensoError(
			`Documenso ${init.method ?? 'GET'} ${path} failed: ${res.status}`,
			res.status,
			body.slice(0, 2000)
		);
	}
	return res;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await call(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return (await res.json()) as T;
}

export async function getEnvelope(envelopeId: string): Promise<DocumensoEnvelope> {
	const res = await call(`/envelope/${encodeURIComponent(envelopeId)}`);
	return (await res.json()) as DocumensoEnvelope;
}

export type UseTemplateInput = {
	templateId: string;
	externalId: string;
	/** Keyed by the TEMPLATE's recipient id. Recipients left out keep the template's values. */
	recipients: { id: number; email: string; name: string }[];
	prefillFields: PrefillField[];
	title: string;
	redirectUrl?: string;
};

/**
 * Create an envelope from a template and distribute it in one call.
 *
 * Distribution is NONE: Documenso sends no invitations or reminders, and we deliver
 * the signing links ourselves (branded email + SMS, our own nudge series). The
 * only Documenso email left on is the completed-document copy to each signer.
 */
export async function createFromTemplate(
	input: UseTemplateInput
): Promise<{ id: string; recipients: DocumensoSentRecipient[] }> {
	const form = new FormData();
	form.append(
		'payload',
		JSON.stringify({
			envelopeId: input.templateId,
			externalId: input.externalId,
			recipients: input.recipients,
			prefillFields: input.prefillFields,
			distributeDocument: true,
			override: {
				title: input.title,
				distributionMethod: 'NONE',
				...(input.redirectUrl && { redirectUrl: input.redirectUrl }),
				emailSettings: {
					recipientSigningRequest: false,
					recipientRemoved: false,
					recipientSigned: false,
					documentPending: false,
					documentCompleted: true,
					documentDeleted: false,
					ownerDocumentCompleted: false,
					ownerRecipientExpired: false,
					ownerDocumentCreated: false
				}
			}
		})
	);
	const res = await call('/envelope/use', { method: 'POST', body: form });
	return (await res.json()) as { id: string; recipients: DocumensoSentRecipient[] };
}

export async function cancelEnvelope(envelopeId: string, reason?: string): Promise<void> {
	await postJson('/envelope/cancel', { envelopeId, ...(reason && { reason }) });
}

/** The completed PDF (signatures + audit trail) for one envelope item. */
export async function downloadSignedItem(envelopeItemId: string): Promise<Buffer> {
	const res = await call(
		`/envelope/item/${encodeURIComponent(envelopeItemId)}/download?version=signed`
	);
	const type = res.headers.get('content-type') ?? '';
	if (type.includes('application/json')) {
		// Some versions answer with a short-lived download URL instead of the bytes.
		const body = (await res.json()) as { downloadUrl?: string; url?: string };
		const href = body.downloadUrl ?? body.url;
		if (!href) throw new DocumensoError('Documenso download returned no file', 200, JSON.stringify(body));
		const file = await fetch(href, { signal: AbortSignal.timeout(60_000) });
		if (!file.ok) throw new DocumensoError('Documenso file fetch failed', file.status, '');
		return Buffer.from(await file.arrayBuffer());
	}
	return Buffer.from(await res.arrayBuffer());
}
