// ─── MIRRORED FILE ──────────────────────────────────────────────────────────
// Twin: dtss-candidate-app/src/lib/components/availability/availability.ts
// The two repos share one database but no code. Change one, change both.
// Verify:  diff -ru dtss-candidate-app/src/lib/components/availability \
//                   dental-staff-app/src/lib/components/availability
//
// Mirrored set:
//   availability.ts            (this file — ALL logic and ALL copy)
//   availability.test.ts
//   AvailabilityEditor.svelte
//   WeekdayPicker.svelte
//   BlackoutCalendar.svelte
//   BlockRangeDialog.svelte
//
// Every decision lives HERE and the .svelte files are deliberately dumb markup,
// so that drift between the copies is cosmetic rather than behavioural. Date
// handling uses @internationalized/date only — it is ^3.5.0 in both repos, while
// date-fns is v3 in the admin app and v4 in the candidate app.
// ────────────────────────────────────────────────────────────────────────────

import { CalendarDate, DateFormatter, parseDate, today, getLocalTimeZone } from '@internationalized/date';

/** 'YYYY-MM-DD', always exactly 10 characters. A calendar date, never an instant. */
export type ISODate = string;

export type BookedDay = {
	date: ISODate;
	/** e.g. "Req #412 · Dental Assistant" */
	label?: string;
	workdayId?: string;
};

export type AvailabilityState = {
	/** null = never set = available all seven days. */
	availableDays: number[] | null;
	blockedDates: ISODate[];
};

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Two-letter labels, not one. Single letters are ambiguous (two T, two S) and the
 * two-letter row still fits a 375px screen. The full name goes in sr-only text.
 */
export const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
export const DAY_LONG = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

/** The business timezone. "Today" is ET platform-wide, never the device's zone. */
export const BUSINESS_TIMEZONE = 'America/New_York';

/**
 * Today as a calendar date in ET.
 *
 * Deliberately not the device timezone: cron rules, credential expiry and
 * recurrence-day dates are all ET, so a professional in Hawaii must not be able to
 * mark "today" as a day off after the ET day has rolled over.
 */
