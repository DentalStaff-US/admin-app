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
	<p class="text-sm text-gray-500">No Preference</p>
{:else}
	<ul class="space-y-1 text-sm">
		{#each requirements as r (r.categoryId)}
			<li>
				<span class="font-medium">{r.categoryName}</span>
				<span class="text-xs text-gray-500">({r.matchMode === 'ALL' ? 'all of' : 'any of'})</span>:
				{#each r.skills as s, i (s.id)}
					<span class:text-red-600={missing.has(s.id)}>{s.name}{s.requiresCertificate ? ' (cert.)' : ''}</span
					>{i < r.skills.length - 1 ? ', ' : ''}
				{/each}
			</li>
		{/each}
	</ul>
{/if}
