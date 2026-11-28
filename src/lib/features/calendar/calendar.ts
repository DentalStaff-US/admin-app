/**
 * Calendar helpers (03 › Calendar): status → tone → event colour, the legend,
 * client-side filters kept in the URL, and the mobile agenda grouping.
 * Framework-free and tested in calendar.test.ts.
 */
import { statusLabel, statusTone, TONE_HEX, type StatusTone } from '$tokens/status';

/**
 * The shape `convertRecurrenceDayToEvent` produces. `start`/`end` are naive
 * wall-clock strings in the request's timezone ('yyyy-MM-ddTHH:mm:ss'), which
 * the library (and this module) read as local time on purpose.
 */
export type ShiftEvent = {
	start: string | Date;
	end: string | Date;
	title: string;
	resourceIds?: (string | number)[];
	color?: string;
	extendedProps: {
		type?: string;
		requisition?: {
			id: number | string;
			title?: string | null;
			referenceTimezone?: string | null;
			client?: { companyName?: string | null; companyLogo?: string | null } | null;
		};
		recurrenceDay?: { id: string; status?: string | null; dayStart?: string | Date; dayEnd?: string | Date };
		discipline?: { id?: string; name?: string | null; abbreviation?: string | null };
		client?: { id?: string; companyName?: string | null; companyLogo?: string | null } | null;
		location?: { id?: string; name?: string | null } | null;
		[key: string]: unknown;
	};
};

/** Workday statuses, in legend order. */
export const CALENDAR_STATUSES = ['OPEN', 'FILLED', 'UNFULFILLED', 'CANCELED'] as const;

export const eventStatus = (e: ShiftEvent): string | null => e.extendedProps?.recurrenceDay?.status ?? null;

/** Library colour for a status: the tone's solid (white bold text passes 3:1 on every solid). */
export const toneColor = (status: string | null | undefined): string => TONE_HEX[statusTone(status)].solid;

/** Events re-coloured from the shared tone map, whatever the server sent. */
export function themeEvents<E extends ShiftEvent>(events: E[]): E[] {
	return events.map((e) => ({ ...e, color: toneColor(eventStatus(e)) }));
}

export type LegendItem = { status: string; label: string; tone: StatusTone; color: string };

/**
 * The legend: every workday status, plus any unexpected status that's in the
 * data. Always shown, so colour is never the only cue (01 › 3).
 */
export function legendItems(events: ShiftEvent[]): LegendItem[] {
	const inData = new Set(events.map(eventStatus).filter((s): s is string => !!s));
	const statuses = [...CALENDAR_STATUSES, ...[...inData].filter((s) => !(CALENDAR_STATUSES as readonly string[]).includes(s)).sort()];
	return statuses.map((status) => ({ status, label: statusLabel(status), tone: statusTone(status), color: toneColor(status) }));
}

// ── Filters ─────────────────────────────────────────────────────────────────

