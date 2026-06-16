<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { MailCheck } from 'lucide-svelte';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';

	export let data: { heading?: string; message?: string };
</script>

<AuthShell>
	<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
		<Card.Header class="space-y-2 text-center">
			<MailCheck class="mx-auto h-12 w-12 text-primary" />
			<Card.Title class="text-2xl">{data.heading ?? 'Email verification'}</Card.Title>
			{#if data.message}
				<Card.Description>{@html data.message}</Card.Description>
			{/if}
		</Card.Header>
		<Card.Footer>
			<Button href="/auth/sign-in" class="h-11 w-full bg-primary text-base hover:bg-primary/90">
				Back to sign in
			</Button>
		</Card.Footer>
	</Card.Root>
</AuthShell>
