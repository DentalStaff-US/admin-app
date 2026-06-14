<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Loader2, AlertCircle, ShieldCheck } from 'lucide-svelte';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';

	let code = '';
	let useBackup = false;
	let errorMsg = '';
	let loading = false;

	async function verify() {
		loading = true;
		errorMsg = '';
		const { error } = useBackup
			? await authClient.twoFactor.verifyBackupCode({ code })
			: await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
		loading = false;
		if (error) {
			errorMsg = error.message ?? 'Invalid code. Please try again.';
			return;
		}
		goto('/dashboard');
	}
</script>

<AuthShell>
	<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
		<Card.Header class="space-y-2 text-center">
			<ShieldCheck class="mx-auto h-12 w-12 text-blue-700" />
			<Card.Title class="text-2xl">Two-factor authentication</Card.Title>
			<Card.Description>
				{useBackup
					? 'Enter one of your backup codes.'
					: 'Enter the 6-digit code from your authenticator app.'}
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			{#if errorMsg}
				<Alert.Root variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<Alert.Description>{errorMsg}</Alert.Description>
				</Alert.Root>
			{/if}
			<form on:submit|preventDefault={verify} class="grid gap-4">
				<Input
					bind:value={code}
					placeholder={useBackup ? 'Backup code' : '123456'}
					autocomplete="one-time-code"
					inputmode={useBackup ? 'text' : 'numeric'}
					class="text-center tracking-widest"
				/>
				<Button
					type="submit"
					class="w-full bg-primary hover:bg-primary/90"
					disabled={loading || !code}
				>
					{#if loading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" /> Verifying…
					{:else}
						Verify
					{/if}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center">
			<button class="text-sm underline" on:click={() => (useBackup = !useBackup)}>
				{useBackup ? 'Use authenticator code instead' : 'Use a backup code'}
			</button>
		</Card.Footer>
	</Card.Root>
</AuthShell>
