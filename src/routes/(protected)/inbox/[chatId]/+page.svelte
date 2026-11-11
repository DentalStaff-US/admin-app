<script lang="ts">
	import { ConversationThread } from '$features/inbox';

	let { data } = $props();
</script>

{#key data.conversation.id}
	<ConversationThread conversation={data.conversation} userId={data.user?.id} form={data.form} />
{/key}
