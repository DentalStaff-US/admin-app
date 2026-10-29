<script lang="ts">
	/**
	 * Per-category skill requirements for a requisition:
	 *   No Preference (default) | Require ALL selected | Require ANY of selected.
	 *
	 * Serialises to one hidden `skillRequirements` field (JSON), parsed server-side by
	 * parseSkillRequirementsInput. Only categories with a mode AND at least one skill
	 * are sent — everything else is No Preference.
	 */
	import { browser } from '$app/environment';

	type Mode = 'NONE' | 'ALL' | 'ANY';
	const MODE_OPTIONS: [Mode, string][] = [
		['NONE', 'No Preference'],
		['ALL', 'Require all'],
		['ANY', 'Require any']
	];
	type CatalogSkill = { id: string; name: string; requiresCertificate: boolean; archivedAt: string | null };
	type CatalogCategory = { id: string; name: string; description: string | null; skills: CatalogSkill[] };
	type Initial = { categoryId: string; matchMode: 'ALL' | 'ANY'; skillIds?: string[]; skills?: { id: string }[] };

	/** The requisition's discipline; the catalog is scoped to it. */
	export let disciplineId: string | null | undefined;
	/** Existing requirements (edit form) — raw or display shape. */
	export let initial: Initial[] = [];
	export let name = 'skillRequirements';

	let catalog: CatalogCategory[] = [];
	let loading = false;
	let loadError = '';
	let modes: Record<string, Mode> = {};
	let picked: Record<string, Set<string>> = {};

	// Seed from `initial` once.
	for (const r of initial ?? []) {
		modes[r.categoryId] = r.matchMode;
		picked[r.categoryId] = new Set(r.skillIds ?? r.skills?.map((s) => s.id) ?? []);
	}
	const keepIds = Object.values(picked).flatMap((s) => [...s]);

	let lastLoaded: string | null = null;
	$: if (browser && disciplineId && disciplineId !== lastLoaded) loadCatalog(disciplineId);

	async function loadCatalog(id: string) {
		lastLoaded = id;
		loading = true;
		loadError = '';
		try {
			const qs = new URLSearchParams({ disciplineId: id });
			if (keepIds.length) qs.set('keep', keepIds.join(','));
			const res = await fetch(`/api/skills/catalog?${qs}`);
			if (!res.ok) throw new Error(String(res.status));
			catalog = await res.json();
			// Drop picks for categories/skills not offered for this discipline.
			const offered = new Map(catalog.map((c) => [c.id, new Set(c.skills.map((s) => s.id))]));
			for (const cid of Object.keys(modes)) {
				const skills = offered.get(cid);
				if (!skills) {
					delete modes[cid];
					delete picked[cid];
				} else {
					picked[cid] = new Set([...(picked[cid] ?? [])].filter((s) => skills.has(s)));
				}
			}
			modes = modes;
			picked = picked;
		} catch {
			loadError = 'Could not load skills.';
		} finally {
			loading = false;
		}
	}

	function setMode(cid: string, mode: Mode) {
		modes[cid] = mode;
		picked[cid] ??= new Set();
	}

	function toggle(cid: string, sid: string) {
		const set = (picked[cid] ??= new Set());
		if (set.has(sid)) set.delete(sid);
		else set.add(sid);
		picked = picked;
	}

	$: value = JSON.stringify(
		Object.entries(modes)
			.filter(([cid, m]) => m !== 'NONE' && (picked[cid]?.size ?? 0) > 0)
			.map(([cid, m]) => ({ categoryId: cid, matchMode: m, skillIds: [...picked[cid]] }))
	);

	$: incomplete = Object.entries(modes).filter(
		([cid, m]) => m !== 'NONE' && (picked[cid]?.size ?? 0) === 0
	);
</script>

<input type="hidden" {name} {value} />

<div class="space-y-3">
	<div>
		<span class="text-sm font-medium">Skill requirements</span>
		<p class="text-xs text-muted-foreground">
			For each category, leave No Preference or choose the skills a professional must have. "All"
			means every selected skill; "Any" means at least one.
		</p>
	</div>

	{#if !disciplineId}
		<p class="text-xs text-muted-foreground">Choose a discipline to see its skills.</p>
	{:else if loading}
		<p class="text-xs text-muted-foreground">Loading skills…</p>
	{:else if loadError}
		<p class="text-xs text-red-600">{loadError}</p>
	{:else if catalog.length === 0}
		<p class="text-xs text-muted-foreground">No skills are set up for this discipline.</p>
	{:else}
		{#each catalog as category (category.id)}
			{@const mode = modes[category.id] ?? 'NONE'}
			<div class="rounded-md border p-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<span class="text-sm font-medium">{category.name}</span>
					<div class="inline-flex rounded-md border text-xs" role="radiogroup" aria-label={category.name}>
						{#each MODE_OPTIONS as [m, label]}
							<button
								type="button"
								role="radio"
								aria-checked={mode === m}
								class="px-2 py-1 first:rounded-l-md last:rounded-r-md {mode === m
									? 'bg-primary text-primary-foreground'
									: 'bg-white hover:bg-gray-50'}"
								on:click={() => setMode(category.id, m)}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>
				{#if mode !== 'NONE'}
					<div class="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
						{#each category.skills as skill (skill.id)}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={picked[category.id]?.has(skill.id) ?? false}
									on:change={() => toggle(category.id, skill.id)}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<span class:line-through={!!skill.archivedAt}>{skill.name}</span>
								{#if skill.requiresCertificate}
									<span class="text-xs text-muted-foreground">(cert.)</span>
								{/if}
							</label>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
		{#if incomplete.length}
			<p class="text-xs text-amber-700">
				Categories with no skills ticked are treated as No Preference.
			</p>
		{/if}
	{/if}
</div>
