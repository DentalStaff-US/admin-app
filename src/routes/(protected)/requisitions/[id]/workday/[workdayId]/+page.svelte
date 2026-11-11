<script lang="ts">
	import { WorkdayDetailPage } from '$features/requisitions';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<WorkdayDetailPage {data} />
