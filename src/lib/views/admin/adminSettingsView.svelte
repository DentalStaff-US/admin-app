 <script lang="ts">
	import { SETTINGS_MENU_OPTIONS } from '$lib/config/constants';
	import { superForm } from 'sveltekit-superforms/client';
	import { cn } from '$lib/utils';
	import * as Alert from '$lib/components/ui/alert';
	import { AlertCircle } from 'lucide-svelte';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import AvatarUpload from "$lib/components/avatar-upload.svelte";
	import TwoFactorSettings from '$lib/components/settings/two-factor-settings.svelte';

	export let userProfileForm;
	export let passwordForm;
	export let selectedTab: string;
	export let user
	export let handleAvatarUpdated: (url: string, isForUser?: boolean) => Promise<void>;

	$: confirmPasswordError = $passwordErrors.confirmPassword;

	const { form: userFormObj, enhance: userFormEnhance } = superForm(userProfileForm);
	const {
		form: passwordFormObj,
		enhance: passwordFormEnhance,
		errors: passwordErrors
	} = superForm(passwordForm);
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 grid grid-cols-5 md:grow">
	<div
		class="col-span-5 md:col-span-1 md:border-r border-b md:border-b-0 border-gray-200 h-full flex flex-col gap-2 l pr-6"
	>
		<button
			on:click={() => (selectedTab = SETTINGS_MENU_OPTIONS.ADMIN.PROFILE)}
			class={cn(
				'rounded-md hover:bg-gray-50 p-3 border border-white text-left',
				selectedTab === SETTINGS_MENU_OPTIONS.ADMIN.PROFILE ? 'bg-gray-50 border-gray-100' : ''
			)}>Profile</button
		>
		<button
			on:click={() => (selectedTab = SETTINGS_MENU_OPTIONS.ADMIN.PASSWORD)}
			class={cn(
				'rounded-md hover:bg-gray-50 p-3 border border-white text-left',
				selectedTab === SETTINGS_MENU_OPTIONS.ADMIN.PASSWORD ? 'bg-gray-50 border-gray-100' : ''
			)}>Password</button
		>
	</div>
	<div class="col-span-5 md:col-span-4 pl-4 space-y-4">
		{#if selectedTab === SETTINGS_MENU_OPTIONS.ADMIN.PROFILE}
			<h2 class="text-3xl font-semibold">Profile Details</h2>
			<AvatarUpload {user} onAvatarUpdated={handleAvatarUpdated} isForUser={true}/>
			<form use:userFormEnhance method="POST" action="?/updateUser">
				<div class="grid grid-cols-2 gap-6">
					<!-- {#if errors?._errors?.length}
						<div class="col-span-2">
							<Alert.Root variant="destructive">
								<AlertCircle class="h-4 w-4" />
								<Alert.Title>Error</Alert.Title>
								<Alert.Description>
									{#each errors._errors as error}
										{error}
									{/each}
								</Alert.Description>
							</Alert.Root>
						</div>
					{/if} -->
					<div class="col-span-2 md:col-span-1">
						<Label for="firstName">First Name</Label>
						<Input name="firstName" bind:value={$userFormObj.firstName} />
					</div>
					<div class="col-span-2 md:col-span-1">
						<Label for="lastName">Last Name</Label>
						<Input name="lastName" bind:value={$userFormObj.lastName} />
					</div>
					<div class="col-span-2 md:col-span-1">
						<Label for="email">Email Address</Label>
						<Input name="email" bind:value={$userFormObj.email} />
					</div>
				</div>
				<div class="mt-8">
					<Button type="submit">Save Changes</Button>
				</div>
			</form>
		{/if}
		{#if selectedTab === SETTINGS_MENU_OPTIONS.ADMIN.PASSWORD}
			<h2 class="text-3xl font-semibold">Change Password</h2>
			<form use:passwordFormEnhance method="POST" action="?/updatePassword">
				<div class="grid grid-cols-2 gap-6">
					{#if confirmPasswordError}
						<div class="col-span-2">
							<Alert.Root variant="destructive">
								<AlertCircle class="h-4 w-4" />
								<Alert.Title>Error</Alert.Title>
								<Alert.Description>
									{confirmPasswordError}
								</Alert.Description>
							</Alert.Root>
						</div>
					{/if}
					<div class="col-span-2 md:col-span-1">
						<Label for="password">Current Password</Label>
						<Input type="password" name="password" bind:value={$passwordFormObj.password} />
					</div>
					<div class="col-span-2 md:col-span-1"></div>
					<div class="col-span-2 md:col-span-1">
						<Label for="newPassword">New Password</Label>
						<Input type="password" name="newPassword" bind:value={$passwordFormObj.newPassword} />
					</div>
					<div class="col-span-2 md:col-span-1"></div>
					<div class="col-span-2 md:col-span-1">
						<Label for="confirmPassword">Confirm New Password</Label>
						<Input
							type="password"
							name="confirmPassword"
							bind:value={$passwordFormObj.confirmPassword}
						/>
					</div>
				</div>
				<div class="mt-8">
					<Button type="submit">Save Changes</Button>
				</div>
			</form>

			<div class="mt-10 max-w-2xl">
				<TwoFactorSettings enabled={Boolean(user?.twoFactorEnabled)} />
			</div>
		{/if}
	</div>
</div>
