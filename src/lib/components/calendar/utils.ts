import { formatTimestampForDisplay, getUserTimezone } from '$lib/_helpers/UTCTimezoneUtils';
import type { ClientCompanyLocation } from '$lib/server/database/schemas/client';
import type { RecurrenceDay, Requisition } from '$lib/server/database/schemas/requisition';
import type { Discipline } from '$lib/server/database/schemas/skill';
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
		color: status ? requisitionStatusColorEnum[status] : '#b3b3b3',
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

export function convertBirthdayToEvent(birthday: string, name: string) {
	const today = new Date();
	const currentYear = today.getFullYear();

	// Parse the birthday and set it to the current year
	const birthDate = parseISO(birthday);
	birthDate.setFullYear(currentYear);

	// If the birthday has already passed this year, set it for next year
	if (birthDate < today) {
		birthDate.setFullYear(currentYear + 1);
	}

	return {
		start: birthDate,
		end: birthDate,
		title: name,
		color: '#fbbf24', // A bright color for birthdays
		extendedProps: {
			type: 'BIRTHDAY',
			name
		}
	};
}
