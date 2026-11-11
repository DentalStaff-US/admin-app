<script lang="ts">
	import { ApplicationDetailPage } from '$features/requisitions';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ApplicationDetailPage {data} />
