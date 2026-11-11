<script lang="ts">
	import { Bell, Building2, ChevronRight, CreditCard, FileText, Gift, ShieldCheck, User, Users } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { SettingsIcon, SettingsSection } from '../settingsNav';

	let {
		sections,
		activeId,
		onSelect
	}: {
		sections: SettingsSection[];
		activeId: string;
		/** Switch sections in place (shallow routing). Separate routes always navigate. */
		onSelect?: (section: SettingsSection) => void;
	} = $props();

	const ICONS: Record<SettingsIcon, typeof User> = {
		user: User,
		building: Building2,
		users: Users,
		card: CreditCard,
		file: FileText,
		shield: ShieldCheck,
		bell: Bell,
		gift: Gift
	};

	function click(event: MouseEvent, section: SettingsSection) {
		// Let modified clicks open a new tab as usual.
		if (!onSelect || section.route || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		onSelect(section);
	}
</script>

<nav aria-label="Settings">
	<!-- Phones: the list is its own screen (drill-down), like the professional app's Me tab. -->
	<ul class="divide-y overflow-hidden rounded-lg border bg-card shadow-card md:hidden">
		{#each sections as section (section.id)}
			{@const Icon = ICONS[section.icon]}
			<li>
				<a
					href={section.href}
					onclick={(e) => click(e, section)}
					class="flex min-h-16 items-center gap-4 p-4 transition-colors duration-fast hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
				>
					<span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-dark">
						<Icon class="size-5" aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block font-semibold">{section.label}</span>
						<span class="block text-sm text-muted-foreground">{section.description}</span>
					</span>
					<ChevronRight class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
				</a>
			</li>
		{/each}
	</ul>

	<!-- Desktop: a left list beside the section. -->
	<ul class="hidden space-y-1 md:block">
		{#each sections as section (section.id)}
			{@const Icon = ICONS[section.icon]}
			{@const active = section.id === activeId}
			<li>
				<a
					href={section.href}
					onclick={(e) => click(e, section)}
					aria-current={active ? 'page' : undefined}
					class={cn(
						'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						active && 'bg-primary-soft text-primary-dark hover:bg-primary-soft hover:text-primary-dark'
					)}
				>
					<Icon class="size-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{section.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
