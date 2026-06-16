<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Loader2, AlertCircle, ShieldCheck, ShieldOff, Copy, Check } from 'lucide-svelte';
	import { authClient } from '$lib/auth-client';
	import { invalidateAll } from '$app/navigation';

	// Whether 2FA is currently enabled for the user (from data.user.twoFactorEnabled).
	export let enabled: boolean = false;

	type Mode = 'idle' | 'enable-password' | 'enable-verify' | 'disable-password';
	let mode: Mode = 'idle';
	let password = '';
	let code = '';
	let qrDataUrl = '';
	let secret = '';
	let backupCodes: string[] = [];
	let error = '';
	let loading = false;
	let copied = false;

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

	async function copyBackupCodes() {
		await navigator.clipboard.writeText(backupCodes.join('\n'));
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<Card.Root class="border-slate-200/80">
	<Card.Header>
		<Card.Title class="flex items-center gap-2 text-xl">
			<ShieldCheck class="h-5 w-5 text-primary" />
			Two-factor authentication
		</Card.Title>
		<Card.Description>
			Add an extra layer of security by requiring a code from your authenticator app when you sign
			in.
		</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if error}
			<Alert.Root variant="destructive">
				<AlertCircle class="h-4 w-4" />
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if enabled && mode === 'idle'}
			<div
				class="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700"
			>
				<ShieldCheck class="h-4 w-4" /> Two-factor authentication is on.
			</div>
			<div>
				<Button variant="outline" on:click={() => (mode = 'disable-password')}>
					<ShieldOff class="mr-2 h-4 w-4" /> Disable two-factor
				</Button>
			</div>
		{:else if mode === 'idle'}
			<div>
				<Button class="bg-primary hover:bg-primary/90" on:click={() => (mode = 'enable-password')}>
					<ShieldCheck class="mr-2 h-4 w-4" /> Enable two-factor
				</Button>
			</div>
		{/if}

		{#if mode === 'enable-password' || mode === 'disable-password'}
			<form
				on:submit|preventDefault={mode === 'enable-password'
					? submitEnablePassword
					: submitDisable}
				class="grid max-w-sm gap-3"
			>
				<div class="grid gap-1.5">
					<Label for="tf-password">Confirm your password</Label>
					<Input id="tf-password" type="password" bind:value={password} autocomplete="current-password" />
				</div>
				<div class="flex gap-2">
					<Button
						type="submit"
						class={mode === 'enable-password'
							? 'bg-primary hover:bg-primary/90'
							: 'bg-destructive hover:bg-destructive/90'}
						disabled={loading || !password}
					>
						{#if loading}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" /> Please wait
						{:else}
							{mode === 'enable-password' ? 'Continue' : 'Disable'}
						{/if}
					</Button>
					<Button type="button" variant="destructiveOutline" on:click={reset}>Cancel</Button>
				</div>
			</form>
		{/if}

		{#if mode === 'enable-verify'}
			<div class="grid gap-4">
				<p class="text-sm text-muted-foreground">
					Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy…),
					then enter the 6-digit code it shows.
				</p>
				<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
					{#if qrDataUrl}
						<img src={qrDataUrl} alt="2FA QR code" class="h-44 w-44 rounded-lg border bg-white p-2" />
					{/if}
					<div class="text-sm">
						<p class="text-muted-foreground">Can't scan it? Enter this key manually:</p>
						<code class="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
							{secret}
						</code>
					</div>
				</div>

				{#if backupCodes.length}
					<div class="rounded-md border border-amber-200 bg-amber-50 p-3">
						<div class="mb-2 flex items-center justify-between">
							<p class="text-sm font-semibold text-amber-900">
								Save your backup codes
							</p>
							<button
								type="button"
								class="flex items-center gap-1 text-xs text-amber-800 hover:underline"
								on:click={copyBackupCodes}
							>
								{#if copied}<Check class="h-3 w-3" /> Copied{:else}<Copy class="h-3 w-3" /> Copy{/if}
							</button>
						</div>
						<p class="mb-2 text-xs text-amber-800">
							Each code can be used once if you lose access to your authenticator. Store them
							somewhere safe.
						</p>
						<div class="grid grid-cols-2 gap-1 font-mono text-xs text-amber-900 sm:grid-cols-3">
							{#each backupCodes as bc}
								<span>{bc}</span>
							{/each}
						</div>
					</div>
				{/if}

				<form on:submit|preventDefault={submitVerify} class="grid max-w-xs gap-2">
					<Label for="tf-code">Verification code</Label>
					<Input
						id="tf-code"
						bind:value={code}
						placeholder="123456"
						inputmode="numeric"
						autocomplete="one-time-code"
						class="tracking-widest"
					/>
					<div class="flex gap-2">
						<Button
							type="submit"
							class="bg-primary hover:bg-primary/90"
							disabled={loading || !code}
						>
							{#if loading}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" /> Verifying…
							{:else}
								Verify &amp; enable
							{/if}
						</Button>
						<Button type="button" variant="destructiveOutline" on:click={reset}>Cancel</Button>
					</div>
				</form>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
