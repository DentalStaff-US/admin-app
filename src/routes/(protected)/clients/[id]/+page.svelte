<script lang="ts">
	import { ClientDetailPage } from '$features/people';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<ClientDetailPage {data} form={form as Record<string, unknown> | null} />
