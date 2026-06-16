<script lang="ts">
	import { PlusIcon, Loader2 } from 'lucide-svelte';
	import { Button, buttonVariants } from '../ui/button';
	import * as Dialog from '../ui/dialog';
	import { cn } from '$lib/utils';
	import type { AppUser as User } from '$lib/server/auth';
	import { superForm } from 'sveltekit-superforms/client';
	import Input from '../ui/input/input.svelte';
	import Textarea from '../ui/textarea/textarea.svelte';
	import Label from '../ui/label/label.svelte';
	import type { NewSupportTicketSchema } from '$lib/config/zod-schemas';

	export let open: boolean;
	export let form: any;
	export let user: User;

	const { enhance, submitting } = superForm<NewSupportTicketSchema>(form);
</script>

<Dialog.Root {open}>
	<Dialog.Trigger
		class={cn(buttonVariants({ variant: 'default' }), 'bg-primary hover:bg-primary/90')}
		on:click={() => {
			// form = data.form;
			open = true;
		}}><PlusIcon size={20} class="mr-2" />New Ticket</Dialog.Trigger
	>
	<Dialog.Content class="sm:max-w-[425px]">
		<form use:enhance method="POST" action="/support" class=" space-y-4">
			<Dialog.Header>
				<Dialog.Title>Get Support</Dialog.Title>
				<Dialog.Description>
					Please describe in detail what your issue is and our team will be in touch soon to help.
				</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-2">
				<Label for="title">Title</Label>
				<Input name="title" required />
			</div>
			<div class="space-y-2">
				<Label for="expectedResults">Expected Results</Label>
				<Textarea name="expectedResults" required />
			</div>
			<div class="space-y-2">
				<Label for="actualResults">Actual Results</Label>

				<Textarea name="actualResults" required />
			</div>
			<div class="space-y-2">
				<Label for="stepsToReproduce">Steps to Reproduce</Label>
				<Textarea name="stepsToReproduce" required />
			</div>
			<input type="hidden" value={user.id} name="reportedById" />
			<Dialog.Footer>
				<Dialog.Close asChild>
					<Button type="submit" class="w-full" disabled={$submitting}
						>{#if $submitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Please wait...{:else}Submit Ticket{/if}
					</Button>
				</Dialog.Close>
				<Dialog.Close asChild>
					<Button variant="outline" type="button" class="w-full">Close</Button>
				</Dialog.Close>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
