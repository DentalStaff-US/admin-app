<script lang="ts">
	import type { Snippet } from 'svelte';
	import logo from '$lib/assets/dtss-logo.png';

	let { topBanner, children }: { topBanner?: Snippet; children: Snippet } = $props();

	let signOutForm: HTMLFormElement;
</script>

<!-- 05 › Shared rules: onboarding sits outside the main shell, with only the
     logo and a way out, so a new practice doesn't wander off mid-setup. -->
<div class="flex min-h-dvh flex-col bg-muted/40">
	{@render topBanner?.()}
	<header class="border-b bg-card">
		<div class="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 md:px-6">
			<img src={logo} alt="DTSS" class="h-8 w-auto" />
			<form bind:this={signOutForm} method="POST" action="/auth/sign-out">
				<button
					type="submit"
					class="h-11 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Sign out
				</button>
			</form>
		</div>
	</header>
	<main id="main" class="flex flex-1 flex-col">
		{@render children()}
	</main>
</div>
