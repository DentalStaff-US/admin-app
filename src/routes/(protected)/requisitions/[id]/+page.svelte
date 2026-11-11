<script lang="ts">
	import { RequestDetailPage } from '$features/requisitions';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- 06 › Request detail: PageHeader, FactGrid, lifecycle Stepper (permanent)
     and one child component per tab, all in the requisitions feature. -->
<RequestDetailPage {data} />
