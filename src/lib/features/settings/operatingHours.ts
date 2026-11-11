/**
 * Operating hours as stored on `client_companies.operating_hours` (jsonb,
 * keyed "0".."6" from Sunday) and posted by the company form as a JSON
 * string. The per-day editor reads and writes through these helpers so the
 * stored format stays exactly what the settings form has always written:
 *
 * - a time change stores `HH:MM:00-05` (the fixed offset is legacy; see the
 *   settings report), and
 * - closing a day stores both times as `T00:00:00.000Z`.
 *
 * Rows written by other code paths use plain `HH:MM` (the schema default), so
 * reading accepts any string that contains an `HH:MM`.
 */

export type DayHours = {
	openTime?: string;
	closeTime?: string;
	isClosed?: boolean;
	timezone?: string;
	[key: string]: unknown;
};

export type OperatingHoursMap = Record<string, DayHours>;

export const WEEKDAYS = [
	{ id: '0', name: 'Sunday', short: 'Sun' },
	{ id: '1', name: 'Monday', short: 'Mon' },
	{ id: '2', name: 'Tuesday', short: 'Tue' },
	{ id: '3', name: 'Wednesday', short: 'Wed' },
	{ id: '4', name: 'Thursday', short: 'Thu' },
	{ id: '5', name: 'Friday', short: 'Fri' },
	{ id: '6', name: 'Saturday', short: 'Sat' }
] as const;

export const CLOSED_TIME = 'T00:00:00.000Z';
const STORED_OFFSET = ':00-05';

const blankDay = (): DayHours => ({ openTime: '00:00', closeTime: '00:00', isClosed: false });

/**
 * Parse the form's JSON string. Missing days (or a null/invalid value, which
 * used to crash the page) get the schema default for that day, so every row
 * can render.
 */
export function parseOperatingHours(json: string | null | undefined): OperatingHoursMap {
	let raw: unknown = null;
	try {
		raw = json ? JSON.parse(json) : null;
	} catch {
		raw = null;
	}
	const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const result: OperatingHoursMap = {};
	for (const day of WEEKDAYS) {
		const value = source[day.id];
		result[day.id] = value && typeof value === 'object' ? { ...(value as DayHours) } : blankDay();
	}
	return result;
}

/** `HH:MM` for an `<input type="time">`, from any stored form; '' if none. */
export function toTimeInput(value: string | null | undefined): string {
	const match = typeof value === 'string' ? value.match(/(\d{2}):(\d{2})/) : null;
	return match ? `${match[1]}:${match[2]}` : '';
}

export type DayRow = { id: string; name: string; short: string; open: boolean; openTime: string; closeTime: string };

export function dayRows(hours: OperatingHoursMap): DayRow[] {
	return WEEKDAYS.map((day) => {
		const value = hours[day.id] ?? blankDay();
		return {
			...day,
			open: !value.isClosed,
			openTime: toTimeInput(value.openTime),
			closeTime: toTimeInput(value.closeTime)
		};
	});
}

/** Open or close a day. Closing resets both times, as the form always has. */
export function setDayOpen(hours: OperatingHoursMap, dayId: string, open: boolean): OperatingHoursMap {
	const day = { ...(hours[dayId] ?? blankDay()), isClosed: !open };
	if (!open) {
		day.openTime = CLOSED_TIME;
		day.closeTime = CLOSED_TIME;
	}
	return { ...hours, [dayId]: day };
}

/** Set the opening or closing time from an `HH:MM` input value. */
export function setDayTime(
	hours: OperatingHoursMap,
	dayId: string,
	which: 'openTime' | 'closeTime',
	value: string
): OperatingHoursMap {
	const day = { ...(hours[dayId] ?? blankDay()), [which]: `${value}${STORED_OFFSET}` };
	return { ...hours, [dayId]: day };
}
