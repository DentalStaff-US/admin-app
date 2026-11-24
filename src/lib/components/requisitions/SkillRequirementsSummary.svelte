<script lang="ts">
	/** Read-only rendering of a requisition's skill requirements. */
	type Requirement = {
		categoryId: string;
		categoryName: string;
		matchMode: 'ALL' | 'ANY';
		skills: { id: string; name: string; requiresCertificate: boolean }[];
	};

	export let requirements: Requirement[] = [];
	/** Skill ids to flag as missing (e.g. on a candidate row). */
	export let missingSkillIds: string[] = [];

	$: missing = new Set(missingSkillIds);
</script>

{#if requirements.length === 0}
	<p class="text-sm text-muted-foreground">No Preference</p>
{:else}
	<ul class="space-y-3 text-sm">
		{#each requirements as r (r.categoryId)}
			<li>
				<p class="font-semibold">
					{r.categoryName}
					<span class="text-xs font-normal text-muted-foreground">({r.matchMode === 'ALL' ? 'all of' : 'any of'})</span>
				</p>
				<ul class="mt-1 flex flex-wrap gap-2">
					{#each r.skills as s (s.id)}
						<li class="rounded-full border px-2 py-0.5 text-xs" class:text-destructive={missing.has(s.id)}>
							{s.name}{s.requiresCertificate ? ' (cert.)' : ''}
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>
{/if}
