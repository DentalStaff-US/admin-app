/** First message from a superforms error entry (string[], nested object or nothing). */
export function firstError(error: unknown): string | undefined {
	if (typeof error === 'string') return error;
	if (Array.isArray(error)) return typeof error[0] === 'string' ? error[0] : undefined;
	if (error && typeof error === 'object' && '_errors' in error) return firstError((error as { _errors?: unknown })._errors);
	return undefined;
}
