// Browser-only draft of the mass notification builder, so a refresh or crash
// doesn't lose an unsent campaign. Scoped per user because admins can share a
// browser. Storage can be unavailable (private mode, quota), so every access is
// guarded and a failure only means the draft isn't kept.

// The recipient selection is deliberately absent: it goes stale as soon as the
// audience changes, and its keys contain contact addresses. A restored draft
// must be previewed again to narrow recipients.
const DRAFT_FIELDS = [
	'name',
	'audience',
	'channel',
	'subject',
	'body',
	'filterName',
	'filterEmail',
	'filterPhone',
	'filterStatus',
	'createdFrom',
	'createdTo',
	'staleOnly',
	'locationLabel',
	'locationLat',
	'locationLon',
	'radiusMiles',
	'disciplineId',
	'experienceLevelId',
	'payRateMin',
	'payRateMax',
	'companyName',
	'paymentType',
	'clientRecipientTarget'
] as const;

type DraftField = (typeof DRAFT_FIELDS)[number];
export type DraftFields = Partial<Record<DraftField, string | number | boolean>>;
export type StoredDraft = { savedAt: number; fields: DraftFields };

// What an untouched form settles on. The schema leaves these unset, then each bound
// select fills in its first option after the page mounts, so seeing one of these
// values doesn't mean anyone edited the form.
const DRAFT_DEFAULTS: DraftFields = {
	audience: 'CANDIDATE',
	channel: 'SMS',
	clientRecipientTarget: 'OWNER'
};

export function draftStorageKey(userId: string) {
	return `dtss:mass-notification-draft:v1:${userId}`;
}

// Keep only fields that differ from an untouched form, so a field that was emptied
// or set back to its default compares equal to one that was never touched. An empty
// result means there is nothing worth saving.
export function pickDraftFields(form: Record<string, unknown>): DraftFields {
	const fields: DraftFields = {};
	for (const field of DRAFT_FIELDS) {
		const value = form[field];
		const filled =
			typeof value === 'string' ? value.trim() !== '' : typeof value === 'number' || value === true;
		if (filled && value !== DRAFT_DEFAULTS[field]) {
			fields[field] = value as string | number | boolean;
		}
	}
	return fields;
}

export function loadDraft(key: string): StoredDraft | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StoredDraft;
		if (typeof parsed?.savedAt !== 'number' || typeof parsed.fields !== 'object') return null;
		// Re-pick so an older or tampered payload can't set anything else on the form.
		const fields = pickDraftFields(parsed.fields ?? {});
		return Object.keys(fields).length ? { savedAt: parsed.savedAt, fields } : null;
	} catch {
		return null;
	}
}

export function saveDraft(key: string, fields: DraftFields, savedAt = Date.now()): boolean {
	try {
		localStorage.setItem(key, JSON.stringify({ savedAt, fields }));
		return true;
	} catch {
		return false;
	}
}

export function clearDraft(key: string) {
	try {
		localStorage.removeItem(key);
	} catch {
		// Nothing to do: an unavailable store has no draft to remove.
	}
}
