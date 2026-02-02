import { formatTimestampForDisplay, getUserTimezone } from '$lib/_helpers/UTCTimezoneUtils';
import type { RecurrenceDay, Requisition } from '$lib/server/database/schemas/requisition';
import { format, parseISO } from 'date-fns';

export function _pad(num: number) {
	const norm = Math.floor(Math.abs(num));
	return (norm < 10 ? '0' : '') + norm;
}

const requisitionStatusColorEnum = {
	PENDING: '#fde047',
	OPEN: '#3b82f6',
	FILLED: '#31c48d',
	UNFULFILLED: '#ff8a4c',
	CANCELED: '#f05252'
} as const;

/**
 * Convert a RecurrenceDay to a calendar event, properly handling UTC timestamps
 * and converting to local timezone for display
 */
export function convertRecurrenceDayToEvent(
	recurrenceDay: RecurrenceDay,
	requisition: Requisition
) {
	const { dayStart, dayEnd, status } = recurrenceDay;

	// Get reference timezone from the requisition
	const timezone = requisition.referenceTimezone || 'America/New_York'; // Default to EST if no timezone is set

	// Convert UTC timestamps to local timezone display times
	// We need to create proper Date objects from the timestamps
	const localDayStart = formatTimestampForDisplay(dayStart, timezone);
	const localDayEnd = formatTimestampForDisplay(dayEnd, timezone);

	// Create event with local time display values
	return {
		start: localDayStart, // Display the local start time
		end: localDayEnd, // Display the local end time
		resourceIds: [requisition.id, recurrenceDay.id],
		title: requisition.title,
		data: requisition,
		color: status ? requisitionStatusColorEnum[status] : '#b3b3b3',
		extendedProps: {
			type: 'RECURRENCE_DAY',
			requisition: { ...requisition },
			recurrenceDay: { ...recurrenceDay }
		}
	};
}
