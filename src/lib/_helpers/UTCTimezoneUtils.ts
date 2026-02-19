/**
 * UTCTimezoneUtils.ts - Corrected utility functions using date-fns-tz
 * Using the actual function names from the date-fns-tz documentation
 */
import { format, parse, isValid, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * Get user's current timezone from browser
 * @returns Timezone string (e.g., 'America/New_York')
 */
export function getUserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Format a timezone string for display
 * @param timezone IANA timezone string
 * @returns Human-readable timezone name
 */
export function formatTimezoneName(timezone: string): string {
	if (!timezone) return '';

	// Format for display (e.g., "America/New_York" -> "New York")
	const parts = timezone.split('/');
	const location = parts.length > 1 ? parts[parts.length - 1] : parts[0];
	return location.replace(/_/g, ' ');
}

/**
 * Gets a consistent UTC date string
 */
export function toUTCDateString(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toISOString().split('T')[0];
}

/**
 * Convert local time to UTC time
 *
 * @param timeString Local time string (HH:MM or HH:MM:SS)
 * @param dateString Date string (YYYY-MM-DD)
 * @param timezone Local timezone
 * @returns UTC time string (HH:MM)
 */
export function localTimeToUTC(timeString: string, dateString: string, timezone: string): string {
	if (!timeString || !dateString || !timezone) {
		return timeString;
	}

	try {
		// Create date in local timezone
		const localDate = parse(`${dateString} ${timeString}`, 'yyyy-MM-dd HH:mm', new Date());

		if (!isValid(localDate)) {
			return timeString;
		}

		// Convert to UTC
		const utcDate = fromZonedTime(localDate, timezone);

		// Format time in HH:MM
		return format(utcDate, 'HH:mm');
	} catch (error) {
		console.error('Error converting to UTC:', error);
		return timeString;
	}
}

/**
 * Convert UTC time to local time
 *
 * @param utcTimeString UTC time string (HH:MM or HH:MM:SS)
 * @param utcDateString UTC date string (YYYY-MM-DD)
 * @param timezone Target timezone
 * @returns Local time string (HH:MM)
 */
export function utcToLocalTime(
	utcTimeString: string,
	utcDateString: string,
	timezone: string
): string {
	if (!utcTimeString || !utcDateString || !timezone) {
		return utcTimeString;
	}

	try {
		// Create UTC date
		const utcDate = parse(`${utcDateString} ${utcTimeString}`, 'yyyy-MM-dd HH:mm', new Date());

		if (!isValid(utcDate)) {
			console.warn('Invalid UTC date:', utcDateString, utcTimeString);
			return utcTimeString;
		}

		// Convert to target timezone
		const localDate = toZonedTime(utcDate, timezone);

		// Format time in HH:MM
		return format(localDate, 'HH:mm');
	} catch (error) {
		console.error('Error converting from UTC:', error);
		return utcTimeString;
	}
}

/**
 * Format time for display
 *
 * @param timeString Time string (HH:MM)
 * @param format12Hour Whether to use 12-hour format
 * @returns Formatted time string
 */
export function formatTimeForDisplay(timeString: string, format12Hour: boolean = true): string {
	if (!timeString) return '';

	try {
		// Parse time
		const [hours, minutes] = timeString.split(':').map(Number);

		// Create a date object with today's date and the specified time
		const date = new Date();
		date.setHours(hours, minutes, 0, 0);

		// Format according to preference
		return format(date, format12Hour ? 'h:mm a' : 'HH:mm');
	} catch (error) {
		return timeString;
	}
}

/**
 * Get week start date (Sunday) for a given date in UTC
 *
 * @param dateString UTC date string (YYYY-MM-DD)
 * @returns Sunday date string (YYYY-MM-DD) in UTC
 */
export function getUTCWeekStartDate(dateString: string): string {
	if (!dateString) return '';

	try {
		// Parse date as UTC
		const date = parse(dateString, 'yyyy-MM-dd', new Date());

		if (!isValid(date)) {
			return dateString;
		}

		// Get day of week in UTC (0 = Sunday, 1 = Monday, etc.)
		const dayOfWeek = date.getUTCDay();

		// Subtract days to get to Sunday
		const sunday = new Date(date);
		sunday.setUTCDate(date.getUTCDate() - dayOfWeek);

		// Format as YYYY-MM-DD
		return format(sunday, 'yyyy-MM-dd');
	} catch (error) {
		console.error('Error getting UTC week start date:', error);
		return dateString;
	}
}

/**
 * Format a date for display in user's timezone
 *
 * @param utcDateString UTC date string (YYYY-MM-DD)
 * @param targetTimezone Target timezone (default: user's timezone)
 * @param formatStr Format string for date-fns
 * @returns Formatted date string
 */
export function formatUTCDateForDisplay(
	utcDateString: string,
	targetTimezone: string = getUserTimezone(),
	formatStr: string = 'MMM d, yyyy'
): string {
	if (!utcDateString) return '';

	try {
		// Use formatInTimeZone for direct formatting
		return formatInTimeZone(utcDateString, targetTimezone, formatStr);
	} catch (error) {
		console.error('Error formatting UTC date:', error);
		return utcDateString;
	}
}

/**
 * Process timesheet entries with timezone conversion
 *
 * @param entries Timesheet entries with UTC times
 * @param targetTimezone Timezone to convert to (default: user's timezone)
 * @returns Processed entries with converted times and calculated hours
 */
export function processUTCTimesheetEntries(
	entries: Array<{
		date: string; // UTC date
		startTime: string; // UTC time
		endTime: string; // UTC time
		[key: string]: any;
	}>,
	targetTimezone: string = getUserTimezone()
): Array<{
	date: string;
	startTime: string;
	endTime: string;
	localDate: string;
	localStartTime: string;
	localEndTime: string;
	displayStartTime: string;
	displayEndTime: string;
	hours: number;
	[key: string]: any;
}> {
	if (!entries || !Array.isArray(entries)) return [];

	return entries.map((entry) => {
		// Convert UTC times to local timezone
		const localStartTime = utcToLocalTime(entry.startTime, entry.date, targetTimezone);
		const localEndTime = utcToLocalTime(entry.endTime, entry.date, targetTimezone);

		// Format local date
		const localDate = formatInTimeZone(entry.date, targetTimezone, 'yyyy-MM-dd');

		// Calculate hours based on UTC times
		const hours = calculateHours(entry.startTime, entry.endTime);

		// Format for display
		const displayStartTime = formatTimeForDisplay(localStartTime);
		const displayEndTime = formatTimeForDisplay(localEndTime);

		return {
			...entry,
			localDate,
			localStartTime,
			localEndTime,
			displayStartTime,
			displayEndTime,
			hours
		};
	});
}

/**
 * Create UTC ISO 8601 date-time string
 *
 * @param localDateString Date string (YYYY-MM-DD) in local timezone
 * @param localTimeString Time string (HH:MM) in local timezone
 * @param localTimezone Source timezone
 * @returns UTC ISO string
 */
export function createUTCISOString(
	localDateString: string,
	localTimeString: string,
	localTimezone: string
): string {
	if (!localDateString || !localTimeString || !localTimezone) {
		throw new Error('Missing required parameters for createUTCISOString');
	}

	try {
		// Parse local date and time
		const localDate = parse(
			`${localDateString} ${localTimeString}`,
			'yyyy-MM-dd HH:mm',
			new Date()
		);

		if (!isValid(localDate)) {
			throw new Error('Invalid date/time values');
		}

		// Convert to UTC - fromZonedTime treats the input as being IN the specified timezone
		const utcDate = fromZonedTime(localDate, localTimezone);

		// Return ISO string
		return utcDate.toISOString();
	} catch (error) {
		console.error('Error creating UTC ISO string:', error);
		throw error;
	}
}

/**
 * Validate that a time string is in valid UTC time format (HH:MM)
 */
export function isValidUTCTime(time: string): boolean {
	if (!time) return false;

	// Check format
	if (!/^\d{2}:\d{2}$/.test(time)) return false;

	// Parse hours and minutes
	const [hours, minutes] = time.split(':').map(Number);

	// Validate range
	return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

/**
 * Convert a single recurrence day from form data to UTC format for database storage
 *
 * @param day The recurrence day data from the form
 * @param userTimezone The user's timezone
 * @returns Converted data ready for database storage with timestamp fields
 */
export function convertRecurrenceDayToUTC(day: Record<string, any>, userTimezone: string) {
	// Extract the original values
	const {
		date: localDate,
		dayStartTime: localStartTime,
		dayEndTime: localEndTime,
		lunchStartTime: localLunchStart,
		lunchEndTime: localLunchEnd,
		requisitionId
	} = day;

	console.log(day);
	// Convert each time to a full UTC Date object if time exists
	const dayStart = createUTCDateTime(localDate, localStartTime, userTimezone);

	const dayEnd = createUTCDateTime(localDate, localEndTime, userTimezone);

	const lunchStart = localLunchStart.length
		? createUTCDateTime(localDate, localLunchStart, userTimezone)
		: null;

	const lunchEnd = localLunchEnd.length
		? createUTCDateTime(localDate, localLunchEnd, userTimezone)
		: null;

	// Extract the UTC date for the 'date' field (using the day start to determine UTC date)
	const utcDateStr = dayStart ? dayStart.toISOString().split('T')[0] : localDate;

	// Return data formatted for your PostgreSQL schema
	return {
		// For your schema's fields
		date: utcDateStr, // For the date field
		dayStart: dayStart, // Date object for timestamp field
		dayEnd: dayEnd,
		lunchStart: lunchStart,
		lunchEnd: lunchEnd,
		requisitionId
	};
}

/**
 * Create a JavaScript Date object in UTC from local date and time
 * ✅ FIXED VERSION - Properly converts local timezone to UTC
 *
 * @param localDateStr The local date string (YYYY-MM-DD)
 * @param localTimeStr The local time string (HH:MM)
 * @param timezone The local timezone (e.g., 'America/Denver')
 * @returns JavaScript Date object in UTC
 */

export function createUTCDateTime(
	localDateStr: string,
	localTimeStr: string,
	timezone: string
): Date {
	if (!localDateStr || !localTimeStr || !timezone) {
		throw new Error('Missing required parameters for createUTCDateTime');
	}

	try {
		// Create an ISO string (timezone-naive)
		const isoString = `${localDateStr}T${localTimeStr}:00`;

		// Parse as a naive date (no timezone assumed)
		const naiveDate = parseISO(isoString);

		if (!isValid(naiveDate)) {
			throw new Error(`Invalid date/time values: ${localDateStr} ${localTimeStr}`);
		}

		// Interpret this naive date as being in the target timezone
		// and convert to UTC
		const utcDate = fromZonedTime(naiveDate, timezone);

		console.log('createUTCDateTime conversion:', {
			input: { localDateStr, localTimeStr, timezone },
			isoString,
			naiveISO: naiveDate.toISOString(),
			utcResult: utcDate.toISOString()
		});

		return utcDate;
	} catch (error) {
		console.error('Error creating UTC DateTime:', error);
		throw error;
	}
}

/**
 * Format a UTC timestamp for local display
 *
 * @param timestamp UTC timestamp from database
 * @param timezone Target timezone for display
 * @returns Formatted datetime string for the calendar
 */
export function formatTimestampForDisplay(timestamp: string | Date, timezone: string): string {
	if (!timestamp) return '';

	try {
		// Parse the timestamp as a Date object
		const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

		// Format it for local display with timezone consideration
		// Format matches what the calendar expects
		const formattedDate = formatInTimeZone(date, timezone, 'yyyy-MM-dd HH:mm:ss');

		// Add timezone info for debugging/display
		return `${formattedDate} ${formatInTimeZone(date, timezone, 'z')}`;
	} catch (error) {
		console.error('Error formatting timestamp:', error);
		return String(timestamp);
	}
}

/**
 * Calculate hours between start and end times
 * Handles both ISO timestamps and HH:MM time strings
 */
export function calculateHours(startTime: string | Date, endTime: string | Date): number {
	if (!startTime || !endTime) return 0;

	try {
		// Handle ISO timestamps or Date objects
		if (
			startTime instanceof Date ||
			(typeof startTime === 'string' && (startTime.includes('T') || startTime.includes('Z')))
		) {
			const startDate = typeof startTime === 'string' ? new Date(startTime) : startTime;
			const endDate = typeof endTime === 'string' ? new Date(endTime) : endTime;

			if (!isValid(startDate) || !isValid(endDate)) {
				console.warn('Invalid dates in calculateHours:', { startTime, endTime });
				return 0;
			}

			// Calculate difference in milliseconds and convert to hours
			const diffMs = endDate.getTime() - startDate.getTime();
			const hours = diffMs / (1000 * 60 * 60);

			// Handle negative hours (crossing midnight)
			return hours < 0 ? 24 + hours : hours;
		}
		// Handle HH:MM format strings
		else if (typeof startTime === 'string' && typeof endTime === 'string') {
			const parseTimeToMinutes = (timeStr: string): number => {
				const timeParts = timeStr.split(':');
				if (timeParts.length < 2) return 0;

				const hours = parseInt(timeParts[0]);
				const minutes = parseInt(timeParts[1]);

				if (isNaN(hours) || isNaN(minutes)) return 0;

				return hours * 60 + minutes;
			};

			const startMinutes = parseTimeToMinutes(startTime);
			const endMinutes = parseTimeToMinutes(endTime);

			// Handle case where end time is on next day
			const diffMinutes =
				endMinutes >= startMinutes
					? endMinutes - startMinutes
					: 24 * 60 - startMinutes + endMinutes;

			return Math.round((diffMinutes / 60) * 100) / 100;
		}

		return 0;
	} catch (error) {
		console.error('Error calculating hours:', error, { startTime, endTime });
		return 0;
	}
}

/**
 * Calculate the maximum hours for a work day based on recurrence day data
 * Handles both legacy and new formats, accounts for lunch breaks
 */
export function calculateMaxHours(recurrenceDay: any): number {
	if (!recurrenceDay) {
		console.warn('No recurrence day provided to calculateMaxHours');
		return 0;
	}

	try {
		let dayStart: string | Date | null = null;
		let dayEnd: string | Date | null = null;
		let lunchStart: string | Date | null = null;
		let lunchEnd: string | Date | null = null;

		// Check which format we're dealing with
		if (recurrenceDay.dayStart) {
			// New format with dayStart property (ISO timestamps)
			dayStart = recurrenceDay.dayStart;
			dayEnd = recurrenceDay.dayEnd;
			lunchStart = recurrenceDay.lunchStart;
			lunchEnd = recurrenceDay.lunchEnd;
		} else if (recurrenceDay.dayStartTime) {
			// Legacy format with dayStartTime property (could be ISO or HH:MM)
			dayStart = recurrenceDay.dayStartTime;
			dayEnd = recurrenceDay.dayEndTime;
			lunchStart = recurrenceDay.lunchStartTime;
			lunchEnd = recurrenceDay.lunchEndTime;
		} else {
			console.warn('Unrecognized recurrence day format:', recurrenceDay);
			return 0;
		}

		if (!dayStart || !dayEnd) {
			console.warn('Missing start or end time in recurrence day:', recurrenceDay);
			return 0;
		}

		// Calculate total work hours
		const totalHours = calculateHours(dayStart, dayEnd);

		// Subtract lunch break if present
		// if (lunchStart && lunchEnd) {
		// 	const lunchHours = calculateHours(lunchStart, lunchEnd);
		// 	const netHours = totalHours - lunchHours;
		// 	return Math.max(0, Math.round(netHours * 100) / 100);
		// }

		return Math.round(totalHours * 100) / 100;
	} catch (error) {
		console.error('Error calculating max hours:', error, recurrenceDay);
		return 0;
	}
}

export function parseUTCTimeStringToLocal(utcTimeString, timezone) {
	if (!utcTimeString || !timezone) return '';

	// Extract just the time part (HH:MM:SS) from the UTC string like "T00:00:00.000Z"
	const timeMatch = utcTimeString.match(/T(\d{2}:\d{2}:\d{2})/);
	if (!timeMatch) return '';

	const timeOnly = timeMatch[1].substring(0, 5); // Get HH:MM

	// Use your existing utility with today's date
	const today = format(new Date(), 'yyyy-MM-dd');
	return utcToLocalTime(timeOnly, today, timezone);
}

export function localTimeToUTCTimeString(localTime, timezone) {
	if (!localTime || !timezone) return '';

	// Use your existing utility with today's date
	const today = format(new Date(), 'yyyy-MM-dd');
	const utcTime = localTimeToUTC(localTime, today, timezone);

	// Convert back to your UTC time string format
	return `T${utcTime}:00.000Z`;
}

export function formatTimeString(timeValue) {
	if (!timeValue) return '';
	// Ensure HH:MM format (some browsers might return HH:MM:SS)
	return timeValue.substring(0, 5);
}
