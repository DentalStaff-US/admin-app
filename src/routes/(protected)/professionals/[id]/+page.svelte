<script lang="ts">
	import { ProfessionalDetailPage } from '$features/people';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ProfessionalDetailPage {data} />
