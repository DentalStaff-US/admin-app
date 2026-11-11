<script lang="ts">
	import { MailPlus } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
</script>

<!-- The template store doesn't exist yet: the load returns an empty list and
     there are no actions. This page used to be a broken copy of the Skills
     screen (its "Add" form posted to a missing action). -->
<Page>
	<PageHeader title="Notification templates" description="Reusable SMS and email copy for mass notifications." />
	<EmptyState
		icon={MailPlus}
		title="Coming soon"
		description="Saved templates aren't available yet. Write the message directly when you create a mass notification."
	>
		<Button href="/admin/menu/mass-notifications/create">New mass notification</Button>
	</EmptyState>
</Page>
