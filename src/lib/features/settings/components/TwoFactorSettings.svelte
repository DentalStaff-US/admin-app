<script lang="ts">
	import { Check, Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-svelte';
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Section from '$dtss/Section.svelte';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import Field from './Field.svelte';

	// Whether 2FA is currently enabled for the user (from data.user.twoFactorEnabled).
	let { enabled = false }: { enabled?: boolean } = $props();

	type Mode = 'idle' | 'enable-password' | 'enable-verify' | 'disable-password';
	let mode = $state<Mode>('idle');
	let password = $state('');
	let code = $state('');
	let qrDataUrl = $state('');
	let secret = $state('');
	let backupCodes = $state<string[]>([]);
	let error = $state('');
	let loading = $state(false);
	let copied = $state(false);
	let confirmDisable = $state(false);

	function reset() {
		mode = 'idle';
		password = '';
		code = '';
		qrDataUrl = '';
		secret = '';
		backupCodes = [];
		error = '';
		copied = false;
	}

	function secretFromUri(uri: string): string {
		try {
			return new URL(uri).searchParams.get('secret') ?? '';
		} catch {
			return '';
		}
	}

	async function submitEnablePassword() {
		loading = true;
		error = '';
		const { data, error: err } = await authClient.twoFactor.enable({ password });
		if (err || !data) {
			loading = false;
			error = err?.message ?? 'Could not start setup. Check your password and try again.';
			return;
		}
		secret = secretFromUri(data.totpURI);
		backupCodes = data.backupCodes ?? [];
		// Render the QR client-side (no secret ever leaves the browser).
		const QRCode = (await import('qrcode')).default;
		qrDataUrl = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 });
		loading = false;
		mode = 'enable-verify';
	}

	async function submitVerify() {
		loading = true;
		error = '';
		const { error: err } = await authClient.twoFactor.verifyTotp({ code });
		loading = false;
		if (err) {
			error = 'That code was not valid. Make sure your device time is correct and try again.';
			return;
		}
		await invalidateAll();
		reset();
	}

	async function submitDisable() {
		confirmDisable = false;
		loading = true;
		error = '';
		const { error: err } = await authClient.twoFactor.disable({ password });
		loading = false;
		if (err) {
			error = err.message ?? 'Could not disable. Check your password and try again.';
			return;
		}
		await invalidateAll();
		reset();
	}

	function onPasswordSubmit(event: SubmitEvent) {
		event.preventDefault();
		// Turning it off is consequential: confirm first (03 › Which overlay).
		if (mode === 'enable-password') submitEnablePassword();
		else confirmDisable = true;
	}

	function onVerifySubmit(event: SubmitEvent) {
		event.preventDefault();
		submitVerify();
	}

	async function copyBackupCodes() {
		await navigator.clipboard.writeText(backupCodes.join('\n'));
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<Section
	title="Two-factor sign-in"
	description="Ask for a code from your authenticator app as well as your password when you sign in."
>
	<div class="space-y-4">
		{#if error}<Notice tone="negative" alert>{error}</Notice>{/if}

		{#if enabled && mode === 'idle'}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="inline-flex items-center gap-2 text-sm font-semibold text-status-positive-fg">
					<ShieldCheck class="size-4" aria-hidden="true" /> Two-factor sign-in is on.
				</p>
				<Button variant="destructiveOutline" on:click={() => (mode = 'disable-password')}>
					<ShieldOff class="mr-2 size-4" aria-hidden="true" /> Turn off…
				</Button>
			</div>
		{:else if mode === 'idle'}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="text-sm text-muted-foreground">Two-factor sign-in is off.</p>
				<Button on:click={() => (mode = 'enable-password')}>
					<ShieldCheck class="mr-2 size-4" aria-hidden="true" /> Turn on
				</Button>
			</div>
		{/if}

		{#if mode === 'enable-password' || mode === 'disable-password'}
			<form onsubmit={onPasswordSubmit} class="max-w-sm space-y-4">
				<Field id="tf-password" label="Confirm your password">
					<Input id="tf-password" type="password" bind:value={password} autocomplete="current-password" />
				</Field>
				<div class="flex flex-wrap gap-2">
					<Button type="submit" variant={mode === 'enable-password' ? 'default' : 'destructiveOutline'} disabled={loading || !password}>
						{#if loading}
							<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" /> Please wait…
						{:else}
							{mode === 'enable-password' ? 'Continue' : 'Turn off two-factor'}
						{/if}
					</Button>
					<Button type="button" variant="outline" on:click={reset}>Cancel</Button>
				</div>
			</form>
		{/if}

		{#if mode === 'enable-verify'}
			<div class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy…), then
					enter the 6-digit code it shows.
				</p>
				<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
					{#if qrDataUrl}
						<!-- The QR needs a white quiet zone to scan in dark mode too. -->
						<img src={qrDataUrl} alt="Two-factor QR code" class="size-44 rounded-lg border bg-white p-2" />
					{/if}
					<div class="text-sm">
						<p class="text-muted-foreground">Can't scan it? Enter this key instead:</p>
						<code class="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{secret}</code>
					</div>
				</div>

				{#if backupCodes.length}
					<div class="rounded-xl border border-status-warning-border bg-status-warning-bg p-4 text-status-warning-fg">
						<div class="flex items-center justify-between gap-3">
							<p class="text-sm font-bold">Save your backup codes</p>
							<Button type="button" variant="ghost" size="sm" on:click={copyBackupCodes}>
								{#if copied}<Check class="mr-1 size-4" aria-hidden="true" /> Copied{:else}<Copy class="mr-1 size-4" aria-hidden="true" /> Copy{/if}
							</Button>
						</div>
						<p class="mt-1 text-sm">
							Each code works once, if you lose your authenticator. Keep them somewhere safe.
						</p>
						<div class="mt-3 grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3">
							{#each backupCodes as backupCode (backupCode)}<span>{backupCode}</span>{/each}
						</div>
					</div>
				{/if}

				<form onsubmit={onVerifySubmit} class="max-w-xs space-y-4">
					<Field id="tf-code" label="Verification code">
						<Input id="tf-code" bind:value={code} placeholder="123456" inputmode="numeric" autocomplete="one-time-code" class="tracking-widest" />
					</Field>
					<div class="flex flex-wrap gap-2">
						<Button type="submit" disabled={loading || !code}>
							{#if loading}
								<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" /> Verifying…
							{:else}
								Verify and turn on
							{/if}
						</Button>
						<Button type="button" variant="outline" on:click={reset}>Cancel</Button>
					</div>
				</form>
			</div>
		{/if}
	</div>
</Section>

<ConfirmDialog
	bind:open={confirmDisable}
	title="Turn off two-factor sign-in?"
	description="Your account will only need your password to sign in. Your authenticator app and backup codes stop working for this account."
	cancelLabel="Keep it on"
>
	{#snippet confirm()}
		<Button variant="destructive" class="min-h-11 sm:min-h-10" on:click={submitDisable}>Turn off</Button>
	{/snippet}
</ConfirmDialog>
