<script lang="ts">
	import type { AppUser as User } from '$lib/server/auth';
	import { browser } from '$app/environment';

	import {
		LayoutGrid,
		CalendarDays,
		Briefcase,
		Building2,
		SquareUser,
		MessageCircle,
		Shield,
		Users,
		ScrollText,
		MessageCircleQuestion,
		FileClock
	} from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { USER_ROLES } from '$lib/config/constants';
	import Logo from '../logo/logo.svelte';
	import UserAvatarMenu from './user-avatar-menu.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/';

	export let user: User | null;
	export let isOfficeAdmin: boolean = false;
</script>

{#if browser}
	<header
		class="z-20 fixed left-0 top-0 bottom-0 w-20 h-full min-h-screen bg-primary flex flex-col"
	>
		<!-- Fixed header section with logo -->
		<div class="flex-shrink-0 p-3 pt-6 flex justify-center">
			<div class="">
				<Logo />
			</div>
		</div>

		<!-- Scrollable navigation links section -->
		<div class="flex-1 overflow-hidden justify-center">
			<nav class="h-full overflow-y-auto px-3 py-2 space-y-1">
				{#if user?.role === USER_ROLES.SUPERADMIN}
					{#if browser}
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/dashboard"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<LayoutGrid size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Dashboard</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/calendar"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<CalendarDays size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Calendar</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/inbox"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<MessageCircle size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Inbox</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/requisitions"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<Briefcase size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Requisitions</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/clients"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<Building2 size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Business Members</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/professionals"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<SquareUser size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Professional Members</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/timesheets"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<FileClock size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Timesheets</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/invoices"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<ScrollText size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Invoices</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/admin/menu"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<Shield size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Admin Menu</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{:else}
						<a
							href="/dashboard"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<LayoutGrid size={20} class="shrink-0" />
						</a>
						<a
							href="/calendar"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<CalendarDays size={20} class="shrink-0" />
						</a>
						<a
							href="/inbox"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<MessageCircle size={20} class="shrink-0" />
						</a>
						<a
							href="/requisitions"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<Briefcase size={20} class="shrink-0" />
						</a>
						<a
							href="/clients"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<Building2 size={20} class="shrink-0" />
						</a>
						<a
							href="/professionals"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<SquareUser size={20} class="shrink-0" />
						</a>
						<a
							href="/timesheets"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<FileClock size={20} class="shrink-0" />
						</a>
						<a
							href="/invoices"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<ScrollText size={20} class="shrink-0" />
						</a>
						<a
							href="/admin/menu"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<Shield size={20} class="shrink-0" />
						</a>
					{/if}
				{/if}

				{#if user?.role === USER_ROLES.CLIENT}
					{#if browser}
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/dashboard"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<LayoutGrid size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Dashboard</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/calendar"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<CalendarDays size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Calendar</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/locations"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<Building2 size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Locations</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/requisitions"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<Briefcase size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Requisitions</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/staff"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<Users size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Staff</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/timesheets"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<FileClock size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Timesheets</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/invoices"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<ScrollText size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Invoices</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/inbox"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<MessageCircle size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Inbox</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/support"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<MessageCircleQuestion size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Support</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{:else}
						<a
							href="/dashboard"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<LayoutGrid size={20} class="shrink-0" />
						</a>
						<a
							href="/calendar"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<CalendarDays size={20} class="shrink-0" />
						</a>
						<a
							href="/locations"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<Building2 size={20} class="shrink-0" />
						</a>
						<a
							href="/requisitions"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<Briefcase size={20} class="shrink-0" />
						</a>
						<a
							href="/staff"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<Users size={20} class="shrink-0" />
						</a>
						<a
							href="/timesheets"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<FileClock size={20} class="shrink-0" />
						</a>
						<a
							href="/invoices"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<ScrollText size={20} class="shrink-0" />
						</a>
						<a
							href="/inbox"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<MessageCircle size={20} class="shrink-0" />
						</a>
						<a
							href="/support"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<MessageCircleQuestion size={20} class="shrink-0" />
						</a>
					{/if}
				{/if}

				{#if user?.role === USER_ROLES.CLIENT_STAFF}
					{#if browser}
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/dashboard"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<LayoutGrid size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Dashboard</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/calendar"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<CalendarDays size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Calendar</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/requisitions"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<Briefcase size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Requisitions</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/locations"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<Building2 size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Locations</p>
							</Tooltip.Content>
						</Tooltip.Root>
						{#if isOfficeAdmin}
							<Tooltip.Root openDelay={100}>
								<Tooltip.Trigger asChild let:builder>
									<a
										href="/staff"
										use:builder.action
										{...builder}
										class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
									>
										<Users size={20} class="shrink-0" />
									</a>
								</Tooltip.Trigger>
								<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
									<p>Staff</p>
								</Tooltip.Content>
							</Tooltip.Root>
							<Tooltip.Root openDelay={100}>
								<Tooltip.Trigger asChild let:builder>
									<a
										href="/invoices"
										use:builder.action
										{...builder}
										class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
									>
										<ScrollText size={20} class="shrink-0" />
									</a>
								</Tooltip.Trigger>
								<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
									<p>Invoices</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{/if}
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/inbox"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<MessageCircle size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Inbox</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root openDelay={100}>
							<Tooltip.Trigger asChild let:builder>
								<a
									href="/support"
									use:builder.action
									{...builder}
									class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
								>
									<MessageCircleQuestion size={20} class="shrink-0" />
								</a>
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="bg-gray-900 text-white border-gray-700">
								<p>Support</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{:else}
						<a
							href="/dashboard"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<LayoutGrid size={20} class="shrink-0" />
						</a>
						<a
							href="/calendar"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<CalendarDays size={20} class="shrink-0" />
						</a>
						<a
							href="/requisitions"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<Briefcase size={20} class="shrink-0" />
						</a>
						<a
							href="/locations"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<Building2 size={20} class="shrink-0" />
						</a>
						{#if isOfficeAdmin}
							<a
								href="/staff"
								class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
							>
								<Users size={20} class="shrink-0" />
							</a>
							<a
								href="/invoices"
								class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
							>
								<ScrollText size={20} class="shrink-0" />
							</a>
						{/if}
						<a
							href="/inbox"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<MessageCircle size={20} class="shrink-0" />
						</a>
						<a
							href="/support"
							class="flex items-center justify-center w-10 h-10 rounded-lg mx-auto hover:bg-white transition-colors duration-200 text-white hover:text-primary"
						>
							<MessageCircleQuestion size={20} class="shrink-0" />
						</a>
					{/if}
				{/if}
			</nav>
		</div>

		<!-- Fixed footer section with user menu -->
		<div class="flex-shrink-0 p-3 flex justify-center">
			<UserAvatarMenu {user} />
		</div>
	</header>
{/if}
