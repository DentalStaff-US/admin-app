<script lang="ts">
	import { Building2, CalendarDays, Clock, MapPin } from 'lucide-svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { formatTimezoneName } from '$lib/_helpers/UTCTimezoneUtils';
	import { requestHref, timeRange, toDate } from '../calendar';

	let { open = $bindable(false), event }: { open?: boolean; event: any | null } = $props();

	const p = $derived(event?.extendedProps ?? {});
	const practice = $derived(p.client ?? p.requisition?.client ?? null);
	const tz = $derived(p.requisition?.referenceTimezone || 'America/New_York');
	const href = $derived(event && p.type === 'RECURRENCE_DAY' ? requestHref(event) : null);
	const day = $derived(
		event ? toDate(event.start).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) : ''
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg rounded-2xl shadow-float">
		{#if event}
			<Dialog.Header class="space-y-3 text-left">
				<div class="flex items-center gap-3">
					{#if practice?.companyLogo}
						<img src={practice.companyLogo} alt="" class="size-12 rounded-lg border bg-card object-contain p-1" />
					{:else}
						<span class="inline-flex size-12 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
							<Building2 class="size-6" aria-hidden="true" />
						</span>
					{/if}
					<div class="min-w-0">
						<Dialog.Title class="text-h2">{String(event.title ?? '').trim()}</Dialog.Title>
						<Dialog.Description class="truncate">{practice?.companyName ?? ''}</Dialog.Description>
					</div>
				</div>
				{#if p.recurrenceDay?.status}<div><StatusBadge status={p.recurrenceDay.status} /></div>{/if}
			</Dialog.Header>

			{#if p.type === 'RECURRENCE_DAY'}
				<dl class="space-y-2 text-sm">
					<div class="flex items-center gap-2">
						<dt><CalendarDays class="size-4 text-muted-foreground" aria-hidden="true" /><span class="sr-only">Date</span></dt>
						<dd class="font-semibold">{day}</dd>
					</div>
					<div class="flex items-center gap-2">
						<dt><Clock class="size-4 text-muted-foreground" aria-hidden="true" /><span class="sr-only">Time</span></dt>
						<dd><span class="font-semibold tabular-nums">{timeRange(event)}</span> <span class="text-muted-foreground">({formatTimezoneName(tz)} time)</span></dd>
					</div>
					{#if p.location?.name}
						<div class="flex items-center gap-2">
							<dt><MapPin class="size-4 text-muted-foreground" aria-hidden="true" /><span class="sr-only">Location</span></dt>
							<dd class="font-semibold">{p.location.name}</dd>
						</div>
					{/if}
				</dl>
			{/if}

			{#if href}
				<Dialog.Footer class="gap-2">
					<!-- 06 › Calendar: a Button href, not a Button nested in <a>. -->
					<Button {href}>View requisition</Button>
				</Dialog.Footer>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
