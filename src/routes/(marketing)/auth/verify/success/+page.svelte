<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { CheckCircle2, AlertCircle } from 'lucide-svelte';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';

	export let data: { verifyError: string | null };
</script>

<AuthShell>
	<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
		<Card.Header class="space-y-2 text-center">
			{#if data.verifyError}
				<AlertCircle class="mx-auto h-12 w-12 text-destructive" />
				<Card.Title class="text-2xl">Verification problem</Card.Title>
				<Card.Description>
					This link may have expired or already been used. Request a new verification email and try
					again.
				</Card.Description>
			{:else}
				<CheckCircle2 class="mx-auto h-12 w-12 text-green-600" />
				<Card.Title class="text-2xl">Email verified</Card.Title>
				<Card.Description>Your email address has been verified. You can now sign in.</Card.Description>
			{/if}
		</Card.Header>
		<Card.Footer>
			<Button href="/auth/sign-in" class="h-11 w-full bg-primary text-base hover:bg-primary/90">
				Continue to sign in
			</Button>
		</Card.Footer>
	</Card.Root>
</AuthShell>
