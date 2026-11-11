<script lang="ts">
	import { AdminProfile } from '$features/admin';

	let { data, form } = $props();
</script>

<AdminProfile
	profile={data.profile}
	isSelf={data.user.id === data.profile.id}
	updateForm={data.updateAdminForm}
	deleteError={form?.message}
/>