export function todayInBusinessTz(now: Date = new Date()): ISODate {
	// en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: BUSINESS_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

/** A CalendarDate for use with the shadcn/bits-ui calendar. */
export function toCalendarDate(date: ISODate): CalendarDate {
	return parseDate(date);
}

/** Back to our storage shape. `.toString()` on a CalendarDate is already YYYY-MM-DD. */
export function fromCalendarDate(date: { toString(): string }): ISODate {
	return date.toString();
}

/** NULL becomes all seven days, so the UI renders a concrete state. */
export function normalizeDays(days: number[] | null): number[] {
	if (!Array.isArray(days) || days.length === 0) return [...ALL_DAYS];
	return [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
}

/** Has this professional expressed anything at all? Drives the never-set callout. */
export function isNeverSet(state: AvailabilityState): boolean {
	return state.availableDays === null && state.blockedDates.length === 0;
}

/** Saving zero days is refused — see COPY.week.zeroError for the reason given. */
export function hasZeroDays(days: number[] | null): boolean {
	return Array.isArray(days) && days.length === 0;
}

export function isDirty(a: AvailabilityState, b: AvailabilityState): boolean {
	const daysA = JSON.stringify(normalizeDays(a.availableDays));
	const daysB = JSON.stringify(normalizeDays(b.availableDays));
	if (daysA !== daysB) return true;
	const datesA = JSON.stringify([...new Set(a.blockedDates)].sort());
	const datesB = JSON.stringify([...new Set(b.blockedDates)].sort());
	return datesA !== datesB;
}

/** How many individual edits are pending. Drives "{n} unsaved changes". */
export function countChanges(original: AvailabilityState, current: AvailabilityState): number {
	let n = 0;
	const o = new Set(normalizeDays(original.availableDays));
	const c = new Set(normalizeDays(current.availableDays));
	for (const d of ALL_DAYS) if (o.has(d) !== c.has(d)) n += 1;
	const od = new Set(original.blockedDates);
	const cd = new Set(current.blockedDates);
	for (const d of cd) if (!od.has(d)) n += 1;
	for (const d of od) if (!cd.has(d)) n += 1;
	return n;
}

/**
 * Flatten a range into individual dates.
 *
 * There is no range entity: the database stores one row per date, so modelling
 * ranges in the UI would create a reconciliation problem (what happens when you
 * untap one day in the middle?) for no gain.
 *
 * Past and already-booked days inside the range are skipped and REPORTED, never
 * silently dropped.
 */
export function expandRange(
	start: ISODate,
	end: ISODate,
	opts: { today: ISODate; booked?: ReadonlySet<ISODate> }
): { added: ISODate[]; skippedPast: number; skippedBooked: ISODate[] } {
	if (start > end) return { added: [], skippedPast: 0, skippedBooked: [] };

	const booked = opts.booked ?? new Set<ISODate>();
	const added: ISODate[] = [];
	const skippedBooked: ISODate[] = [];
	let skippedPast = 0;

	let cursor = parseDate(start);
	const last = parseDate(end);
	// Hard stop so a malformed range can never spin: ~11 years of days.
	let guard = 4000;
	while (cursor.compare(last) <= 0 && guard-- > 0) {
		const iso = cursor.toString();
		if (iso < opts.today) skippedPast += 1;
		else if (booked.has(iso)) skippedBooked.push(iso);
		else added.push(iso);
		cursor = cursor.add({ days: 1 });
	}
	return { added, skippedPast, skippedBooked };
}

/** Human summary of the weekly pattern. */
export function weekdaySummary(days: number[] | null): string {
	const normalized = normalizeDays(days);
	if (normalized.length === 7) return COPY.week.summaryAll;
	if (normalized.length === 0) return COPY.week.summaryNone;
	// Mon-Fri and other contiguous runs read better as a range.
	const isRun = normalized.every((d, i) => i === 0 || d === normalized[i - 1] + 1);
	if (isRun && normalized.length > 2) {
		return `${DAY_LONG[normalized[0]].slice(0, 3)}–${DAY_LONG[normalized[normalized.length - 1]].slice(0, 3)}`;
	}
	return normalized.map((d) => DAY_LONG[d].slice(0, 3)).join(', ');
}

/**
 * Day of week for a bare date, as 0 = Sunday … 6 = Saturday.
 *
 * Anchored to UTC midnight and read with getUTCDay(), which is timezone-free. Do
 * NOT use `.toDate(tz).getDay()`: that builds an instant and then reads it back in
 * the RUNTIME's zone, so the answer shifts for anyone whose device is west of the
 * zone you anchored to. Same failure class as `new Date('2026-07-04').getDay()`.
 */
export function dayOfWeek(date: ISODate): number {
	return parseDate(date).toDate('UTC').getUTCDay();
}

/** Upcoming booked days that fall on a weekday the professional is unticking. */
export function bookedConflicts(days: number[] | null, booked: BookedDay[]): BookedDay[] {
	const allowed = new Set(normalizeDays(days));
	if (allowed.size === 7) return [];
	return booked.filter((b) => !allowed.has(dayOfWeek(b.date)));
}

/** Long-form date for prose and aria text, e.g. "Monday, March 9, 2026". */
export function formatLongDate(date: ISODate): string {
	const fmt = new DateFormatter('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: BUSINESS_TIMEZONE
	});
	return fmt.format(parseDate(date).toDate(BUSINESS_TIMEZONE));
}

/** Short-form date for chips and lists, e.g. "Sat Jul 4". */
export function formatShortDate(date: ISODate): string {
	const fmt = new DateFormatter('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: BUSINESS_TIMEZONE
	});
	return fmt.format(parseDate(date).toDate(BUSINESS_TIMEZONE));
}

