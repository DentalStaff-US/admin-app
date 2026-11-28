<script lang="ts">
	import type { NavGroup } from '$lib/nav/nav';
	import SidebarLink from './SidebarLink.svelte';

	let {
		groups,
		active,
		rail = false,
		unreadCount = 0,
		onNavigate
	}: {
		groups: NavGroup[];
		active: string | null;
		/** Icons only; labels become tooltips and stay as aria-labels. */
		rail?: boolean;
		unreadCount?: number;
		onNavigate?: () => void;
	} = $props();
</script>

<!-- 05 › A Sidebar: one list from nav.ts, grouped, with counts on actionable queues. -->
{#each groups as group, i (group.label ?? i)}
	{#if group.label}
		{#if rail}
			<div class="mx-3 my-3 border-t border-white/10" role="presentation"></div>
		{:else}
			<p class="px-3 pb-2 pt-6 text-overline uppercase text-white/40">{group.label}</p>
		{/if}
	{/if}
	<ul class="space-y-1">
		{#each group.items as item (item.href)}
			<li>
				<SidebarLink
					href={item.href}
					label={item.label}
					icon={item.icon}
					current={active === item.href}
					{rail}
					count={item.badge === 'inbox' ? unreadCount : 0}
					{onNavigate}
				/>
			</li>
		{/each}
	</ul>
{/each}
