/**
 * The registry of documents we send for e-signature.
 *
 * Adding a document:
 *   1. Build its template in Documenso. The subject (client / professional) must be
 *      the template's FIRST signer; anyone after them is a countersigner.
 *   2. Put the template id in an env var.
 *   3. Add an entry here.
 *   4. Call `requestSignature({ kind, subjectId })` from the action that needs it.
 *
 * Nothing else changes: sending, webhooks, nudges, filing and the settings/admin
 * panels all work off this definition.
 *
 * Full walkthrough: docs/E-SIGNATURES.md
 */
import { env } from '$env/dynamic/private';
import { BASE_URL } from '$env/static/private';
import { format } from 'date-fns';
import { getClientProfileById, uploadClientDocument } from '$lib/server/database/queries/clients';
import { storageUrlForKey } from '$lib/server/uploads';
import type { SignatureRequest } from '$lib/server/database/schemas/signature';

export type SignatureSubject = {
	userId: string;
	email: string;
	/** The person signing. */
	name: string;
	firstName: string | null;
	phone: string | null;
	receiveSms: boolean;
	blacklisted?: boolean;
	/** The organisation the document is for, e.g. the practice name. */
	displayName: string;
	clientId?: string;
	/** False = don't chase (e.g. the client was denied or deactivated). */
	nudgeable: boolean;
};

export type SignatureCompletion = {
	request: SignatureRequest;
	fileKey: string;
	filename: string;
};

export type SignatureKindDefinition = {
	kind: string;
	subjectType: 'CLIENT';
	/** What people see: email subjects, settings, the admin panel. */
	title: string;
	templateId: () => string | undefined;
	resolveSubject: (subjectId: string) => Promise<SignatureSubject | null>;
	/**
	 * Values for the template's fill-in fields, keyed by the field LABEL set in
	 * Documenso. Labels are matched case-insensitively. A label that does not exist
	 * on the template fails the send rather than delivering a blank document.
	 */
	prefill: (subject: SignatureSubject) => Record<string, string>;
	/** Where the subject finds the document in our app. */
	portalUrl: () => string;
	/** File the signed copy wherever this document belongs. */
	onCompleted: (ctx: SignatureCompletion) => Promise<{ clientDocumentUploadId?: string }>;
};

async function resolveClientSubject(clientId: string): Promise<SignatureSubject | null> {
	const result = await getClientProfileById(clientId);
	if (!result?.profile || !result.user?.email) return null;
	const name = `${result.user.firstName ?? ''} ${result.user.lastName ?? ''}`.trim();
	return {
		userId: result.user.id,
		email: result.user.email,
		name: name || result.user.email,
		firstName: result.user.firstName ?? null,
		phone: result.profile.cellPhone ?? null,
		receiveSms: result.user.receiveSms ?? false,
		displayName: (result.company?.companyName as string | null) || name || 'Your practice',
		clientId,
		nudgeable: result.profile.status !== 'DENIED' && result.profile.status !== 'INACTIVE'
	};
}

const CLIENT_AGREEMENT: SignatureKindDefinition = {
	kind: 'CLIENT_AGREEMENT',
	subjectType: 'CLIENT',
	title: 'DTSS Client Agreement',
	templateId: () => env.DOCUMENSO_TEMPLATE_CLIENT_AGREEMENT,
	resolveSubject: resolveClientSubject,
	prefill: (subject) => ({ 'Practice Name': subject.displayName }),
	portalUrl: () => `${BASE_URL}/settings?tab=DOCUMENTS&role=CLIENT`,
	onCompleted: async ({ request, fileKey, filename }) => {
		if (!request.clientId) return {};
		// adminOnly = locked: the client can download it but not delete it.
		const doc = await uploadClientDocument({
			clientId: request.clientId,
			uploadUrl: storageUrlForKey(fileKey),
			filename,
			type: 'AGREEMENT',
			adminOnly: true
		});
		return { clientDocumentUploadId: doc.id };
	}
};

const KINDS: Record<string, SignatureKindDefinition> = {
	[CLIENT_AGREEMENT.kind]: CLIENT_AGREEMENT
};

export const SIGNATURE_KINDS = Object.keys(KINDS);

/** For pickers: every kind sent to this type of subject. */
export function listSignatureKinds(subjectType: SignatureKindDefinition['subjectType']) {
	return Object.values(KINDS)
		.filter((k) => k.subjectType === subjectType)
		.map((k) => ({ kind: k.kind, title: k.title }));
}

export function getSignatureKind(kind: string): SignatureKindDefinition {
	const def = KINDS[kind];
	if (!def) throw new Error(`Unknown signature kind: ${kind}`);
	return def;
}

export function signedFilename(def: SignatureKindDefinition, subject: { displayName: string }, at: Date) {
	const safe = subject.displayName.replace(/[^\w .,'()-]+/g, '').trim() || 'Document';
	return `${def.title} - ${safe} - signed ${format(at, 'yyyy-MM-dd')}.pdf`;
}
