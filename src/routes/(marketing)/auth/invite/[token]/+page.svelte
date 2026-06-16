<!-- src/routes/auth/invite/[token]/+page.svelte -->
<script lang="ts">
	import { APP_NAME, CLIENT_STAFF_ROLES, STAFF_ROLE_ENUM } from '$lib/config/constants.js';

	export let data;
	$: role =
		data?.invite?.staffRole &&
		STAFF_ROLE_ENUM[data.invite.staffRole as keyof typeof STAFF_ROLE_ENUM]
			? STAFF_ROLE_ENUM[data.invite.staffRole as keyof typeof STAFF_ROLE_ENUM]
			: 'Employee';
</script>

{#if data.status === 'error'}
	<div class="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
		<h1 class="text-2xl font-bold text-gray-900 mb-4">{data.heading}</h1>
		<p class="text-gray-600">{@html data.message}</p>
	</div>
{:else if data.type === 'admin'}
	<div class="max-w-lg mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
		<h1 class="text-2xl font-bold text-gray-900 mb-4">Staff Invitation</h1>
		<div class="space-y-4">
			<p class="text-gray-600">
				You've been invited to join {APP_NAME} as an admin with the following details:
			</p>
			<div class="space-y-2">
				<p><strong>Email:</strong> {data?.invite?.email}</p>
			</div>

			<form method="POST" class="mt-6" action="?/handleAdminInvite">
				<button
					type="submit"
					class="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
				>
					Accept Invitation
				</button>
			</form>
		</div>
	</div>
{:else}
	<div class="max-w-lg mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
		<h1 class="text-2xl font-bold text-gray-900 mb-4">Staff Invitation</h1>
		<div class="space-y-4">
			<p class="text-gray-600">
				You've been invited to join {data?.invite?.company}'s workspace with the following details:
			</p>
			<div class="space-y-2">
				<p><strong>Email:</strong> {data?.invite?.email}</p>
				<p><strong>Role:</strong> {role}</p>
			</div>

			<form method="POST" class="mt-6" action="?/handleClientInvite">
				<button
					type="submit"
					class="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
				>
					Accept Invitation
				</button>
			</form>
		</div>
	</div>
{/if}
