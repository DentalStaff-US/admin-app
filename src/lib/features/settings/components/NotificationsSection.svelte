<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import Notice from '$dtss/Notice.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import SettingsPanel from './SettingsPanel.svelte';

	let {
		receiveEmail: initialEmail,
		receiveSms: initialSms,
		action = '/settings/notifications'
	}: { receiveEmail: boolean; receiveSms: boolean; action?: string } = $props();

	// svelte-ignore state_referenced_locally
	let receiveEmail = $state(initialEmail);
	// svelte-ignore state_referenced_locally
	let receiveSms = $state(initialSms);
	let saving = $state(false);

	const channels = $derived([
		{
			id: 'receiveEmail',
			label: 'Announcement emails',
			description: 'Opportunities and news our team sends out by email.',
			get checked() {
				return receiveEmail;
			},
			set: (v: boolean) => (receiveEmail = v)
		},
		{
			id: 'receiveSms',
			label: 'Announcement texts (SMS)',
			description: 'Opportunities and news our team sends out by text.',
			get checked() {
				return receiveSms;
			},
			set: (v: boolean) => (receiveSms = v)
		}
	]);
</script>

<SettingsPanel title="Notifications" description="Choose whether we send you announcements.">
	<!-- The opt-outs only cover campaigns our team sends by hand (receive_email /
	     receive_sms). Platform messages, reminders and automated campaigns ignore
	     them, so the copy must not promise more. -->
	<Notice tone="info" title="Account and work messages always reach you">
		These switches only cover announcements our team sends by hand. Messages about your account and
		your work — shift and request updates, reminders, timesheets, invoices, security and other
		automatic messages — are sent whatever you choose here.
	</Notice>

	<form
		method="POST"
		{action}
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
			};
		}}
	>
		<Section title="Announcements" flush>
			<ul class="divide-y">
				{#each channels as channel (channel.id)}
					<li class="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
						<div>
							<p id={`${channel.id}-label`} class="font-semibold">{channel.label}</p>
							<p class="text-sm text-muted-foreground">{channel.description}</p>
						</div>
						<Switch
							checked={channel.checked}
							aria-labelledby={`${channel.id}-label`}
							onCheckedChange={(v: boolean | undefined) => channel.set(!!v)}
						/>
						<!-- The action reads "on" for each channel that stays switched on. -->
						{#if channel.checked}<input type="hidden" name={channel.id} value="on" />{/if}
					</li>
				{/each}
			</ul>
			<div class="flex justify-end border-t px-5 py-4 sm:px-6">
				<Button type="submit" disabled={saving}>
					{#if saving}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Save preferences{/if}
				</Button>
			</div>
		</Section>
	</form>
</SettingsPanel>
