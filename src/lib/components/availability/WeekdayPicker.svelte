<!-- ─── MIRRORED FILE ──────────────────────────────────────────────────────────
  Twin: dtss-candidate-app/src/lib/components/availability/WeekdayPicker.svelte
  Change one, change both. All logic and copy live in ./availability.ts.
  ──────────────────────────────────────────────────────────────────────────── -->
<script lang="ts">
	import { ALL_DAYS, COPY, DAY_LONG, DAY_SHORT, formatShortDate, bookedConflicts, type BookedDay } from './availability';

	/** The days this professional CAN work. Bindable. */
	export let value: number[] = [...ALL_DAYS];
	export let bookedDates: BookedDay[] = [];
	export let disabled = false;
	/** '' in self mode; the professional's first name in admin mode. */
	export let subject = '';

	const toggle = (day: number) => {
		if (disabled) return;
		value = value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b);
	};

	$: zeroDays = value.length === 0;
	// Non-blocking: unticking a weekday does NOT cancel work already committed on it.
	// Silence here would let someone believe they had cancelled a shift.
	$: conflicts = bookedConflicts(value, bookedDates);
</script>

<fieldset class="space-y-3" {disabled}>
	<!-- A fieldset/legend so the group's purpose is announced once rather than per day. -->
	<legend class="text-base font-semibold">{COPY.week.legend(subject)}</legend>
	<p class="text-sm text-muted-foreground">{COPY.week.help(subject)}</p>

	<div class="flex justify-between gap-1 sm:justify-start sm:gap-2">
		{#each ALL_DAYS as day (day)}
			{@const checked = value.includes(day)}
			<label
				class="cursor-pointer select-none"
				class:cursor-not-allowed={disabled}
				class:opacity-60={disabled}
			>
				<!--
					A native checkbox, not a ToggleGroup: it announces "Monday, checkbox,
					checked" rather than "toggle button, pressed", submits without JS, and
					needs no generic-typing gymnastics.
				-->
				<input
					type="checkbox"
					class="peer sr-only"
					{checked}
					{disabled}
					on:change={() => toggle(day)}
				/>
				<span
					class="flex h-11 w-11 items-center justify-center rounded-full border text-sm font-medium
						transition-colors
						peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground
						peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
						bg-background text-muted-foreground"
					aria-hidden="true">{DAY_SHORT[day]}</span
				>
				<span class="sr-only">{DAY_LONG[day]}</span>
			</label>
		{/each}
	</div>

	{#if zeroDays}
		<p class="text-sm font-medium text-destructive" role="alert">
			{COPY.week.zeroError}
			<!-- The support link is a candidate-app route, so it is offered only in
			     self mode. In admin mode (subject set) staff ARE the support path. -->
			{#if !subject}
				<a class="underline" href="/settings/support">{COPY.week.zeroErrorCta}</a>
			{/if}
		</p>
	{/if}

	{#if conflicts.length}
		<p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
			{COPY.week.bookedConflict(
				conflicts.length,
				conflicts
					.slice(0, 3)
					.map((c) => formatShortDate(c.date))
					.join(', ')
			)}
		</p>
	{/if}
</fieldset>
