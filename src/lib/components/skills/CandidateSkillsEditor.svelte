<script lang="ts">
	/**
	 * A professional's skills, grouped by category: read-only list with certificate
	 * badges, and (when `editable`) a checkbox editor posting `skillIds` to `action`.
	 *
	 * The lock itself is enforced server-side (canEditCandidateSkills); `editable` and
	 * `lockedNote` only decide what to render.
	 */
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Edit, Lock, Save, X } from 'lucide-svelte';

	type CatalogSkill = {
		id: string;
		name: string;
		requiresCertificate: boolean;
		archivedAt: Date | string | null;
	};
	type CatalogCategory = {
		id: string;
		name: string;
		description: string | null;
		skills: CatalogSkill[];
	};
	type HeldSkill = {
		skillId: string;
		name: string;
		categoryId: string;
		categoryName: string;
		requiresCertificate: boolean;
		certExpiresOn: string | null;
		effective: boolean;
	};

	export let catalog: CatalogCategory[] = [];
	export let held: HeldSkill[] = [];
	export let editable = false;
	export let action = '?/updateSkills';
	/** Shown instead of the edit button when the list is locked. */
	export let lockedNote: string | null = null;

	let editing = false;
	let saving = false;
	let selected = new Set<string>();

	function startEditing() {
		selected = new Set(held.map((h) => h.skillId));
		editing = true;
	}

	function toggle(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
		selected = selected;
	}

	$: heldByCategory = held.reduce<Record<string, { name: string; skills: HeldSkill[] }>>(
		(acc, h) => {
			(acc[h.categoryId] ??= { name: h.categoryName, skills: [] }).skills.push(h);
			return acc;
		},
		{}
	);

	function certLabel(h: HeldSkill): { text: string; tone: 'ok' | 'warn' | 'bad' } | null {
		if (!h.requiresCertificate) return null;
		if (!h.certExpiresOn) return { text: 'Certificate needed', tone: 'warn' };
		if (!h.effective) return { text: `Certificate expired ${h.certExpiresOn}`, tone: 'bad' };
		return { text: `Cert. expires ${h.certExpiresOn}`, tone: 'ok' };
	}

	const toneClass = {
		ok: 'bg-green-50 text-green-700 border-green-200',
		warn: 'bg-amber-50 text-amber-700 border-amber-200',
		bad: 'bg-red-50 text-red-700 border-red-200'
	};
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<p class="text-sm text-muted-foreground">
			Skills drive matching when a requisition requires them. A skill that needs a certificate
			only counts while a linked, unexpired certificate is on file.
		</p>
		{#if editable && !editing}
			<Button variant="ghost" size="sm" on:click={startEditing} aria-label="Edit skills">
				<Edit class="h-4 w-4" />
			</Button>
		{:else if !editable && lockedNote}
			<span class="flex items-center gap-1 text-xs text-muted-foreground">
				<Lock class="h-3 w-3" />
				{lockedNote}
			</span>
		{/if}
	</div>

	{#if editing}
		<form
			method="POST"
			{action}
			class="space-y-4"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success') editing = false;
					await update();
				};
			}}
		>
			{#if catalog.length === 0}
				<p class="text-sm text-muted-foreground">
					No skills are set up for this professional's disciplines yet.
				</p>
			{/if}
			{#each catalog as category (category.id)}
				<fieldset class="rounded-lg border p-3">
					<legend class="px-1 text-sm font-medium">{category.name}</legend>
					{#if category.description}
						<p class="mb-2 text-xs text-muted-foreground">{category.description}</p>
					{/if}
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each category.skills as skill (skill.id)}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="skillIds"
									value={skill.id}
									checked={selected.has(skill.id)}
									on:change={() => toggle(skill.id)}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<span class:line-through={!!skill.archivedAt}>{skill.name}</span>
								{#if skill.requiresCertificate}
									<span class="text-xs text-muted-foreground">(cert.)</span>
								{/if}
							</label>
						{/each}
					</div>
				</fieldset>
			{/each}
			<div class="flex justify-end gap-2">
				<Button type="button" variant="outline" size="sm" on:click={() => (editing = false)}>
					<X class="mr-1 h-4 w-4" /> Cancel
				</Button>
				<Button type="submit" size="sm" disabled={saving}>
					<Save class="mr-1 h-4 w-4" />
					{saving ? 'Saving…' : 'Save skills'}
				</Button>
			</div>
		</form>
	{:else if held.length === 0}
		<p class="text-sm text-muted-foreground">No skills on file.</p>
	{:else}
		{#each Object.entries(heldByCategory) as [categoryId, group] (categoryId)}
			<div>
				<h4 class="mb-1 text-sm font-medium">{group.name}</h4>
				<div class="flex flex-wrap gap-2">
					{#each group.skills as h (h.skillId)}
						{@const cert = certLabel(h)}
						<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
							{h.name}
							{#if cert}
								<span class="rounded-full border px-1.5 {toneClass[cert.tone]}">{cert.text}</span>
							{/if}
						</span>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
