/**
 * Server half of typed confirmation for hard deletes (design doc 03 ›
 * ConfirmDialog). The dialog posts what was typed as `confirm`; an action
 * refuses the delete unless it matches, so a stray or replayed request can't
 * remove anything.
 *
 *   if (!hasTypedConfirmation(formData)) return fail(400, { message: 'Type DELETE to confirm' });
 */
export function hasTypedConfirmation(formData: FormData, word = 'DELETE'): boolean {
	const value = formData.get('confirm');
	return typeof value === 'string' && value.trim() === word;
}
