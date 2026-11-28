<script lang="ts">
	// Dev-only fixtures for the calendar: ~30 shifts around today across
	// statuses, practices, locations and disciplines.
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { CalendarPage, dayKey, type ShiftEvent } from '$features/calendar';

	let sidebar = $state<'expanded' | 'rail'>('expanded');

	const practices = [
		{ id: 'p1', companyName: 'Bright Smiles Dental', companyLogo: null, locations: [{ id: 'l1', name: 'Tampa – Westshore' }, { id: 'l2', name: 'Brandon' }] },
		{ id: 'p2', companyName: 'Harbor Dental Group', companyLogo: null, locations: [{ id: 'l3', name: 'St. Petersburg' }] },
		{ id: 'p3', companyName: 'Oak Street Family Dentistry', companyLogo: null, locations: [{ id: 'l4', name: 'Clearwater' }] }
	];
	const disciplines = [
		{ id: 'd1', name: 'Dental Hygienist', abbreviation: 'RDH' },
		{ id: 'd2', name: 'Dental Assistant', abbreviation: 'DA' },
		{ id: 'd3', name: 'Front Office', abbreviation: 'FO' }
	];
	const statuses = ['FILLED', 'OPEN', 'FILLED', 'UNFULFILLED', 'FILLED', 'CANCELED', 'OPEN'];
	const pad = (n: number) => String(n).padStart(2, '0');

	const today = new Date();
	const events: ShiftEvent[] = Array.from({ length: 32 }, (_, i) => {
		const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (i % 16) - 5);
		const practice = practices[i % 3];
		const location = practice.locations[i % practice.locations.length];
		const discipline = disciplines[i % 3];
		const startH = 7 + (i % 4);
		const day = dayKey(d);
		const status = d < new Date(today.getFullYear(), today.getMonth(), today.getDate()) && statuses[i % 7] === 'OPEN' ? 'UNFULFILLED' : statuses[i % 7];
		const req = 1040 + (i % 9);
		return {
			start: `${day}T${pad(startH)}:00:00`,
			end: `${day}T${pad(startH + 8)}:30:00`,
			title: `#${req} ${discipline.abbreviation} `,
			resourceIds: [req, `rd${i}`],
			extendedProps: {
				type: 'RECURRENCE_DAY',
				requisition: { id: req, referenceTimezone: 'America/New_York', client: practice },
				recurrenceDay: { id: `rd${i}`, status },
				discipline,
				client: practice,
				location
			}
		};
	});
</script>

<AdminShell pathname="/calendar" nav={{ role: 'SUPERADMIN' }} bind:sidebar name="Shannon Carter" initials="SC">
	<Page width="full">
		<PageHeader title="Calendar" description="Every scheduled shift, coloured by status. Hover for details; click to open." />
		<CalendarPage {events} url={page.url} {today} />
	</Page>
</AdminShell>
