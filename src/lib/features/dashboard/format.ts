/**
 * Number and time formatting for the dashboards (10 §5 rule 7): whole dollars on
 * tiles, compact from $10k, cents in rows; failures as "—".
 */
import { formatInTimeZone } from 'date-fns-tz';
import type { Metric } from './types';
import { BUSINESS_TIMEZONE, businessDate } from './window';

export const DASH = '—';

const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Tile money: "$9,820", "$48.2k", "$1.3M". */
export function formatMoneyTile(dollars: number): string {
	const abs = Math.abs(dollars);
	const sign = dollars < 0 ? '-' : '';
	if (abs >= 999_950) return `${sign}$${trim(abs / 1_000_000)}M`;
	if (abs >= 10_000) return `${sign}$${trim(abs / 1_000)}k`;
	return whole.format(dollars);
}

/** Row money: "$1,560.00". */
export function formatMoney(dollars: number): string {
	return cents.format(dollars);
}

function trim(n: number): string {
	return n.toFixed(1).replace(/\.0$/, '');
}

export function formatPercent(ratio: number): string {
	return `${Math.round(ratio * 100)}%`;
}

/** "42m", "3h 10m", "2d 4h". */
export function formatDuration(minutes: number): string {
	const m = Math.max(0, Math.round(minutes));
	if (m < 60) return `${m}m`;
	if (m < 24 * 60) {
		const h = Math.floor(m / 60);
		const rest = m % 60;
		return rest ? `${h}h ${rest}m` : `${h}h`;
	}
	const d = Math.floor(m / (24 * 60));
	const h = Math.floor((m % (24 * 60)) / 60);
	return h ? `${d}d ${h}h` : `${d}d`;
}

/** Any metric → its display string; a failed load is "—", never 0. */
export function formatMetric<T>(metric: Metric<T>, format: (value: T) => string): string {
	return metric.ok ? format(metric.value) : DASH;
}

/** Age for queue rows: "<1h", "5h", "3d", "6w". */
export function formatAge(since: Date, now: Date = new Date()): string {
	const minutes = (now.getTime() - new Date(since).getTime()) / 60_000;
	if (minutes < 60) return '<1h';
	const hours = minutes / 60;
	if (hours < 24) return `${Math.floor(hours)}h`;
	const days = hours / 24;
	if (days < 14) return `${Math.floor(days)}d`;
	return `${Math.floor(days / 7)}w`;
}

/** Absolute time for the age tooltip: "Oct 24, 9:12 AM". */
export function formatAbsolute(date: Date, tz = BUSINESS_TIMEZONE): string {
	return formatInTimeZone(new Date(date), tz, 'MMM d, h:mm a');
}

/** "Today", "Tomorrow", else "Thu, Nov 12", in the given timezone. */
export function relativeDay(date: Date, tz = BUSINESS_TIMEZONE, now: Date = new Date()): string {
	const day = formatInTimeZone(new Date(date), tz, 'yyyy-MM-dd');
	const today = formatInTimeZone(now, tz, 'yyyy-MM-dd');
	const tomorrow = formatInTimeZone(new Date(now.getTime() + 86_400_000), tz, 'yyyy-MM-dd');
	if (day === today) return 'Today';
	if (day === tomorrow) return 'Tomorrow';
	return formatInTimeZone(new Date(date), tz, 'EEE, MMM d');
}

/** "7:30 AM–4:00 PM", with the zone abbreviation when it isn't Eastern. */
export function formatTimeRange(start: Date, end: Date, tz = BUSINESS_TIMEZONE): string {
	const f = (d: Date) => formatInTimeZone(new Date(d), tz, 'h:mm a').replace(':00 ', ' ');
	const zone = tz === BUSINESS_TIMEZONE ? '' : ` ${formatInTimeZone(new Date(start), tz, 'zzz')}`;
	return `${f(start)}–${f(end)}${zone}`;
}

/** "Sat, Oct 19" for a 'YYYY-MM-DD' date. */
export function formatDateOnly(date: string, pattern = 'EEE, MMM d'): string {
	return formatInTimeZone(new Date(`${date}T12:00:00Z`), 'UTC', pattern);
}

/** Change vs the previous window, in whole percent; null when there's no base. */
export function percentChange(current: number | null, previous: number | null): number | null {
	if (current === null || previous === null || previous === 0) return null;
	return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/** Days from `date` to `now` in the business timezone (positive = past). */
export function daysPast(date: Date, now: Date = new Date()): number {
	const a = Date.parse(`${businessDate(new Date(date))}T00:00:00Z`);
	const b = Date.parse(`${businessDate(now)}T00:00:00Z`);
	return Math.round((b - a) / 86_400_000);
}

export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** "Maria Chen", or "Unknown". */
export function fullName(first: string | null | undefined, last: string | null | undefined): string {
	return [first, last].map((n) => (n ?? '').trim()).filter(Boolean).join(' ') || 'Unknown';
}

/** The seven days from a week's first date: "Nov 1–7", "Oct 29–Nov 4". */
export function formatWeek(weekBeginDate: string): string {
	const end = new Date(`${weekBeginDate}T12:00:00Z`);
	end.setUTCDate(end.getUTCDate() + 6);
	const endDate = end.toISOString().slice(0, 10);
	const sameMonth = weekBeginDate.slice(0, 7) === endDate.slice(0, 7);
	return `${formatDateOnly(weekBeginDate, 'MMM d')}–${formatDateOnly(endDate, sameMonth ? 'd' : 'MMM d')}`;
}

/** "M. Chen" from first/last name. */
export function shortName(first: string | null | undefined, last: string | null | undefined): string {
	const f = (first ?? '').trim();
	const l = (last ?? '').trim();
	if (f && l) return `${f[0]}. ${l}`;
	return f || l || 'Unknown';
}
