import { describe, expect, it } from 'vitest';
import { TONE_HEX } from '$tokens/status';
import {
	agendaWeek,
	calendarDimensions,
	clearFiltersHref,
	emptyFilters,
	filterEvents,
	filterHref,
	legendItems,
	readFilters,
	requestHref,
	startOfWeek,
	themeEvents,
	timeRange,
	weekLabel,
	type ShiftEvent
} from './calendar';

function shift(
	id: string,
	start: string,
	end: string,
	status: string,
	opts: { practice?: string; location?: string; discipline?: string; req?: number } = {}
): ShiftEvent {
	return {
		start,
		end,
		title: `#${opts.req ?? 1} RDH`,
		resourceIds: [opts.req ?? 1, id],
		extendedProps: {
			type: 'RECURRENCE_DAY',
			requisition: { id: opts.req ?? 1, referenceTimezone: 'America/New_York' },
			recurrenceDay: { id, status },
			discipline: { id: opts.discipline ?? 'd-rdh', name: opts.discipline === 'd-da' ? 'Dental Assistant' : 'Dental Hygienist' },
			client: { companyName: opts.practice ?? 'Bright Smiles' },
			location: { id: opts.location ?? 'l-tampa', name: opts.location === 'l-brandon' ? 'Brandon' : 'Tampa' }
		}
	};
}

const events = [
	shift('a', '2026-11-12T08:00:00', '2026-11-12T16:30:00', 'OPEN'),
	shift('b', '2026-11-12T07:00:00', '2026-11-12T12:00:00', 'FILLED', { location: 'l-brandon' }),
	shift('c', '2026-11-14T09:00:00', '2026-11-14T17:00:00', 'CANCELED', { practice: 'Harbor Dental', discipline: 'd-da' }),
	shift('d', '2026-11-20T09:00:00', '2026-11-20T17:00:00', 'UNFULFILLED')
];

describe('event colours and legend', () => {
	it('colours each event from the shared tone map, not a local hex map', () => {
		const themed = themeEvents(events);
		expect(themed.map((e) => e.color)).toEqual([
			TONE_HEX.info.solid,
			TONE_HEX.positive.solid,
			TONE_HEX.neutral.solid, // canceled is neutral, not red
			TONE_HEX.warning.solid
		]);
	});

	it('lists every workday status in order, even with no events, plus unexpected ones from the data', () => {
		expect(legendItems([]).map((l) => l.label)).toEqual(['Open', 'Filled', 'Unfulfilled', 'Canceled']);
		const odd = [shift('x', '2026-11-12T08:00:00', '2026-11-12T09:00:00', 'ON_HOLD')];
		expect(legendItems(odd).map((l) => l.status)).toEqual(['OPEN', 'FILLED', 'UNFULFILLED', 'CANCELED', 'ON_HOLD']);
	});
});

describe('filters', () => {
	it('reads repeated params and ignores unknown ones', () => {
		const f = readFilters(new URLSearchParams('status=OPEN&status=FILLED&foo=1'));
		expect(f.status).toEqual(['OPEN', 'FILLED']);
		expect(f.location).toEqual([]);
	});

	it('writes one filter and keeps the rest of the URL', () => {
		const url = new URL('https://x.test/calendar?status=OPEN&view=week');
		expect(filterHref(url, 'location', ['l-tampa', 'l-brandon'])).toBe('/calendar?status=OPEN&view=week&location=l-tampa&location=l-brandon');
		expect(clearFiltersHref(new URL('https://x.test/calendar?status=OPEN&location=a&view=week'))).toBe('/calendar?view=week');
	});

	it('ANDs dimensions and ORs values within one', () => {
		const f = { ...emptyFilters(), status: ['OPEN', 'FILLED'], location: ['l-tampa'] };
		expect(filterEvents(events, f).map((e) => e.extendedProps.recurrenceDay?.id)).toEqual(['a']);
	});

	it('counts options under the other filters and drops dimensions that cannot narrow', () => {
		const dims = calendarDimensions(events, { ...emptyFilters(), location: ['l-tampa'] });
		const status = dims.find((d) => d.key === 'status')!;
		expect(status.options).toEqual([
			{ value: 'OPEN', label: 'Open', count: 1 },
			{ value: 'UNFULFILLED', label: 'Unfulfilled', count: 1 },
			{ value: 'CANCELED', label: 'Canceled', count: 1 }
		]);
		// Location keeps its own options (counted without itself) so it stays changeable.
		expect(dims.find((d) => d.key === 'location')!.options.map((o) => o.count)).toEqual([1, 3]);
		const single = calendarDimensions([events[0], events[3]], emptyFilters());
		expect(single.map((d) => d.key)).toEqual(['status']);
	});
});

describe('agenda', () => {
	it('starts weeks on Sunday', () => {
		expect(startOfWeek(new Date(2026, 10, 12)).getDate()).toBe(8);
	});

	it('groups a week by day, skips empty days and sorts by start time', () => {
		const days = agendaWeek(events, new Date(2026, 10, 10));
		expect(days.map((d) => d.key)).toEqual(['2026-11-12', '2026-11-14']);
		expect(days[0].events.map((e) => e.extendedProps.recurrenceDay?.id)).toEqual(['b', 'a']);
		expect(agendaWeek(events, new Date(2026, 10, 17)).map((d) => d.key)).toEqual(['2026-11-20']);
	});

	it('labels weeks across months and formats times on the wall clock', () => {
		expect(weekLabel(new Date(2026, 10, 12))).toBe('Nov 8 – 14, 2026');
		expect(weekLabel(new Date(2026, 11, 1))).toBe('Nov 29 – Dec 5, 2026');
		expect(timeRange(events[0])).toBe('8:00 AM – 4:30 PM');
	});

	it('links to the request', () => {
		expect(requestHref(events[0])).toBe('/requisitions/1');
	});
});