/** Today as a CalendarDate in the viewer's zone — for the calendar's own `today` marker only. */
export function localToday(): CalendarDate {
	return today(getLocalTimeZone());
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Every user-visible string.
 *
 * The wording carries the whole feature. The premise — blank means available — is
 * counter-intuitive to anyone who has used a scheduling app before, so the copy has
 * to state it plainly and repeatedly, and the never-set state must never read as a
 * problem to fix.
 *
 * `subject` is '' in self mode and the professional's first name in admin mode, so
 * staff see "Days Dana can work" rather than second-person text about someone else.
 */
export const COPY = {
	page: {
		title: 'My availability',
		lead: "You're available by default. We only hide work from you on the days you mark here — if you never touch this page, you'll keep seeing every shift you qualify for."
	},
	neverSet: {
		title: "Nothing set — you're available every day",
		body: "That's fine, and it's the right setting for most people. Only fill this in if there are days you can never work."
	},
	week: {
		legend: (subject = '') => (subject ? `Days ${subject} can work` : 'Days I can work'),
		help: (subject = '') =>
			subject
				? `Untick any day ${subject} never works. Unticked days are hidden from their shift board and left out of new-job texts.`
				: 'Untick any day you never work. Unticked days are hidden from your shift board and left out of new-job texts.',
		summaryAll: 'Available all 7 days',
		summaryNone: 'No days selected',
		zeroError:
			"Pick at least one day you can work. If you need to stop getting shifts altogether, contact support — don't untick every day.",
		zeroErrorCta: 'Contact support',
		bookedConflict: (n: number, dates: string) =>
			`${plural(n, 'There is', 'There are')} ${n} upcoming booked ${plural(n, 'shift', 'shifts')} on ${plural(n, 'a day', 'days')} you just unticked (${dates}). Unticking won't cancel ${plural(n, 'it', 'them')} — cancel from My Shifts if you can't make it.`
	},
	off: {
		heading: 'Days off',
		help: (subject = '') =>
			subject
				? `Tap a date to mark a day ${subject} can't work. Tap it again to undo. Dates you don't mark stay available.`
				: "Tap a date to mark it as a day you can't work. Tap it again to undo. Dates you don't mark stay available.",
		pastNote: "Past dates can't be changed.",
		legendAvailable: 'Available',
		legendOff: 'Marked off',
		legendBooked: 'Already booked',
		bookedTooltip: (subject = '') =>
			subject
				? `${subject} is booked on this day.`
				: "You're booked on this day. If you can't make it, cancel the shift from My Shifts.",
		countZero: 'No days off marked.',
		countN: (n: number) => `${n} ${plural(n, 'day', 'days')} off coming up`,
		clearAll: 'Clear all days off',
		clearAllConfirm: (n: number) =>
			`Remove all ${n} ${plural(n, 'day', 'days')} off? You'll be available every day your weekly pattern allows.`
	},
	range: {
		button: 'Block a date range',
		help: 'Going on vacation? Block a stretch of days at once.',
		title: 'Block a date range',
		body: 'Pick a first and last day. Every day in between is marked as a day off.',
		echo: (start: ISODate, end: ISODate, n: number) =>
			`${formatLongDate(start)} – ${formatLongDate(end)} · ${n} ${plural(n, 'day', 'days')}`,
		confirm: (n: number) => `Block ${n} ${plural(n, 'day', 'days')}`,
		cancel: 'Cancel',
		skippedBooked: (n: number) =>
			`${n} ${plural(n, 'day', 'days')} in this range ${plural(n, 'is', 'are')} already booked and ${plural(n, 'was', 'were')} left alone.`,
		skippedPast: 'Days before today were skipped.'
	},
	save: {
		dirty: (n: number) => `${n} unsaved ${plural(n, 'change', 'changes')}`,
		clean: 'All changes saved',
		discard: 'Discard changes',
		submit: 'Save availability',
		submitting: 'Saving…',
		leaveGuard: 'You have unsaved availability changes. Leave without saving?',
		success: 'Availability saved.',
		successHiding: (n: number) =>
			`Availability saved. ${n} upcoming ${plural(n, 'shift', 'shifts')} ${plural(n, 'is', 'are')} no longer shown to you.`
	},
	adminBanner: (date: string) =>
		`A member of the DTSS team updated your availability on ${date}. If that isn't right, change it below or contact support.`,
	loadError: "We couldn't load your availability just now. Refresh the page and try again.",
	a11y: {
		calendarLabel: (subject = '') => (subject ? `Days ${subject} can't work` : "Days you can't work"),
		marked: (date: ISODate) => `${formatLongDate(date)} marked as a day off`,
		unmarked: (date: ISODate) => `${formatLongDate(date)} is available again`,
		srOff: 'marked as a day off',
		srBooked: "already booked, can't be changed"
	},
	onboarding: {
		title: 'When can you work?',
		desc: "Optional. You're available every day unless you tell us otherwise — this just saves you from getting texts about days you can never work.",
		footnote: 'You can change this any time in Settings → Availability.',
		primary: 'Save and continue',
		skip: "Skip — I'm available every day"
	}
} as const;
