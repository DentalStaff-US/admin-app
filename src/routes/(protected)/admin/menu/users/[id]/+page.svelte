<script lang="ts">
	import { UserAccountPage } from '$features/admin';

	let { data } = $props();
</script>

<UserAccountPage
	overview={data.overview}
	activity={data.activity}
	isSelf={data.user?.id === data.overview.account.id}
	can={data.can}
/>
