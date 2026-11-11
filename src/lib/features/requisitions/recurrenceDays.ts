/**
 * Pure helpers for the "Add days" sheet (RecurrenceDaysSheet). Lifted out of
 * the old addRecurrenceDaysDrawer unchanged in behaviour, so the payload the
 * `?/addRecurrenceDays` action receives is byte-for-byte what it was.
 */
import { toUTCDateString } from '$lib/_helpers/UTCTimezoneUtils';

export type DayTimes = {
	dayStartTime: string;
	dayEndTime: string;
	lunchStartTime: string;
	lunchEndTime: string;
};

export type RecurrenceDayEntry = DayTimes & { date: string; requisitionId: number | string };

/** Operating hours keyed by weekday (0 = Sunday), as stored on the location. */
export type OperatingHours = Record<string | number, { isClosed?: boolean } | undefined> | null | undefined;

export const emptyTimes = (): DayTimes => ({
	dayStartTime: '',
	dayEndTime: '',
	lunchStartTime: '',
	lunchEndTime: ''
});

export const DEFAULT_TIMES: DayTimes = {
	dayStartTime: '09:00',
	dayEndTime: '17:00',
	lunchStartTime: '12:00',
	lunchEndTime: '13:00'
};

/** Every calendar day from start to end, inclusive. */
export function getDatesInRange(start: Date, end: Date): Date[] {
	const dates: Date[] = [];
	const current = new Date(start);
	while (current <= end) {
		dates.push(new Date(current));
		current.setDate(current.getDate() + 1);
	}
	return dates;
}

/** Drops days the location is closed. No hours configured = every day is open. */
export function openDates(dates: Date[], operatingHours: OperatingHours): Date[] {
	if (!operatingHours || Object.keys(operatingHours).length === 0) return dates;
	return dates.filter((date) => {
		const day = operatingHours[date.getDay()];
		if (!day) return true;
		return !day.isClosed;
	});
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string) => {
	const [h, m] = t.split(':').map(Number);
	return h * 60 + m;
};

/** "Shift: 8h 30m", or a warning when the end is before the start (an AM/PM slip). */
export function shiftDurationLabel(
	start: string | undefined,
	end: string | undefined
): { text: string; invalid: boolean } | null {
	if (!start || !end || !HHMM_RE.test(start) || !HHMM_RE.test(end)) return null;
	const mins = toMinutes(end) - toMinutes(start);
	if (mins <= 0) return { text: 'Ends before it starts', invalid: true };
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return { text: `Shift: ${h}h${m ? ` ${m}m` : ''}`, invalid: false };
}

/**
 * The `recurrenceDays` field: one object for a single day, an array for
 * several, `null` until every chosen day has a start and end time.
 */
export function buildRecurrenceDaysPayload(input: {
	multipleDays: boolean;
	sameTimeForAll: boolean;
	dates: Date[];
	sharedTimes: DayTimes;
	perDayTimes: Record<string, DayTimes>;
	requisitionId: number | string;
}): RecurrenceDayEntry | RecurrenceDayEntry[] | null {
	const { multipleDays, sameTimeForAll, dates, sharedTimes, perDayTimes, requisitionId } = input;
	const entry = (date: string, times: DayTimes | undefined): RecurrenceDayEntry | null => {
		if (!times?.dayStartTime || !times?.dayEndTime) return null;
		return {
			date,
			dayStartTime: times.dayStartTime,
			dayEndTime: times.dayEndTime,
			lunchStartTime: times.lunchStartTime || '',
			lunchEndTime: times.lunchEndTime || '',
			requisitionId
		};
	};

	if (!multipleDays) {
		const first = dates[0];
		return first ? entry(toUTCDateString(first), sharedTimes) : null;
	}
	const entries = dates
		.map((date) => {
			const key = toUTCDateString(date);
			return entry(key, sameTimeForAll ? sharedTimes : perDayTimes[key]);
		})
		.filter((e): e is RecurrenceDayEntry => e !== null);
	return entries.length > 0 ? entries : null;
}

/**
 * Ready to submit: at least one day has a start and end, and none of the days
 * going out ends before it starts. With per-day times a day left blank is
 * skipped (as the old drawer did), so it's listed as skipped on the review step.
 */
export function payloadReady(payload: RecurrenceDayEntry | RecurrenceDayEntry[] | null): boolean {
	if (!payload) return false;
	const entries = Array.isArray(payload) ? payload : [payload];
	return (
		entries.length > 0 &&
		entries.every((e) => !shiftDurationLabel(e.dayStartTime, e.dayEndTime)?.invalid)
	);
}

/** Chosen days that will be skipped because they have no times (per-day mode). */
export function skippedDates(
	dates: Date[],
	payload: RecurrenceDayEntry | RecurrenceDayEntry[] | null
): string[] {
	const sent = new Set((Array.isArray(payload) ? payload : payload ? [payload] : []).map((e) => e.date));
	return dates.map((d) => toUTCDateString(d)).filter((key) => !sent.has(key));
}

/** Plain-language reason a professional is unavailable on a blocked date. */
export function unavailableReasonLabel(reason: string): string {
	if (reason === 'weekday') return "doesn't work that weekday";
	if (reason === 'booked') return 'already working that day';
	return 'marked the day off';
}
