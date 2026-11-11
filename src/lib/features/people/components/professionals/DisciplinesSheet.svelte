<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	import { Plus, X } from 'lucide-svelte';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import FormSheet from '$dtss/FormSheet.svelte';
	import Notice from '$dtss/Notice.svelte';

	type Entry = {
		disciplineId: string;
		experienceLevelId: string;
		preferredHourlyMin: number;
		preferredHourlyMax: number;
	};

	/**
	 * Experience & rates editor, posting JSON to the existing
	 * `updateDisciplines` action (which replaces the set in one transaction and
	 * writes the ledger). A list editor rather than a formsnap form, because
	 * formsnap 0.4 has no array fields; every control is a shadcn one.
	 */
	let {
		open = $bindable(false),
		form,
		disciplines,
		levels,
		action = '?/updateDisciplines'
	}: {
		open?: boolean;
		form: SuperValidated<any>;
		disciplines: { id: string; name: string }[];
		levels: { id: string; value: string }[];
		action?: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	const sf = superForm(form, {
		id: 'professional-disciplines',
		dataType: 'json',
		taintedMessage: null,
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				// What was just saved is the new baseline; closing mustn't roll it back.
				snapshot = structuredClone(($values.disciplines ?? []) as Entry[]);
				tainted.set(undefined);
				open = false;
			}
		}
	});
	const { form: values, errors, submitting, tainted, enhance } = sf;
	const entries = $derived(($values.disciplines ?? []) as Entry[]);

	// Each time the sheet opens, start from what's stored (the old Cancel emptied the list).
	let snapshot: Entry[] = [];
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) snapshot = structuredClone(($values.disciplines ?? []) as Entry[]);
		if (!open && wasOpen && $tainted) {
			$values.disciplines = structuredClone(snapshot);
			tainted.set(undefined);
		}
		wasOpen = open;
	});

	let newId = $state('');
	let newLevel = $state('');
	let newMin = $state(0);
	let newMax = $state(0);
	let addError = $state<string | null>(null);

	const nameOf = (id: string) => disciplines.find((d) => d.id === id)?.name ?? 'Unknown';
	const levelOf = (id: string) => levels.find((l) => l.id === id)?.value ?? 'Unknown';
	const available = $derived(disciplines.filter((d) => !entries.some((e) => e.disciplineId === d.id)));

	function add() {
		if (!newId || !newLevel) return;
		if (Number(newMax) < Number(newMin)) {
			addError = 'The maximum rate must be at least the minimum.';
			return;
		}
		addError = null;
		$values.disciplines = [
			...entries,
			{ disciplineId: newId, experienceLevelId: newLevel, preferredHourlyMin: Number(newMin), preferredHourlyMax: Number(newMax) }
		];
		newId = '';
		newLevel = '';
		newMin = 0;
		newMax = 0;
	}

	function remove(id: string) {
		$values.disciplines = entries.filter((e) => e.disciplineId !== id);
	}

	function setField(index: number, key: keyof Entry, value: string | number) {
		const next = [...entries];
		next[index] = { ...next[index], [key]: key === 'experienceLevelId' ? value : Number(value) };
		$values.disciplines = next;
	}
</script>

<FormSheet bind:open title="Experience & rates" description="Disciplines drive job matching and pay. Changes are recorded in History." dirty={Boolean($tainted)}>
	<form method="POST" {action} id="professional-disciplines-form" use:enhance class="space-y-6">
		{#if $errors._errors?.length}
			<Notice tone="negative" alert>{$errors._errors[0]}</Notice>
		{/if}

		<fieldset class="space-y-3 rounded-lg bg-muted/50 p-4">
			<legend class="sr-only">Add a discipline</legend>
			<p class="text-sm font-semibold">Add a discipline</p>
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="new-discipline">Discipline</Label>
					<Select.Root
						selected={newId ? { value: newId, label: nameOf(newId) } : undefined}
						onSelectedChange={(v) => (newId = (v?.value as string) ?? '')}
					>
						<Select.Trigger id="new-discipline"><Select.Value placeholder="Choose a discipline" /></Select.Trigger>
						<Select.Content>
							{#each available as d (d.id)}<Select.Item value={d.id}>{d.name}</Select.Item>{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-1.5">
					<Label for="new-level">Experience</Label>
					<Select.Root
						selected={newLevel ? { value: newLevel, label: levelOf(newLevel) } : undefined}
						onSelectedChange={(v) => (newLevel = (v?.value as string) ?? '')}
					>
						<Select.Trigger id="new-level"><Select.Value placeholder="Choose a level" /></Select.Trigger>
						<Select.Content>
							{#each levels as l (l.id)}<Select.Item value={l.id}>{l.value}</Select.Item>{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-1.5">
					<Label for="new-min">Min rate ($/hr)</Label>
					<Input id="new-min" type="number" min="0" inputmode="decimal" class="tabular-nums" bind:value={newMin} />
				</div>
				<div class="space-y-1.5">
					<Label for="new-max">Max rate ($/hr)</Label>
					<Input id="new-max" type="number" min="0" inputmode="decimal" class="tabular-nums" bind:value={newMax} />
				</div>
			</div>
			{#if addError}<p class="text-sm text-destructive" role="alert">{addError}</p>{/if}
			<Button variant="outline" size="sm" class="gap-2" disabled={!newId || !newLevel} on:click={add}>
				<Plus class="size-4" aria-hidden="true" />Add discipline
			</Button>
		</fieldset>

		<div class="space-y-3">
			<p class="text-sm font-semibold">Current disciplines ({entries.length})</p>
			{#if entries.length === 0}
				<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No disciplines yet.</p>
			{:else}
				<ul class="divide-y rounded-lg border">
					{#each entries as entry, i (entry.disciplineId)}
						<li class="space-y-3 p-4">
							<div class="flex items-center justify-between gap-2">
								<p class="font-semibold">{nameOf(entry.disciplineId)}</p>
								<Button variant="ghost" size="icon" class="size-9" aria-label="Remove {nameOf(entry.disciplineId)}" on:click={() => remove(entry.disciplineId)}>
									<X class="size-4" aria-hidden="true" />
								</Button>
							</div>
							<div class="grid gap-3 sm:grid-cols-3">
								<div class="space-y-1.5">
									<Label for="lvl-{i}">Experience</Label>
									<Select.Root
										selected={{ value: entry.experienceLevelId, label: levelOf(entry.experienceLevelId) }}
										onSelectedChange={(v) => v && setField(i, 'experienceLevelId', v.value as string)}
									>
										<Select.Trigger id="lvl-{i}"><Select.Value /></Select.Trigger>
										<Select.Content>
											{#each levels as l (l.id)}<Select.Item value={l.id}>{l.value}</Select.Item>{/each}
										</Select.Content>
									</Select.Root>
								</div>
								<div class="space-y-1.5">
									<Label for="min-{i}">Min $/hr</Label>
									<Input id="min-{i}" type="number" min="0" class="tabular-nums" value={entry.preferredHourlyMin} on:input={(e) => setField(i, 'preferredHourlyMin', e.currentTarget.value)} />
								</div>
								<div class="space-y-1.5">
									<Label for="max-{i}">Max $/hr</Label>
									<Input id="max-{i}" type="number" min="0" class="tabular-nums" value={entry.preferredHourlyMax} on:input={(e) => setField(i, 'preferredHourlyMax', e.currentTarget.value)} />
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</form>

	{#snippet footer()}
		<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="professional-disciplines-form" disabled={$submitting}>
			{$submitting ? 'Saving…' : 'Save changes'}
		</Button>
	{/snippet}
</FormSheet>
