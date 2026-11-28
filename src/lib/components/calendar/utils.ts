import { formatTimestampForDisplay, getUserTimezone } from '$lib/_helpers/UTCTimezoneUtils';
import type { ClientCompanyLocation } from '$lib/server/database/schemas/client';
import type { RecurrenceDay, Requisition } from '$lib/server/database/schemas/requisition';
import type { Discipline } from '$lib/server/database/schemas/skill';
import { statusTone, TONE_HEX } from '$tokens/status';

/**
 * Convert a RecurrenceDay to a calendar event, properly handling UTC timestamps
 * and converting to local timezone for display
 */
export function convertRecurrenceDayToEvent(
	client: any,
	recurrenceDay: RecurrenceDay,
	requisition: Requisition,
	discipline: Discipline,
	location?: ClientCompanyLocation
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
		title: `#${requisition.id} ${discipline.abbreviation.toLocaleUpperCase()} `,
		data: requisition,
		// 03 › Calendar: the one status → tone map, not a local hex map.
		color: TONE_HEX[statusTone(status)].solid,
		extendedProps: {
			type: 'RECURRENCE_DAY',
			requisition: { ...requisition },
			recurrenceDay: { ...recurrenceDay },
			discipline: { ...discipline },
			client: { ...client },
			location: location ? { ...location } : undefined
		},
		styles: ['flex-direction: row-reverse;'],
		className: 'test'
	};
}
