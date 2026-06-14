<script lang="ts">
	import { SETTINGS_MENU_OPTIONS } from '$lib/config/constants';
	import { superForm } from 'sveltekit-superforms/client';
	import { userSchema, type UserSchema } from '$lib/config/zod-schemas';
	import { cn } from '$lib/utils';
	import * as Form from '$lib/components/ui/form';
	import * as Alert from '$lib/components/ui/alert';
	import { AlertCircle, Loader } from 'lucide-svelte';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import TwoFactorSettings from '$lib/components/settings/two-factor-settings.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import AvatarUpload from '$lib/components/avatar-upload.svelte';

	export let userProfileForm;
	export let passwordForm;
	export let companyForm;
	export let user;
	export let hasAdminPrivileges = false;
	export let handleAvatarUpdated
	const { form: userFormObj, enhance: userFormEnhance } = superForm(userProfileForm);
	const { form: companyFormObj, enhance: companyFormEnhance } = superForm(companyForm);
	const {
		form: passwordFormObj,
		enhance: passwordFormEnhance,
		errors: passwordErrors
	} = superForm(passwordForm);

	export let selectedTab: string;

	$: confirmPasswordError = $passwordErrors.confirmPassword;
	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 grid grid-cols-5 md:grow">
	<div
		class="col-span-5 md:col-span-1 md:border-r border-b md:border-b-0 border-gray-200 h-full flex flex-col gap-2 l pr-6"
	>
		<button
			on:click={() => (selectedTab = SETTINGS_MENU_OPTIONS.CLIENT_STAFF.PROFILE)}
			class={cn(
				'rounded-md hover:bg-gray-50 p-3 border border-white text-left',
				selectedTab === SETTINGS_MENU_OPTIONS.CLIENT_STAFF.PROFILE
					? 'bg-gray-50 border-gray-100'
					: ''
			)}>Profile</button
		>
		<button
			on:click={() => (selectedTab = SETTINGS_MENU_OPTIONS.CLIENT_STAFF.COMPANY)}
			class={cn(
				'rounded-md hover:bg-gray-50 p-3 border border-white text-left',
				selectedTab === SETTINGS_MENU_OPTIONS.CLIENT_STAFF.COMPANY
					? 'bg-gray-50 border-gray-100'
					: ''
			)}>Company Info</button
		>
		<button
			on:click={() => (selectedTab = SETTINGS_MENU_OPTIONS.CLIENT_STAFF.PASSWORD)}
			class={cn(
				'rounded-md hover:bg-gray-50 p-3 border border-white text-left',
				selectedTab === SETTINGS_MENU_OPTIONS.CLIENT_STAFF.PASSWORD
					? 'bg-gray-50 border-gray-100'
					: ''
			)}>Password</button
		>
		<button
			on:click={() => (selectedTab = SETTINGS_MENU_OPTIONS.CLIENT_STAFF.NOTIFICATIONS)}
			class={cn(
				'rounded-md hover:bg-gray-50 p-3 border border-white text-left',
				selectedTab === SETTINGS_MENU_OPTIONS.CLIENT_STAFF.NOTIFICATIONS
					? 'bg-gray-50 border-gray-100'
					: ''
			)}>Notifications</button
		>
	</div>
	<div class="col-span-5 md:col-span-4 pl-4 space-y-4">
		{#if selectedTab === SETTINGS_MENU_OPTIONS.CLIENT_STAFF.PROFILE}
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
					<div class="col-span-2 md:col-span-1">
						<AvatarUpload />
					</div>
				</div>
				<div class="mt-8">
					<Button class="bg-primary hover:bg-primary/90" type="submit">Save Changes</Button>
				</div>
			</form>
		{/if}
		{#if selectedTab === SETTINGS_MENU_OPTIONS.CLIENT_STAFF.COMPANY}
			<h2 class="text-3xl font-semibold">Company Details</h2>
			<form use:companyFormEnhance method="POST" class="space-y-8">
				<div class="grid grid-cols-2 gap-6">
					<div class="col-span-2 md:col-span-1">
						<Label for="companyName">Company Name</Label>
						<Input name="companyName" bind:value={$companyFormObj.companyName} />
					</div>

					<div class="col-span-2 md:col-span-1">
						<Label for="companyLogo">Company Logo</Label>
						<Input name="companyLogo" type="file" accept="image/*" />
					</div>

					<div class="col-span-2">
						<Label for="companyDescription">Company Description</Label>
						<Textarea
							name="companyDescription"
							bind:value={$companyFormObj.companyDescription}
							rows={4}
						/>
					</div>

					<div class="col-span-2">
						<Label for="baseLocation">Base Location</Label>
						<Input name="baseLocation" bind:value={$companyFormObj.baseLocation} />
					</div>

					<!-- Operating Hours Section -->
					<div class="col-span-2">
						<h3 class="text-xl font-semibold mb-4">Operating Hours</h3>
						<div class="space-y-4">
							{#each days as day, index}
								<!-- <div class="grid grid-cols-12 gap-4 items-center">
                            <div class="col-span-3">
                            <Label>{day}</Label>
                            </div>
                            <div class="col-span-2 flex items-center gap-2">
                            <Switch
                                id="closed-{index}"
                                checked={!$companyFormObj.operatingHours[index].isClosed}
                                on:change={() => $companyFormObj.operatingHours[index].isClosed = !$companyFormObj.operatingHours[index].isClosed}
                            />
                            <Label for="closed-{index}">Open</Label>
                            </div>
                            {#if !$companyFormObj.operatingHours[index].isClosed}
                            <div class="col-span-3">
                                <Input
                                type="time"
                                bind:value={$companyFormObj.operatingHours[index].openTime}
                                />
                            </div>
                            <div class="col-span-3">
                                <Input
                                type="time"
                                bind:value={$companyFormObj.operatingHours[index].closeTime}
                                />
                            </div>
                            {/if}
                        </div> -->
							{/each}
						</div>
					</div>
				</div>

				<div class="mt-8">
					<Button class="bg-primary hover:bg-primary/90" type="submit">Save Changes</Button>
				</div>
			</form>
		{/if}
		{#if selectedTab === SETTINGS_MENU_OPTIONS.CLIENT_STAFF.PASSWORD}
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
					<Button class="bg-primary hover:bg-primary/90" type="submit">Save Changes</Button>
				</div>
			</form>

			<div class="mt-10 max-w-2xl">
				<TwoFactorSettings enabled={Boolean(user?.twoFactorEnabled)} />
			</div>
		{/if}
	</div>
</div>
