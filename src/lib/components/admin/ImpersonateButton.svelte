<!--
  "Sign in as this user" — the admin impersonation entry point.

  Posts to /admin/impersonation/start, which owns the authorization check and
  decides between the two paths. This component only has to do the half the
  browser must do, which differs by path:

    same-app (CLIENT / CLIENT_STAFF) — the session cookie has already been
      swapped, so we need a FULL page load. A client-side goto would leave the
      old session in memory and the impersonation banner would not appear until
      a manual refresh (the users table learned this the hard way; see the note
      on its own handler).

    handoff (CANDIDATE) — candidates cannot hold a session in this app at all,
      so the server minted one on the candidate domain and left ours alone. Open
      it in a new tab; this tab stays signed in as the admin.

  Hidden unless the signed-in user holds users.impersonate. The server re-checks
  regardless — this button being hidden is a courtesy, not the control.
-->
<script lang="ts">
	import { can } from '$lib/authz';
	import { page } from '$app/state';
	import { UserCog } from 'lucide-svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		userId,
		userName = 'this user',
		redirectTo = '/dashboard',
		variant = 'outline',
		size = 'sm',
		iconOnly = false,
		label = null,
		crossApp = false
	}: {
		/** users.id of the person to impersonate — NOT their profile id. */
		userId: string | null | undefined;
		/** For the confirm copy, e.g. "Dana Whitfield". */
		userName?: string;
		/** Where the browser lands after a same-app impersonation. */
		redirectTo?: string;
		variant?: 'outline' | 'ghost';
		size?: 'sm' | 'default';
		/** Icon-only, for dense rows. */
		iconOnly?: boolean;
		/** Overrides the default button text, e.g. "Sign in as owner". */
		label?: string | null;
		/**
		 * True when the target lives in the candidate app (role CANDIDATE), so the
		 * server hands off to that domain and the browser opens a NEW TAB. A prop
		 * because the confirm copy must be accurate before the request is made; the
		 * server still decides the actual path from the database role.
		 */
		crossApp?: boolean;
	} = $props();

	// Only roles with users.impersonate (SUPERADMIN) see the button at all.
	const allowed = $derived(can(page.data.user, 'users.impersonate'));

	let busy = $state(false);
	let confirmOpen = $state(false);
	// Local, not a flash message: an error here belongs next to the button.
	let errorMessage = $state<string | null>(null);

	const buttonText = $derived(busy ? 'Starting…' : (label ?? 'Sign in as user') + (crossApp ? ' ↗' : ''));
	const ariaLabel = $derived(
		crossApp ? `Sign in as ${userName} (opens their portal in a new tab)` : `Sign in as ${userName}`
	);

	async function start() {
		if (!userId || busy) return;
		errorMessage = null;
		busy = true;
		try {
			const res = await fetch('/admin/impersonation/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, redirectTo })
			});
			const data = await res.json().catch(() => null);

			if (!res.ok || !data?.success) {
				errorMessage = data?.message ?? 'Could not start impersonation.';
				busy = false;
				confirmOpen = false;
				return;
			}

			if (data.mode === 'handoff') {
				// New tab on the candidate domain; this tab remains the admin's.
				window.open(data.handoffUrl, '_blank', 'noopener');
				busy = false;
				confirmOpen = false;
				return;
			}

			// Full load, deliberately not goto() — see the component header.
			window.location.href = data.redirectTo ?? redirectTo;
		} catch {
			errorMessage = 'Could not start impersonation.';
			busy = false;
			confirmOpen = false;
		}
	}
</script>

{#if userId && allowed}
	<div class="flex flex-col items-end gap-1">
		<Button
			{variant}
			size={iconOnly ? 'icon' : size}
			type="button"
			class={iconOnly ? '' : 'gap-2'}
			disabled={busy}
			aria-label={iconOnly ? ariaLabel : undefined}
			on:click={() => (confirmOpen = true)}
		>
			<UserCog class="size-4" aria-hidden="true" />
			{#if !iconOnly}{buttonText}{/if}
		</Button>
		{#if errorMessage}
			<p class="text-xs text-destructive" role="alert">{errorMessage}</p>
		{/if}
	</div>

	<!-- Acting as someone else is worth one deliberate beat. The ledger records it
	     either way (IMPERSONATE_START, and impersonatedBy on everything after). -->
	<ConfirmDialog
		bind:open={confirmOpen}
		title="Sign in as {userName}?"
		description={crossApp
			? "You'll see their portal exactly as they do, in a new tab; this tab stays signed in as you. Anything you do there is recorded as you acting on their behalf."
			: "This tab switches to their account and you'll see the app exactly as they do. Anything you do is recorded as you acting on their behalf. Exit from the banner at the top."}
	>
		{#snippet confirm()}
			<Button class="min-h-11 sm:min-h-10" disabled={busy} on:click={start}>
				{busy ? 'Starting…' : crossApp ? 'Open their portal' : 'Sign in as user'}
			</Button>
		{/snippet}
	</ConfirmDialog>
{/if}
