<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { MailCheck } from 'lucide-svelte';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';
</script>

<AuthShell>
	<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
		<Card.Header class="space-y-2 text-center">
			<MailCheck class="mx-auto h-12 w-12 text-primary" />
			<Card.Title class="text-2xl">Check your email</Card.Title>
			<Card.Description>
				We've sent a link to reset your password. If it doesn't appear within a few minutes, check
				your spam folder.
			</Card.Description>
		</Card.Header>
		<Card.Footer>
			<Button href="/auth/sign-in" class="h-11 w-full bg-primary text-base hover:bg-primary/90">
				Back to sign in
			</Button>
		</Card.Footer>
	</Card.Root>
</AuthShell>
