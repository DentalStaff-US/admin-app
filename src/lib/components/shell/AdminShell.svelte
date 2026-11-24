<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { ChevronRight, ChevronsLeft, ChevronsRight, Menu, Search } from 'lucide-svelte';
	import logo from '$lib/assets/white-dtss-logo.png';
	import mark from '$lib/assets/dtss-mark.png';
	import * as Sheet from '$lib/components/ui/sheet';
	import {
		activeHref,
		breadcrumbs,
		fillsScreen,
		navFor,
		SIDEBAR_COOKIE,
		type NavContext,
		type SidebarState
	} from '$lib/nav/nav';
	import { pageLabel } from '$lib/pageTitle';
	import { cn } from '$lib/utils';
	import CommandPalette from './CommandPalette.svelte';
	import SidebarNav from './SidebarNav.svelte';
	import UserMenu from './UserMenu.svelte';

	let {
		pathname,
		search = '',
		nav,
		sidebar = $bindable('expanded'),
		canSearch = false,
		name,
		email,
		avatarUrl,
		initials,
		unreadCount = 0,
		topBanner,
		topBannerShown = false,
		banner,
		children
	}: {
		pathname: string;
		/** The query string, for nav items that point at a Settings section (Team). */
		search?: string;
		nav: NavContext;
		/** From the cookie on the server, so the first paint has the right width. */
		sidebar?: SidebarState;
		canSearch?: boolean;
		name: string;
		email?: string;
		avatarUrl?: string | null;
		initials: string;
		unreadCount?: number;
		/** Always shown, full width at the very top: impersonation. */
		topBanner?: Snippet;
		/** Whether topBanner renders anything: the sticky parts sit below it. */
		topBannerShown?: boolean;
		/** At most one account or page message (05 › banner slot). */
		banner?: Snippet;
		children: Snippet;
	} = $props();

	const groups = $derived(navFor(nav));
	const active = $derived(activeHref(pathname, groups, search));
	const crumbs = $derived(breadcrumbs(pathname, groups, pageLabel(pathname), search));
	const fills = $derived(fillsScreen(pathname));
	const rail = $derived(sidebar === 'rail');

	let mobileOpen = $state(false);
	let paletteOpen = $state(false);
	// The server can't know the platform; most practices are on Windows.
	let shortcut = $state('Ctrl K');
	onMount(() => {
		if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut = '⌘K';
	});

	function toggleSidebar() {
		sidebar = rail ? 'expanded' : 'rail';
		document.cookie = `${SIDEBAR_COOKIE}=${sidebar}; path=/; max-age=31536000; samesite=lax`;
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			paletteOpen = !paletteOpen;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- 05 › A: navy sidebar (expanded or icon rail) + top bar; the window scrolls,
     except the two-pane inbox, which fills the viewport. -->
<div
	class={cn(
		'flex flex-col bg-muted/40',
		fills ? 'h-dvh overflow-hidden' : 'min-h-dvh',
		topBannerShown ? '[--top-banner:2.5rem]' : '[--top-banner:0px]'
	)}
>
	<a
		href="#main"
		class="sr-only z-50 rounded-md bg-background px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-ring"
	>
		Skip to content
	</a>

	{@render topBanner?.()}

	<div class="flex min-h-0 flex-1">
		<aside
			class={cn(
				'sticky top-[var(--top-banner)] hidden shrink-0 flex-col bg-navy text-white transition-[width] duration-base lg:flex',
				fills ? 'h-full' : 'h-[calc(100dvh-var(--top-banner))]',
				rail ? 'w-[72px]' : 'w-64'
			)}
		>
			<a
				href="/dashboard"
				class={cn(
					'flex h-14 shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70',
					rail ? 'justify-center' : 'px-5'
				)}
			>
				{#if rail}
					<img src={mark} alt="DTSS" class="size-9 brightness-0 invert" />
				{:else}
					<img src={logo} alt="DTSS" class="h-8 w-auto brightness-0 invert" />
				{/if}
			</a>
			<nav aria-label="Main" class={cn('flex-1 overflow-y-auto pb-4', rail ? 'px-3' : 'px-3')}>
				<SidebarNav {groups} {active} {rail} {unreadCount} />
			</nav>
			<button
				type="button"
				onclick={toggleSidebar}
				aria-expanded={!rail}
				aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
				class={cn(
					'flex h-12 shrink-0 items-center gap-2 border-t border-white/10 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70',
					rail ? 'justify-center' : 'px-5'
				)}
			>
				{#if rail}
					<ChevronsRight class="size-4" aria-hidden="true" />
				{:else}
					<ChevronsLeft class="size-4" aria-hidden="true" /> Collapse
				{/if}
			</button>
		</aside>

		<div class="flex min-w-0 flex-1 flex-col">
			<header class="sticky top-[var(--top-banner)] z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
				<button
					type="button"
					class="-ml-2 flex size-11 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
					aria-label="Open menu"
					aria-expanded={mobileOpen}
					onclick={() => (mobileOpen = true)}
				>
					<Menu class="size-5" aria-hidden="true" />
				</button>

				<nav aria-label="Breadcrumb" class="min-w-0 flex-1">
					<ol class="flex min-w-0 items-center gap-1.5 text-sm">
						{#each crumbs as crumb, i (i)}
							{#if i > 0}<li aria-hidden="true"><ChevronRight class="size-4 text-muted-foreground" /></li>{/if}
							<li class="min-w-0 truncate">
								{#if crumb.href}
									<a href={crumb.href} class="font-semibold text-muted-foreground hover:text-foreground">{crumb.label}</a>
								{:else}
									<span class="font-bold" aria-current="page">{crumb.label}</span>
								{/if}
							</li>
						{/each}
					</ol>
				</nav>

				<button
					type="button"
					onclick={() => (paletteOpen = true)}
					aria-label="Search"
					class="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-md border bg-background text-sm text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56 sm:justify-start sm:px-3 lg:w-72"
				>
					<Search class="size-4 shrink-0" aria-hidden="true" />
					<span class="hidden min-w-0 flex-1 truncate text-left sm:inline">Search</span>
					<kbd class="hidden shrink-0 whitespace-nowrap rounded border bg-muted px-1.5 font-sans text-xs font-semibold sm:inline">{shortcut}</kbd>
				</button>

				<UserMenu {name} {email} {avatarUrl} {initials} />
			</header>

			{#if banner}
				<div class="mx-auto w-full max-w-7xl px-4 pt-6 md:px-8">{@render banner()}</div>
			{/if}

			<main id="main" tabindex="-1" class={cn('flex min-w-0 flex-1 flex-col outline-none', fills && 'min-h-0')}>
				{@render children()}
			</main>
		</div>
	</div>
</div>

<!-- Phones and tablets: the same items in a left drawer. -->
<Sheet.Root bind:open={mobileOpen}>
	<Sheet.Content side="left" class="w-72 border-r-0 bg-navy p-0 text-white">
		<div class="flex h-14 items-center px-5">
			<img src={logo} alt="DTSS" class="h-8 w-auto brightness-0 invert" />
		</div>
		<nav aria-label="Main" class="h-[calc(100dvh-3.5rem)] overflow-y-auto px-3 pb-6">
			<SidebarNav {groups} {active} {unreadCount} onNavigate={() => (mobileOpen = false)} />
		</nav>
	</Sheet.Content>
</Sheet.Root>

<CommandPalette bind:open={paletteOpen} {groups} {canSearch} />