export const FILTER_KEYS = ['status', 'practice', 'location', 'discipline'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type CalendarFilters = Record<FilterKey, string[]>;

const FILTER_LABELS: Record<FilterKey, string> = {
	status: 'Status',
	practice: 'Practice',
	location: 'Location',
	discipline: 'Discipline'
};

/** The value and label an event has for a filter, or null when it has none. */
function facet(e: ShiftEvent, key: FilterKey): { value: string; label: string } | null {
	const p = e.extendedProps ?? {};
	switch (key) {
		case 'status': {
			const s = eventStatus(e);
			return s ? { value: s, label: statusLabel(s) } : null;
		}
		case 'practice': {
			const name = p.client?.companyName ?? p.requisition?.client?.companyName;
			return name ? { value: name, label: name } : null;
		}
		case 'location': {
			const name = p.location?.name;
			return name ? { value: p.location?.id ?? name, label: name } : null;
		}
		case 'discipline': {
			const name = p.discipline?.name ?? p.discipline?.abbreviation;
			return name ? { value: p.discipline?.id ?? name, label: name } : null;
		}
	}
}

export const emptyFilters = (): CalendarFilters => ({ status: [], practice: [], location: [], discipline: [] });

/** `?status=OPEN&status=FILLED&location=…` → filters. Unknown keys are ignored. */
export function readFilters(params: URLSearchParams): CalendarFilters {
	const filters = emptyFilters();
	for (const key of FILTER_KEYS) filters[key] = params.getAll(key).filter(Boolean);
	return filters;
}

/** The URL with one filter replaced (other params kept). */
export function filterHref(url: URL, key: FilterKey, values: string[]): string {
	const next = new URL(url);
	next.searchParams.delete(key);
	for (const v of values) next.searchParams.append(key, v);
	return `${next.pathname}${next.search}${next.hash}`;
}

/** The URL with every calendar filter removed. */
export function clearFiltersHref(url: URL): string {
	const next = new URL(url);
	for (const key of FILTER_KEYS) next.searchParams.delete(key);
	return `${next.pathname}${next.search}${next.hash}`;
}

export function filterEvents<E extends ShiftEvent>(events: E[], filters: CalendarFilters): E[] {
	return events.filter((e) =>
		FILTER_KEYS.every((key) => {
			const wanted = filters[key];
			if (!wanted.length) return true;
			const f = facet(e, key);
			return !!f && wanted.includes(f.value);
		})
	);
}

export type CalendarFilterDimension = {
	key: FilterKey;
	label: string;
	options: { value: string; label: string; count: number }[];
	selected: string[];
};

/**
 * FilterBar dimensions. Counts are taken under the *other* active filters, so
 * each option says how many shifts picking it would show. A dimension with a
 * single value and nothing selected (e.g. Practice for a practice user) is
 * dropped, since it can't narrow anything.
 */
export function calendarDimensions(events: ShiftEvent[], filters: CalendarFilters): CalendarFilterDimension[] {
	return FILTER_KEYS.map((key) => {
		const others = filterEvents(events, { ...filters, [key]: [] });
		const counts = new Map<string, { label: string; count: number }>();
		for (const e of others) {
			const f = facet(e, key);
			if (!f) continue;
			const entry = counts.get(f.value) ?? { label: f.label, count: 0 };
			entry.count += 1;
			counts.set(f.value, entry);
		}
		let options = [...counts].map(([value, { label, count }]) => ({ value, label, count }));
		options =
			key === 'status'
				? options.sort((a, b) => statusOrder(a.value) - statusOrder(b.value))
				: options.sort((a, b) => a.label.localeCompare(b.label));
		return { key, label: FILTER_LABELS[key], options, selected: filters[key] };
	}).filter((d) => d.options.length > 1 || d.selected.length > 0);
}

function statusOrder(status: string): number {
	const i = (CALENDAR_STATUSES as readonly string[]).indexOf(status);
	return i === -1 ? CALENDAR_STATUSES.length : i;
}

// ── Agenda (mobile) ─────────────────────────────────────────────────────────

/** Naive wall-clock strings are read as local time, matching the library. */
export const toDate = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Sunday 00:00 of the week containing `date` (the library's default first day). */
export function startOfWeek(date: Date): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	d.setDate(d.getDate() - d.getDay());
	return d;
}

export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export type AgendaDay<E> = { key: string; date: Date; events: E[] };

/** The week's days that have shifts, in order, each sorted by start time. */
export function agendaWeek<E extends ShiftEvent>(events: E[], weekStart: Date): AgendaDay<E>[] {
	const start = startOfWeek(weekStart);
	const days: AgendaDay<E>[] = Array.from({ length: 7 }, (_, i) => {
		const date = addDays(start, i);
		return { key: dayKey(date), date, events: [] };
	});
	const byKey = new Map(days.map((d) => [d.key, d]));
	for (const e of events) byKey.get(dayKey(toDate(e.start)))?.events.push(e);
	for (const d of days) d.events.sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime());
	return days.filter((d) => d.events.length > 0);
}

/** "Nov 9 – 15, 2026" or "Nov 30 – Dec 6, 2026". */
export function weekLabel(weekStart: Date): string {
	const start = startOfWeek(weekStart);
	const end = addDays(start, 6);
	const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
	const range =
		start.getMonth() === end.getMonth()
			? `${month(start)} ${start.getDate()} – ${end.getDate()}`
			: `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`;
	return `${range}, ${end.getFullYear()}`;
}

const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** "8:00 AM – 4:30 PM" in the request's own timezone (the event's wall clock). */
export const timeRange = (e: ShiftEvent) => `${time(toDate(e.start))} – ${time(toDate(e.end))}`;

/** Where to open the request a shift belongs to. */
export function requestHref(e: ShiftEvent): string | null {
	const id = e.extendedProps?.requisition?.id ?? e.resourceIds?.[0];
	return id === undefined || id === null ? null : `/requisitions/${id}`;
}
