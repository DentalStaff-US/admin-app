<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import Button from '$lib/components/ui/button/button.svelte';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import { cn } from '$lib/utils';
	import { ShieldCheck } from 'lucide-svelte';
	import {
		COMPLIANCE_SEVERITIES,
		SEVERITY_LABELS,
		SNOOZE_DAYS,
		type ComplianceSeverity
	} from '$lib/config/compliance';
	import type { PageData } from './$types';

	export let data: PageData;

	$: items = data.items;
	$: counts = data.summary.counts;

	// Filter links keep the other filter in place.
	function filterHref(severity: ComplianceSeverity | null, snoozed: boolean): string {
		const p = new URLSearchParams();
		if (severity) p.set('severity', severity);
		if (snoozed) p.set('snoozed', '1');
		const qs = p.toString();
		return qs ? `?${qs}` : '?';
	}

	let pending: string | null = null;
	const submitting = (key: string) => () => {
		pending = key;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			pending = null;
		};
	};
</script>

<section class="container mx-auto px-4 py-6 space-y-6">
	<div>
		<h1 class="text-3xl font-extrabold leading-tight">Compliance</h1>
		<p class="text-muted-foreground mt-1">
			Professionals whose license or certification needs attention. Clients will appear here once
			agreement tracking exists.
		</p>
	</div>

	<nav class="flex flex-wrap items-center gap-2" aria-label="Filter by severity">
		<a
			href={filterHref(null, data.showSnoozed)}
			data-sveltekit-noscroll
			class={cn(
				'rounded-md border px-3 py-1.5 text-sm',
				!data.severity ? 'bg-primary text-primary-foreground border-transparent' : 'hover:bg-muted'
			)}
		>
			All
		</a>
		{#each COMPLIANCE_SEVERITIES as s}
			<a
				href={filterHref(s, data.showSnoozed)}
				data-sveltekit-noscroll
				class={cn(
					'rounded-md border px-3 py-1.5 text-sm',
					data.severity === s ? 'bg-primary text-primary-foreground border-transparent' : 'hover:bg-muted'
				)}
			>
				{SEVERITY_LABELS[s]} <span class="tabular-nums">({counts[s]})</span>
			</a>
		{/each}
		<a
			href={filterHref(data.severity, !data.showSnoozed)}
			data-sveltekit-noscroll
			class="ml-auto text-sm text-primary underline-offset-4 hover:underline"
		>
			{data.showSnoozed ? 'Hide snoozed' : `Show snoozed (${data.summary.snoozed})`}
		</a>
	</nav>

	{#if data.loadError}
		<p class="text-destructive">{data.loadError}</p>
	{/if}

	<Card.Root>
		<Card.Content class="p-2 md:p-4">
			{#if items.length === 0}
				<div class="flex flex-col items-center gap-2 py-10 text-muted-foreground">
					<ShieldCheck size={32} />
					<p>{data.showSnoozed ? 'Nothing snoozed.' : 'Nothing needs attention.'}</p>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Professional</Table.Head>
							<Table.Head>Credential</Table.Head>
							<Table.Head>Severity</Table.Head>
							<Table.Head>Detail</Table.Head>
							<Table.Head>Booked shifts</Table.Head>
							<Table.Head class="text-right">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each items as item (item.subjectId + item.ruleKey)}
							{@const key = item.subjectId + item.ruleKey}
							<Table.Row>
								<Table.Cell>
									<a href="/professionals/{item.subjectId}" class="font-medium hover:underline">
										{item.subjectName}
									</a>
								</Table.Cell>
								<Table.Cell>{item.title}</Table.Cell>
								<Table.Cell>
									<StatusBadge status={item.severity} label={SEVERITY_LABELS[item.severity]} />
								</Table.Cell>
								<Table.Cell class="text-sm">
									{item.detail}
									{#if item.snoozedUntil}
										<p class="text-muted-foreground text-xs">Snoozed until {item.snoozedUntil}</p>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-sm">
									{#if item.upcomingShifts.length}
										<!-- Future shifts, so the workday page's unassign/reassign is allowed. -->
										<ul class="space-y-0.5">
											{#each item.upcomingShifts.slice(0, 4) as s}
												<li>
													<a
														href="/requisitions/{s.requisitionId}/workday/{s.recurrenceDayId}"
														class="text-primary hover:underline">{s.date} · #{s.requisitionId}</a
													>
												</li>
											{/each}
											{#if item.upcomingShifts.length > 4}
												<li class="text-muted-foreground">+{item.upcomingShifts.length - 4} more</li>
											{/if}
										</ul>
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</Table.Cell>
								<Table.Cell>
									<div class="flex flex-wrap justify-end gap-2">
										{#if item.remindable}
											<form method="POST" action="?/sendReminder" use:enhance={submitting(key + 'r')}>
												<input type="hidden" name="candidateId" value={item.subjectId} />
												<input type="hidden" name="ruleKey" value={item.ruleKey} />
												<Button
													type="submit"
													size="sm"
													variant="outline"
													disabled={!!item.remindedAt || pending === key + 'r'}
													title={item.remindedAt ? `Reminded ${new Date(item.remindedAt).toLocaleString()}` : undefined}
												>
													{item.remindedAt ? 'Reminded' : pending === key + 'r' ? 'Sending…' : 'Remind'}
												</Button>
											</form>
										{/if}
										{#if item.snoozedUntil}
											<form method="POST" action="?/unsnooze" use:enhance={submitting(key + 'u')}>
												<input type="hidden" name="candidateId" value={item.subjectId} />
												<input type="hidden" name="ruleKey" value={item.ruleKey} />
												<Button type="submit" size="sm" variant="ghost" disabled={pending === key + 'u'}>
													Un-snooze
												</Button>
											</form>
										{:else if item.severity !== 'CRITICAL'}
											<details class="relative">
												<summary
													class="cursor-pointer list-none rounded-md px-3 py-2 text-sm hover:bg-muted"
												>
													Snooze
												</summary>
												<form
													method="POST"
													action="?/snooze"
													use:enhance={submitting(key + 's')}
													class="absolute right-0 z-10 mt-1 w-64 space-y-2 rounded-md border bg-background p-3 shadow-md"
												>
													<input type="hidden" name="candidateId" value={item.subjectId} />
													<input type="hidden" name="ruleKey" value={item.ruleKey} />
													<label class="block text-sm">
														For
														<select name="days" class="mt-1 w-full rounded-md border bg-background px-2 py-1">
															{#each SNOOZE_DAYS as d}
																<option value={d}>{d} days</option>
															{/each}
														</select>
													</label>
													<label class="block text-sm">
														Note
														<input
															name="note"
															maxlength="500"
															class="mt-1 w-full rounded-md border bg-background px-2 py-1"
															placeholder="e.g. renewal in progress"
														/>
													</label>
													<Button type="submit" size="sm" class="w-full" disabled={pending === key + 's'}>
														Snooze
													</Button>
												</form>
											</details>
										{/if}
										<Button size="sm" variant="ghost" href="/professionals/{item.subjectId}">
											Profile
										</Button>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</section>
