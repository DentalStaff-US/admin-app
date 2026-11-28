<script lang="ts">
	import { ConversationTranscript } from '$features/inbox';

	let { data } = $props();
</script>

<ConversationTranscript conversation={data.conversation} back={data.back} />
