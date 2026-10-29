// Client-safe shapes and labels for e-signature requests. No $lib/server imports.

export type SignatureRequestStatus =
	| 'PENDING'
	| 'SENT'
	| 'OPENED'
	| 'AWAITING_COUNTERSIGN'
	| 'COMPLETED'
	| 'REJECTED'
	| 'CANCELLED'
	| 'EXPIRED'
	| 'FAILED';

export type SignatureRequestView = {
	id: string;
	kind: string;
	title: string;
	status: SignatureRequestStatus;
	open: boolean;
	recipientName: string;
	recipientEmail: string;
	sentAt: Date | null;
	subjectSignedAt: Date | null;
	completedAt: Date | null;
	closedAt: Date | null;
	closedReason: string | null;
	nudgesExhaustedAt: Date | null;
	/** Only present when the viewer may sign right now. */
	signingUrl: string | null;
	countersignerNames: string[];
	clientDocumentUploadId: string | null;
	/** Admins only. */
	documensoEnvelopeId: string | null;
};

type Tone = 'default' | 'secondary' | 'destructive' | 'outline';

/** Label + badge variant per status, for the client and admin panels. */
export const SIGNATURE_STATUS_DISPLAY: Record<
	SignatureRequestStatus,
	{ client: string; admin: string; tone: Tone }
> = {
	PENDING: { client: 'Preparing', admin: 'Sending…', tone: 'outline' },
	SENT: { client: 'Awaiting your signature', admin: 'Sent — not opened', tone: 'secondary' },
	OPENED: { client: 'Awaiting your signature', admin: 'Opened — not signed', tone: 'secondary' },
	AWAITING_COUNTERSIGN: {
		client: 'Signed — awaiting countersignature',
		admin: 'Waiting on DTSS countersignature',
		tone: 'outline'
	},
	COMPLETED: { client: 'Signed', admin: 'Completed', tone: 'default' },
	REJECTED: { client: 'Declined', admin: 'Declined by client', tone: 'destructive' },
	CANCELLED: { client: 'Cancelled', admin: 'Cancelled', tone: 'outline' },
	EXPIRED: { client: 'Link expired', admin: 'Link expired', tone: 'destructive' },
	FAILED: { client: 'Not sent', admin: 'Failed to send', tone: 'destructive' }
};

export const clientDocumentDownloadUrl = (documentId: string) =>
	`/api/client-documents/${documentId}/download`;
