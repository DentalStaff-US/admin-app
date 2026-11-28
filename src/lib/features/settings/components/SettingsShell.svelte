<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronLeft } from 'lucide-svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { cn } from '$lib/utils';
	import type { SettingsSection } from '../settingsNav';
	import SettingsNav from './SettingsNav.svelte';

	let {
		sections,
		activeId,
		explicit,
		onSelect,
		onBack,
		children
	}: {
		sections: SettingsSection[];
		activeId: string;
		/**
		 * The URL (or history state) names a section. On phones that shows the
		 * section with a way back; otherwise phones show the list (drill-down).
		 * Desktop always shows the list beside the section.
		 */
		explicit: boolean;
		onSelect?: (section: SettingsSection) => void;
		/** Back to the list on phones; defaults to a plain link to /settings. */
		onBack?: () => void;
		children: Snippet;
	} = $props();

	function back(event: MouseEvent) {
		if (!onBack) return;
		event.preventDefault();
		onBack();
	}
</script>

<Page>
	<PageHeader title="Settings" description="Your account, your practice and how we reach you." />

	<div class="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
		<div class={cn(explicit && 'hidden md:block')}>
			<SettingsNav {sections} {activeId} {onSelect} />
		</div>

		<div class={cn('min-w-0 max-w-3xl', !explicit && 'hidden md:block')}>
			<a
				href="/settings"
				onclick={back}
				class="-ml-2 mb-4 inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
			>
				<ChevronLeft class="size-4" aria-hidden="true" /> All settings
			</a>
			{@render children()}
		</div>
	</div>
</Page>
