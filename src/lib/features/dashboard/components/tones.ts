import type { StatusTone } from '$tokens/status';

/** Solid fills for chart segments and dots (02 › status tones; 10 §6.2). */
export const TONE_SOLID: Record<StatusTone, string> = {
	positive: 'bg-status-positive-solid',
	info: 'bg-status-info-solid',
	pending: 'bg-status-pending-solid',
	warning: 'bg-status-warning-solid',
	negative: 'bg-status-negative-solid',
	neutral: 'bg-status-neutral-solid'
};

/** Small left accent bar on queue rows. */
export const TONE_BORDER: Record<StatusTone, string> = {
	positive: 'border-l-status-positive-solid',
	info: 'border-l-status-info-solid',
	pending: 'border-l-status-pending-solid',
	warning: 'border-l-status-warning-solid',
	negative: 'border-l-status-negative-solid',
	neutral: 'border-l-status-neutral-solid'
};
