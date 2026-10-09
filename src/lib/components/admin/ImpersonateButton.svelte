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

  Gated by the caller on SUPERADMIN. The server re-checks regardless — this
  button being hidden is a courtesy, not the control.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { UserCog } from 'lucide-svelte';

	/** users.id of the person to impersonate — NOT their profile id. */
	export let userId: string | null | undefined;
	/** For the confirm copy, e.g. "Dana Whitfield". */
	export let userName = 'this user';
	/** Where the browser lands after a same-app impersonation. */
	export let redirectTo = '/dashboard';
	export let variant: 'outline' | 'ghost' = 'outline';
	export let size: 'sm' | 'default' = 'sm';
	/** Icon-only, for dense rows. */
	export let iconOnly = false;
	/**
	 * True when the target lives in the candidate app (role CANDIDATE), so the
	 * server will hand off to that domain and the browser opens a NEW TAB.
	 *
	 * A prop rather than something this component infers: the hosting page knows
	 * definitionally which it is (the professional header is always a candidate,
	 * the client header never is), and the confirm text has to be accurate about
	 * what is going to happen BEFORE the request is made. The server still decides
	 * the actual path from the database role — this only governs the wording.
	 */
	export let crossApp = false;

	let busy = false;
	// Local, not a flash message: this repo has no client-side flash convention and
	// an error here needs to appear next to the button that caused it.
	let errorMessage: string | null = null;

	async function start() {
		if (!userId || busy) return;
		errorMessage = null;

		// Acting as someone else is worth one deliberate beat. The ledger records it
		// either way (IMPERSONATE_START, and impersonatedBy on everything done
		// afterwards), which is exactly why the admin should know it is starting.
		const detail = crossApp
			? 'Their portal opens in a new tab. This tab stays signed in as you, and the new tab has an "End impersonation" banner.'
			: 'This tab switches to their account. Use the "Exit impersonation" banner at the top to come back.';
		if (
			!confirm(
				`Sign in as ${userName}?\n\nYou'll see the app exactly as they do, and anything you do is recorded as you acting on their behalf.\n\n${detail}`
			)
		) {
			return;
		}

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
				return;
			}

			if (data.mode === 'handoff') {
				// New tab on the candidate domain; this tab remains the admin's.
				window.open(data.handoffUrl, '_blank', 'noopener');
				busy = false;
				return;
			}

			// Full load, deliberately not goto() — see the component header.
			window.location.href = data.redirectTo ?? redirectTo;
		} catch {
			errorMessage = 'Could not start impersonation.';
			busy = false;
		}
	}
</script>

{#if userId}
	<div class="flex flex-col items-end gap-1">
		<Button
			{variant}
			{size}
			type="button"
			class="gap-2 text-blue-700 hover:bg-blue-50"
			disabled={busy}
			title={crossApp
				? 'Sign in as this user (opens their portal in a new tab)'
				: 'Sign in as this user'}
			on:click={start}
		>
			<UserCog class="h-4 w-4" />
			{#if !iconOnly}
				{busy ? 'Starting…' : crossApp ? 'Sign in as user ↗' : 'Sign in as user'}
			{/if}
		</Button>
		{#if errorMessage}
			<p class="text-xs text-destructive" role="alert">{errorMessage}</p>
		{/if}
	</div>
{/if}
