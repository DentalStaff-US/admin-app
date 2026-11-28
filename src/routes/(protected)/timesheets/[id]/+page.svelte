<script lang="ts">
	import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
	import { USER_ROLES } from '$lib/config/constants';
	import { TimesheetAdmin, TimesheetReview, weekRangeLabel, type TimesheetPageData } from '$features/timesheets';

	let { data } = $props();
	const view = $derived(data as unknown as TimesheetPageData);
</script>

<svelte:head>
	<title>Timesheet, week of {weekRangeLabel(data.timesheet?.weekBeginDate)} | DTSS</title>
</svelte:head>

<!-- One component per role (06 › Timesheets). -->
{#if checkIsAdmin(data.user.role)}
	<TimesheetAdmin data={view} />
{:else}
	<TimesheetReview data={view} />
{/if}
