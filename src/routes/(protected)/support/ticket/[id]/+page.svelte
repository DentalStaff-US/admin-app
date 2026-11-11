<script lang="ts">
	import { USER_ROLES } from '$lib/config/constants';
	import { TicketDetailPage } from '$features/support';

	let { data } = $props();
</script>

<svelte:head><title>{data.ticket.details.ticket.title} | Support | DTSS</title></svelte:head>

<TicketDetailPage
	ticket={data.ticket as any}
	viewerId={data.user.id}
	isAdmin={data.user.role === USER_ROLES.SUPERADMIN}
	commentForm={data.commentForm}
/>
