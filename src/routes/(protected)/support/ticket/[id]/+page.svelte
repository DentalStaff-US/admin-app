<script lang="ts">
	import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
	import { USER_ROLES } from '$lib/config/constants';
	import { TicketDetailPage } from '$features/support';

	let { data } = $props();
</script>

<svelte:head><title>{data.ticket.details.ticket.title} | Support | DTSS</title></svelte:head>

<TicketDetailPage
	ticket={data.ticket as any}
	viewerId={data.user.id}
	isAdmin={checkIsAdmin(data.user.role)}
	commentForm={data.commentForm}
/>
