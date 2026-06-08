<script lang="ts">
	import type { ClientCompanyLocation } from '$lib/server/database/schemas/client';
	import { CLIENT_STATUS, STAFF_ROLE_ENUM, USER_ROLES } from '$lib/config/constants';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import type { PageData } from './$types';
	import convertNameToInitials from '$lib/_helpers/convertNameToInitials';
	import { Download, Lock, Unlock, MoreHorizontal, Trash } from 'lucide-svelte';
	import FileDropzone from '$lib/components/file-upload.svelte';
	import { enhance as nativeEnhance } from '$app/forms';

	// ShadcnUI Components
	import { Button } from '$lib/components/ui/button';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import {
		Dialog,
		DialogTrigger,
		DialogClose,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import PhoneInput from '$lib/components/PhoneInput.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';

	// Lucide Icons
	import {
		AlertCircle,
		Briefcase,
		Building,
		Calendar as CalendarIcon,
		ChevronRight,
		ChevronLeft,
		Clock,
		ClipboardList,
		CreditCard,
		Edit,
		Eye,
		FilePlus,
		FileText,
		Mail,
		MapPin,
		MessageSquare,
		Phone,
		Plus,
		Receipt,
		User,
		Users,
		CalendarDays,
		UserMinus,
		Trash2,
		LayoutGrid
	} from 'lucide-svelte';

	// Table library
	import {
		getCoreRowModel,
		type ColumnDef,
		getSortedRowModel,
		getPaginationRowModel,
		type TableOptions,
		createSvelteTable,
		flexRender
	} from '@tanstack/svelte-table';

	// Other imports
	import { writable } from 'svelte/store';
	import { onMount, tick } from 'svelte';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import { cn } from '$lib/utils';
	import type { CalendarEvent } from '$lib/types';
	import { formatInTimeZone } from 'date-fns-tz';
	import { formatTimezoneName } from '$lib/_helpers/UTCTimezoneUtils';
	import { goto, invalidateAll } from '$app/navigation';
	import type {
		InvoiceSelect,
		InvoiceWithRelations
	} from '$lib/server/database/schemas/requisition';
	import { superForm } from 'sveltekit-superforms/client';
	import { env } from '$env/dynamic/public';
	import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
	import AddLocationDrawer from '$lib/components/drawers/addLocationDrawer.svelte';
	import InviteStaffDialog from '$lib/components/dialogs/inviteStaffDialog.svelte';
	import StaffLocationsDialog from '$lib/components/dialogs/staffLocationsDialog.svelte';
	import PendingInvitesTable from '$lib/components/PendingInvitesTable.svelte';
	import { UserPlus } from 'lucide-svelte';
	import AdminProfileComments from '$lib/views/admin/adminProfileComments.svelte';
	import { format } from 'date-fns';
	import * as Select from '$lib/components/ui/select';
	import { Trigger } from '$lib/components/ui/accordion';

	export let data: PageData;
	$: adminForm = data.requisitionForm;
	$: newLocationForm = data.locationForm;

	let requisitionView: 'table' | 'calendar' = 'table';
	let initials: string = '';
	let locationTableData: ClientCompanyLocation[] = [];
	let showInvoiceDialog = false;
	let selectedEvent: CalendarEvent | null = null;
	let dialogOpen: boolean = false;
	let detailsDialogOpen: boolean = false;
	let selectedProfile: StaffProfileData | null = null;
	let tableData: StaffProfileData[] = [];
	let invoiceTableData: InvoiceWithRelations[] = [];
	let setupCustomerLoading = false;
	let showSetupLinkDialog = false;
	let setupLink = '';
	let drawerExpanded = false;
	let locationDrawerExpanded = false;

	// Admin staff management dialogs
	let inviteStaffDialogOpen = false;
	let manageLocationsDialogOpen = false;
	let manageLocationsForStaff: {
		staffId: string;
		staffName: string;
		locationIds: string[];
		primaryLocationId: string | null;
	} | null = null;

	function openManageLocations(staffMember: any) {
		const assignments = staffMember.locationAssignments ?? [];
		manageLocationsForStaff = {
			staffId: staffMember.profile.id,
			staffName: `${staffMember.user.firstName} ${staffMember.user.lastName}`,
			locationIds: assignments.map((a: any) => a.locationId),
			primaryLocationId: assignments.find((a: any) => a.isPrimary)?.locationId ?? null
		};
		manageLocationsDialogOpen = true;
	}
	let editingSection: 'header' | 'personal' | 'billing' | null = null;
	let selectedInvoiceMethod: 'STRIPE' | 'PAPER' =
		data.client?.profile?.clientInvoiceMethod === 'PAPER' ? 'PAPER' : 'STRIPE';

	const {
		form: invoiceForm,
		enhance,
		submitting: invoiceFormSubmitting,
		errors: invoiceFormError
	} = superForm(data.invoiceForm, {
		resetForm: true,
		onSubmit: ({ formData }) => {
			// Force sync items into the form data at submit time
			formData.set('items', JSON.stringify(items));
			formData.set('amount', String(items.reduce((t, i) => t + i.amount, 0)));
		},
		onResult: ({ result }) => {
			if (result.type === 'success') {
				showInvoiceDialog = false;
				items = [{ description: '', quantity: 1, rate: 0, amount: 0 }];
			}
		}
	});

	$: $invoiceForm.invoiceMethod = selectedInvoiceMethod;

	const {
		form: updateForm,
		enhance: updateEnhance,
		submitting: updateSubmitting,
		errors: updateErrors
	} = superForm(data.updateClientForm, {
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editingSection = null;
				// Optionally reload to get fresh data
				// window.location.reload();
			}
		}
	});

	function cancelEdit() {
		// Reset form to original values
		if (client) {
			$updateForm = {
				firstName: client.user.firstName,
				lastName: client.user.lastName,
				email: client.user.email,
				companyName: client.company.companyName || '',
				baseLocation: client.company.baseLocation || ''
			};
		}
		editingSection = null;
	}

	// Mirror the professionals page status-dropdown pattern: imperatively set
	// the hidden input's value on change, then `form.submit()` for a full
	// post + reload. Avoids the superforms/requestSubmit DOM-flush race that
	// caused the dropdown to revert. The server action still validates with
	// superValidate, so this client-side simplification doesn't weaken the
	// server contract.
	function statusLabel(s: string | null | undefined) {
		switch (s) {
			case CLIENT_STATUS.ACTIVE:
				return 'Approved';
			case CLIENT_STATUS.DENIED:
				return 'Denied';
			case CLIENT_STATUS.INACTIVE:
				return 'Inactive';
			default:
				return 'Pending';
		}
	}

	type StaffProfileData = {
		profile: {
			id: string;
			userId: string;
			createdAt: Date;
			updatedAt: Date;
			birthday: string | null;
			clientId: string;
			companyId: string;
			staffRole: 'CLIENT_ADMIN' | 'CLIENT_MANAGER' | 'CLIENT_EMPLOYEE' | null;
		};
		user: {
			id: string;
			firstName: string;
			lastName: string;
			email: string;
			avatarUrl: string;
		};
		primaryLocation: {
			id: string;
			name: string;
			streetOne: string;
			streetTwo: string;
			city: string;
			state: string;
			zipcode: string;
			isPrimary: boolean;
		} | null;
	};

	type SupportTicket = {
		id: string;
		title: string;
		status: string | null;
		createdAt: string | Date;
		// Add other properties as needed
	};

	const selectEvent = (event: CalendarEvent) => {
		selectedEvent = event;
		dialogOpen = true;
	};

	// Reactive declarations
	$: user = data.user;
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;
	$: client = data.client;
	$: locations = data.client?.locations || [];
	$: requisitions = data.requisitions || [];
	$: recurrenceDays = data.recurrenceDays || [];
	$: supportTickets = data.supportTickets || [];
	$: staff = data.staff || [];
	$: invoices = data.invoices || [];

	$: {
		locationTableData = locations;
	}

	$: {
		if (client) {
			initials = convertNameToInitials(client.user.firstName, client.user.lastName);
		}
	}

	$: {
		invoiceTableData = invoices;
	}

	const supportColumns: ColumnDef<SupportTicket>[] = [
		{
			header: 'Title',
			accessorFn: (original) => original.title
		},
		{
			header: 'Status',
			id: 'status',
			accessorFn: (original) => original.status,
			cell: ({ getValue }) => {
				const status = getValue() as string;
				return flexRender(Badge, {
					value: status,
					class: cn(
						status === 'PENDING' && 'bg-yellow-300 hover:bg-yellow-400',
						status === 'NEW' && 'bg-green-400 hover:bg-bg-green-500',
						status === 'CLOSED' && 'bg-red-500 hover:bg-red-600'
					)
				});
			}
		},
		{
			header: 'Created At',
			accessorFn: (original) => new Date(original.createdAt).toLocaleDateString()
		}
	];

	const supportOptions = writable<TableOptions<SupportTicket>>({
		data: supportTickets,
		columns: supportColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: {
				pageSize: 5
			}
		}
	});

	// Table configuration for locations (unchanged)
	const locationColumns: ColumnDef<ClientCompanyLocation>[] = [
		{
			header: 'Name',
			accessorFn: (original) => original.name
		},
		{
			header: 'Address',
			accessorFn: (original) => original.completeAddress
		}
	];

	const locationOptions = writable<TableOptions<ClientCompanyLocation>>({
		data: locationTableData,
		columns: locationColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(), // Add this line
		initialState: {
			pagination: {
				pageSize: 5 // Add this configuration
			}
		}
	});

	// Staff table configuration with pagination
	const staffColumns: ColumnDef<StaffProfileData>[] = [
		{
			header: 'Name',
			id: 'last_name',
			accessorFn: (original) => `${original.user.lastName}, ${original.user.firstName}`
		},
		{
			header: 'Email',
			id: 'email',
			accessorFn: (original) => original.user.email
		},
		{
			header: 'Role',
			id: 'role',
			accessorFn: (original) => {
				const role = original.profile.staffRole as keyof typeof STAFF_ROLE_ENUM;
				return STAFF_ROLE_ENUM[role];
			}
		}
	];

	const staffOptions = writable<TableOptions<StaffProfileData>>({
		data: tableData,
		columns: staffColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: {
				pageSize: 5
			}
		}
	});

	// Invoice table configuration with pagination
	const invoiceColumns: ColumnDef<InvoiceWithRelations>[] = [
		{
			header: 'Invoice ID',
			accessorFn: (original) => original.invoice.invoiceNumber
		},
		{
			header: 'Amount',
			accessorFn: (original) => {
				const amount = original.invoice.amountDue || original.invoice.total || 0;
				return `$${(+amount).toFixed(2)}`;
			}
		},
		{
			header: 'Status',
			accessorFn: (original) => original.invoice.status,
			cell: ({ getValue }) => {
				const status = getValue() as string;
				return flexRender(Badge, {
					value: status.toLocaleUpperCase(),
					class: cn(
						status === 'open' && 'bg-blue-500 hover:bg-blue-600',
						status === 'paid' && 'bg-green-400 hover:bg-bg-green-500',
						status === 'void' && 'bg-gray-300 hover:bg-gray-400'
					)
				});
			}
		},
		{
			header: 'Due Date',
			accessorFn: (original) => {
				const dueDate = original.invoice.dueDate;
				return dueDate ? new Date(dueDate).toLocaleDateString() : 'No due date';
			}
		},
		{
			header: 'Created',
			accessorFn: (original) => new Date(original.invoice.createdAt).toLocaleDateString()
		}
	];

	const invoiceOptions = writable<TableOptions<InvoiceWithRelations>>({
		data: invoiceTableData,
		columns: invoiceColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: {
				pageSize: 5
			}
		}
	});

	$: {
		locationTableData = (locations as ClientCompanyLocation[]) ?? [];
		locationOptions.update((o) => ({ ...o, data: locationTableData }));

		tableData = (staff as StaffProfileData[]) || [];
		staffOptions.update((o) => ({ ...o, data: tableData }));

		invoiceTableData = invoices || [];
		invoiceOptions.update((o) => ({ ...o, data: invoiceTableData }));
		supportOptions.update((o) => ({ ...o, data: supportTickets }));
		requisitionOptions.update((o) => ({ ...o, data: requisitions }));
	}

	onMount(() => {
		locationTableData = (locations as ClientCompanyLocation[]) ?? [];
		locationOptions.update((o) => ({ ...o, data: locationTableData }));

		tableData = (staff as StaffProfileData[]) || [];
		staffOptions.update((o) => ({ ...o, data: tableData }));

		invoiceTableData = invoices || [];
		invoiceOptions.update((o) => ({ ...o, data: invoiceTableData }));
		supportOptions.update((o) => ({ ...o, data: supportTickets }));
		requisitionOptions.update((o) => ({ ...o, data: requisitions })); // ADD THIS
	});

	const requisitionColumns: ColumnDef<any>[] = [
		{
			header: 'Position',
			accessorFn: (original) => original.disciplineName,
			cell: ({ row }) => {
				const requisition = row.original;
				return {
					disciplineName: requisition.disciplineName,
					id: requisition.id,
					locationName: requisition.locationName || 'No location'
				};
			}
		},
		{
			header: 'Status',
			accessorFn: (original) => original.status
		},
		{
			header: 'Type',
			accessorKey: 'permanentPosition',
			cell: ({ getValue, row }) => {
				return getValue() ? 'Permanent' : 'Temporary';
			},
			enableSorting: true
		},
		{
			header: 'Rate',
			accessorFn: (original) => original.hourlyRate
		}
	];

	const requisitionOptions = writable<TableOptions<any>>({
		data: requisitions,
		columns: requisitionColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: {
				pageSize: 10
			}
		}
	});

	const locationTable = createSvelteTable(locationOptions);
	const staffTable = createSvelteTable(staffOptions);
	const invoiceTable = createSvelteTable(invoiceOptions);
	const supportTable = createSvelteTable(supportOptions);
	const requisitionTable = createSvelteTable(requisitionOptions);

	function addInvoiceItem() {
		items = [...items, { description: '', quantity: 1, rate: 0, amount: 0 }];
	}

	function removeInvoiceItem(index: number) {
		if (items.length > 1) {
			items = items.filter((_, i) => i !== index);
		}
	}

	function updateItemAmount(index: number) {
		const item = items[index];
		if (item) {
			item.amount = (item.quantity || 0) * (item.rate || 0);
			items = [...items];
		}
	}

	const handleViewStaff = (profile: StaffProfileData) => {
		selectedProfile = profile;
		detailsDialogOpen = true;
	};

	const handleCloseDetailsDialog = () => {
		detailsDialogOpen = false;
		selectedProfile = null;
	};

	$: $invoiceForm.amount = items.reduce((total, item) => total + item.amount, 0);
	// Separate reactive variable for items management
	let items = [{ description: '', quantity: 1, rate: 0, amount: 0 }];

	// Sync items to form whenever items change
	$: $invoiceForm.items = JSON.stringify(items);
	// Check if we need to show Setup Customer button
	$: isInternalInstance = env.PUBLIC_APP_ENV === 'INTERNAL';
	$: needsCustomerSetup =
		isInternalInstance &&
		selectedInvoiceMethod === 'STRIPE' &&
		(!data.client?.subscription?.stripeCustomerId ||
			data.client?.subscription?.stripeCustomerSetupPending);

	async function handleSetupCustomer() {
		setupCustomerLoading = true;
		try {
			const response = await fetch('/api/stripe/setup-customer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ clientId: client?.profile.id })
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to create setup session');
			}

			const { url } = await response.json();
			setupLink = url;
			showSetupLinkDialog = true;
		} catch (error) {
			console.error('Error setting up customer:', error);
			alert('Failed to create setup link. Please try again.');
		} finally {
			setupCustomerLoading = false;
		}
	}

	// function sendViaStripe() {
	// 	// Stripe will email the link to the customer automatically
	// 	alert('Stripe will send the setup link to ' + client.user.email);
	// 	showSetupLinkDialog = false;
	// }

	function copySetupLink() {
		navigator.clipboard.writeText(setupLink);
		alert('Link copied to clipboard!');
	}

	let uploadDocumentDialogOpen = false;
	let uploadDocumentType: 'LICENSE' | 'CERTIFICATE' | 'AGREEMENT' | 'OTHER' = 'OTHER';
	let uploadDocumentAdminOnly = false;
	let clientDocsUrlString = '';
	let clientDocsFileString = '';

	async function handleClientDocumentUpload(file: File) {
		if (!file) return;

		const formData = new FormData();
		formData.append('file', file);
		formData.append('location', 'client-documents');

		const response = await fetch('/api/uploadFile', { method: 'POST', body: formData });
		if (!response.ok) throw new Error('Upload failed');

		const { url, fileName } = await response.json();
		clientDocsUrlString = url;
		clientDocsFileString = fileName;

		await tick();

		const form = document.getElementById('client-documents-form') as HTMLFormElement;
		if (form) form.requestSubmit();
	}
</script>

{#if client}
	<section class="container mx-auto px-4 py-6">
		<div class="flex flex-col gap-6">
			<!-- Header with client info -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<div class="flex flex-col md:flex-row gap-6 items-start md:items-center">
					<div class="h-24 w-24 md:h-32 md:w-32 relative">
						{#if client.user.avatarUrl}
							<img
								src={client.user.avatarUrl}
								alt={`${client.user.firstName} ${client.user.lastName}`}
								class="rounded-lg h-full w-full object-cover"
							/>
						{:else}
							<div class="bg-gray-300 rounded-lg h-full w-full flex items-center justify-center">
								<span class="text-4xl md:text-5xl font-semibold">{initials}</span>
							</div>
						{/if}
					</div>

					<div class="flex-1">
						{#if editingSection === 'header'}
							<!-- Edit Mode -->
							<form method="POST" action="?/updateClient" use:updateEnhance>
								<div class="space-y-4">
									<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div>
											<Label for="firstName">First Name</Label>
											<Input
												id="firstName"
												name="firstName"
												bind:value={$updateForm.firstName}
												class={$updateErrors.firstName ? 'border-red-500' : ''}
											/>
											{#if $updateErrors.firstName}
												<p class="text-sm text-red-500 mt-1">{$updateErrors.firstName}</p>
											{/if}
										</div>
										<div>
											<Label for="lastName">Last Name</Label>
											<Input
												id="lastName"
												name="lastName"
												bind:value={$updateForm.lastName}
												class={$updateErrors.lastName ? 'border-red-500' : ''}
											/>
											{#if $updateErrors.lastName}
												<p class="text-sm text-red-500 mt-1">{$updateErrors.lastName}</p>
											{/if}
										</div>
									</div>
									<div>
										<Label for="companyName">Company Name</Label>
										<Input
											id="companyName"
											name="companyName"
											bind:value={$updateForm.companyName}
											class={$updateErrors.companyName ? 'border-red-500' : ''}
										/>
										{#if $updateErrors.companyName}
											<p class="text-sm text-red-500 mt-1">{$updateErrors.companyName}</p>
										{/if}
									</div>
									<div class="flex gap-2">
										<Button type="submit" size="sm" disabled={$updateSubmitting}>
											{$updateSubmitting ? 'Saving...' : 'Save'}
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											on:click={cancelEdit}
											disabled={$updateSubmitting}
										>
											Cancel
										</Button>
									</div>
								</div>
							</form>
						{:else}
							<!-- View Mode -->
							<div class="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
								<div>
									<div class="flex items-center gap-2">
										<h1 class="text-3xl md:text-4xl font-bold">
											{client.user.firstName}
											{client.user.lastName}
										</h1>
										{#if isAdmin}
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8"
												on:click={() => (editingSection = 'header')}
											>
												<Edit class="h-4 w-4" />
											</Button>
										{/if}
									</div>
									<div class="mt-2 text-xl font-medium text-gray-700">
										{client.company.companyName}
									</div>
								</div>

								<div class="flex gap-2 mt-3 md:mt-0 items-center flex-wrap">
									{#if isAdmin}
										<div class="flex items-center gap-2">
											<StatusBadge
												status={client.profile.status}
												label={statusLabel(client.profile.status)}
											/>
											<form
												use:nativeEnhance
												id="client-status-form"
												action="?/updateStatus"
												method="POST"
												class="flex items-center gap-1"
											>
												<Select.Root
													preventScroll={false}
													selected={{
														value: client.profile.status,
														label: statusLabel(client.profile.status)
													}}
													onSelectedChange={(selected) => {
														if (selected) {
															const form = document.getElementById('client-status-form');
															const hiddenInput = form?.querySelector('input[name="status"]');
															hiddenInput.value = selected.value;
															form?.submit();
														}
													}}
												>
													<Select.Trigger class="h-8 w-32 bg-white">
														<Select.Value />
													</Select.Trigger>
													<Select.Content>
														<Select.Item value="PENDING">Pending</Select.Item>
														<Select.Item value="ACTIVE">Approved</Select.Item>
														<Select.Item value="INACTIVE">Inactive</Select.Item>
														<Select.Item value="DENIED">Denied</Select.Item>
													</Select.Content>
													<Select.Input
														type="hidden"
														name="status"
														value={client.profile.status}
													/>
												</Select.Root>
											</form>
										</div>
									{/if}
									{#if needsCustomerSetup}
										<Button
											variant="outline"
											size="sm"
											class="gap-1"
											on:click={handleSetupCustomer}
											disabled={setupCustomerLoading}
										>
											<CreditCard class="h-4 w-4" />
											<span>
												{#if setupCustomerLoading}
													Creating Link...
												{:else if data.client?.subscription?.stripeCustomerSetupPending}
													Resend Setup Link
												{:else}
													Setup Customer
												{/if}
											</span>
										</Button>
									{:else}
										<Button
											variant="outline"
											size="sm"
											class="gap-1"
											on:click={() => (showInvoiceDialog = true)}
										>
											<CreditCard class="h-4 w-4" />
											<span>Create Invoice</span>
										</Button>
									{/if}
								</div>
							</div>

							<div class="mt-4 flex flex-col sm:flex-row gap-4 text-sm">
								<div class="flex items-center gap-2">
									<Mail class="h-4 w-4 text-gray-500" />
									<a href={`mailto:${client.user.email}`} class="text-blue-600 hover:underline">
										{client.user.email}
									</a>
								</div>
								{#if needsCustomerSetup}
									<div class="flex items-center gap-2">
										<AlertCircle class="h-4 w-4 text-orange-500" />
										<span class="text-orange-600 font-medium">Payment method setup pending</span>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- One-off Invoice Dialog -->
			<Dialog bind:open={showInvoiceDialog}>
				<DialogContent class="sm:max-w-[600px] max-h-screen overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Create One-Off Invoice</DialogTitle>
						<DialogDescription>
							Create a custom invoice for this client. Fill in all the necessary details below.
						</DialogDescription>
					</DialogHeader>

					<form method="POST" action="?/createInvoice" use:enhance>
						<div class="grid gap-4 py-4">
							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-2">
									<Label for="dueDate">Due Date</Label>
									<Input
										id="dueDate"
										name="dueDate"
										type="date"
										bind:value={$invoiceForm.dueDate}
									/>
									{#if $invoiceFormError.dueDate}
										<p class="text-sm text-destructive">{$invoiceFormError.dueDate}</p>
									{/if}
								</div>
							</div>
							<div class="space-y-2">
								<Label>Invoice Method</Label>
								<Select.Root
									selected={{ value: selectedInvoiceMethod, label: selectedInvoiceMethod }}
									onSelectedChange={(v) => {
										if (v) selectedInvoiceMethod = v.value;
									}}
								>
									<Select.Trigger>
										<Select.Value placeholder="Select invoice method" />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="STRIPE">Electronic (Stripe)</Select.Item>
										<Select.Item value="PAPER">Paper Invoice</Select.Item>
									</Select.Content>
								</Select.Root>
								<input type="hidden" name="invoiceMethod" bind:value={$invoiceForm.invoiceMethod} />
								{#if selectedInvoiceMethod === 'PAPER'}
									<p class="text-xs text-muted-foreground">
										A paper invoice will be created and tracked manually. No Stripe charge will be
										initiated.
									</p>
								{/if}
							</div>
							<div class="space-y-2">
								<div class="flex items-center justify-between">
									<Label>Invoice Items</Label>
									<Button
										type="button"
										variant="outline"
										size="sm"
										on:click={addInvoiceItem}
										class="gap-1"
									>
										<Plus class="h-4 w-4" />
										<span>Add Item</span>
									</Button>
								</div>

								<div class="border rounded-md">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Description</TableHead>
												<TableHead class="w-20">Qty</TableHead>
												<TableHead class="w-24">Rate</TableHead>
												<TableHead class="w-24">Amount</TableHead>
												<TableHead class="w-12"></TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{#each items as item, i}
												<TableRow>
													<TableCell>
														<Input bind:value={item.description} placeholder="Item description" />
													</TableCell>
													<TableCell>
														<Input
															type="number"
															bind:value={item.quantity}
															on:input={() => updateItemAmount(i)}
															min="1"
														/>
													</TableCell>
													<TableCell>
														<Input
															type="number"
															bind:value={item.rate}
															on:input={() => updateItemAmount(i)}
															min="0"
															step="0.01"
														/>
													</TableCell>
													<TableCell>
														${(item.amount || 0).toFixed(2)}
													</TableCell>
													<TableCell>
														<Button
															type="button"
															variant="ghost"
															size="sm"
															class="h-8 w-8 p-0 text-destructive hover:text-destructive"
															on:click={() => removeInvoiceItem(i)}
															disabled={items.length <= 1}
														>
															<Trash2 class="h-4 w-4" />
														</Button>
													</TableCell>
												</TableRow>
											{/each}
											<TableRow>
												<TableCell colspan={4} class="text-right font-bold">Total:</TableCell>
												<TableCell class="font-bold"
													>${($invoiceForm.amount || 0).toFixed(2)}</TableCell
												>
											</TableRow>
										</TableBody>
									</Table>
								</div>
								{#if $invoiceFormError.items}
									<p class="text-sm text-destructive">{$invoiceFormError.items}</p>
								{/if}
							</div>

							<div class="space-y-2">
								<Label for="description">Additional Notes</Label>
								<Textarea
									id="description"
									name="description"
									bind:value={$invoiceForm.description}
									placeholder="Add any additional notes or information"
								/>
								{#if $invoiceFormError.description}
									<p class="text-sm text-destructive">{$invoiceFormError.description}</p>
								{/if}
							</div>

							<!-- Hidden fields to sync with form -->
							<input type="hidden" name="items" bind:value={$invoiceForm.items} />
							<input type="hidden" name="amount" bind:value={$invoiceForm.amount} />
						</div>

						<DialogFooter>
							<Button type="button" variant="outline" on:click={() => (showInvoiceDialog = false)}
								>Cancel
							</Button>
							<Button type="submit" disabled={$invoiceFormSubmitting}>
								{#if $invoiceFormSubmitting}
									Creating...
								{:else}
									Create Invoice
								{/if}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<!-- Tabs section -->
			<Tabs class="w-full">
				<TabsList class="w-full md:w-auto  gap-2 h-fit">
					<TabsTrigger value="profile" class="flex items-center gap-2">
						<Users class="h-4 w-4" />
						<span class="hidden md:inline">Profile</span>
					</TabsTrigger>
					<TabsTrigger value="locations" class="flex items-center gap-2">
						<Building class="h-4 w-4" />
						<span class="hidden md:inline">Locations</span>
					</TabsTrigger>
					<TabsTrigger value="requisitions" class="flex items-center gap-2">
						<ClipboardList class="h-4 w-4" />
						<span class="hidden md:inline">Requisitions</span>
					</TabsTrigger>
					<TabsTrigger value="documents" class="flex items-center gap-2">
						<FileText class="h-4 w-4" />
						<span class="hidden md:inline">Documents</span>
					</TabsTrigger>
					<TabsTrigger value="support" class="flex items-center gap-2">
						<MessageSquare class="h-4 w-4" />
						<span class="hidden md:inline">Support</span>
					</TabsTrigger>
				</TabsList>

				<!-- Profile Tab -->
				<TabsContent value="profile" class="mt-6">
					<div class="grid md:grid-cols-4 gap-6">
						<!-- Personal Details -->
						<Card class="w-full max-w-none col-span-4 md:col-span-2">
							<CardHeader class="flex flex-row items-center justify-between">
								<CardTitle class="flex items-center gap-2">
									<User class="h-5 w-5 text-blue-600" />
									<span>Personal Details</span>
								</CardTitle>
								{#if isAdmin && editingSection !== 'personal'}
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8"
										on:click={() => (editingSection = 'personal')}
									>
										<Edit class="h-4 w-4" />
									</Button>
								{/if}
							</CardHeader>
							<CardContent class="space-y-4">
								{#if editingSection === 'personal'}
									<!-- Edit Mode -->
									<form method="POST" action="?/updateClient" use:updateEnhance>
										<div class="space-y-4">
											<div>
												<Label for="personal-email">Email</Label>
												<Input
													id="personal-email"
													name="email"
													type="email"
													bind:value={$updateForm.email}
													class={$updateErrors.email ? 'border-red-500' : ''}
												/>
												{#if $updateErrors.email}
													<p class="text-sm text-red-500 mt-1">{$updateErrors.email}</p>
												{/if}
											</div>
											<div>
												<Label for="base-location">Base Location</Label>
												<Input
													id="base-location"
													name="baseLocation"
													bind:value={$updateForm.baseLocation}
												/>
											</div>
											<div>
												<Label for="base-location">Cell Phone</Label>
												<PhoneInput
													id="cell-phone"
													name="cellPhone"
													bind:value={$updateForm.cellPhone}
												/>
											</div>

											<!-- Hidden fields to preserve other data -->
											<input type="hidden" name="firstName" bind:value={$updateForm.firstName} />
											<input type="hidden" name="lastName" bind:value={$updateForm.lastName} />
											<input
												type="hidden"
												name="companyName"
												bind:value={$updateForm.companyName}
											/>

											<div class="flex gap-2">
												<Button type="submit" size="sm" disabled={$updateSubmitting}>
													{$updateSubmitting ? 'Saving...' : 'Save'}
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													on:click={cancelEdit}
													disabled={$updateSubmitting}
												>
													Cancel
												</Button>
											</div>
										</div>
									</form>
								{:else}
									<!-- View Mode -->
									<div>
										<h3 class="text-sm font-medium">Email:</h3>
										<p>{client.user.email}</p>
									</div>

									<div>
										<h3 class="text-sm font-medium">Base Location:</h3>
										<p>{client.company?.baseLocation || 'None Specified'}</p>
									</div>
									<div>
										<h3 class="text-sm font-medium">Cell Phone</h3>
										<p>{client.profile.cellPhone || 'None Specified'}</p>
									</div>
								{/if}
							</CardContent>
						</Card>

						<!-- Billing Information -->
						<Card class="w-full max-w-none col-span-4 md:col-span-2">
							<CardHeader class="flex flex-row items-center justify-between">
								<CardTitle class="flex items-center gap-2">
									<CreditCard class="h-5 w-5 text-blue-600" />
									<span>Billing Information</span>
								</CardTitle>
								{#if isAdmin && editingSection !== 'billing'}
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8"
										on:click={() => (editingSection = 'billing')}
									>
										<Edit class="h-4 w-4" />
									</Button>
								{/if}
							</CardHeader>
							<CardContent class="space-y-4">
								{#if editingSection === 'billing'}
									<!-- Edit Mode -->
									<form method="POST" action="?/updateClient" use:updateEnhance>
										<div class="space-y-4">
											<div class="grid grid-cols-2 gap-4">
												<div>
													<Label for="billing-firstName">First Name</Label>
													<Input
														id="billing-firstName"
														name="firstName"
														bind:value={$updateForm.firstName}
														class={$updateErrors.firstName ? 'border-red-500' : ''}
													/>
													{#if $updateErrors.firstName}
														<p class="text-sm text-red-500 mt-1">{$updateErrors.firstName}</p>
													{/if}
												</div>
												<div>
													<Label for="billing-lastName">Last Name</Label>
													<Input
														id="billing-lastName"
														name="lastName"
														bind:value={$updateForm.lastName}
														class={$updateErrors.lastName ? 'border-red-500' : ''}
													/>
													{#if $updateErrors.lastName}
														<p class="text-sm text-red-500 mt-1">{$updateErrors.lastName}</p>
													{/if}
												</div>
											</div>
											<div>
												<Label for="billing-email">Billing Email</Label>
												<Input
													id="billing-email"
													name="email"
													type="email"
													bind:value={$updateForm.email}
													class={$updateErrors.email ? 'border-red-500' : ''}
												/>
												{#if $updateErrors.email}
													<p class="text-sm text-red-500 mt-1">{$updateErrors.email}</p>
												{/if}
											</div>
											<div>
												<Label for="invoice-method">Invoicing Method</Label>
												<Select.Root
													onSelectedChange={(v) => {
														v && ($updateForm.invoiceMethod = v.value);
													}}
												>
													<Select.Trigger>
														<Select.Value placeholder={$updateForm.invoiceMethod} />
													</Select.Trigger>
													<Select.Content>
														<Select.Item value="STRIPE">STRIPE</Select.Item>
														<Select.Item value="PAPER">PAPER</Select.Item>
													</Select.Content>
													<Input
														name="invoiceMethod"
														type="hidden"
														value={$updateForm.invoiceMethod}
													/>
												</Select.Root>
												{#if $updateErrors.invoiceMethod}
													<p class="text-sm text-red-500 mt-1">{$updateErrors.invoiceMethod}</p>
												{/if}
											</div>

											<!-- Hidden fields -->
											<input
												type="hidden"
												name="companyName"
												bind:value={$updateForm.companyName}
											/>
											<input
												type="hidden"
												name="baseLocation"
												bind:value={$updateForm.baseLocation}
											/>

											<div class="flex gap-2">
												<Button type="submit" size="sm" disabled={$updateSubmitting}>
													{$updateSubmitting ? 'Saving...' : 'Save'}
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													on:click={cancelEdit}
													disabled={$updateSubmitting}
												>
													Cancel
												</Button>
											</div>
										</div>
									</form>
								{:else}
									<!-- View Mode -->
									<div>
										<h3 class="text-sm font-medium">Billing Contact:</h3>
										<p>{client.user.firstName} {client.user.lastName}</p>
									</div>
									<div>
										<h3 class="text-sm font-medium">Billing Email:</h3>
										<p>{client.user.email}</p>
									</div>
									<div>
										<h3 class="text-sm font-medium">Invoice Method:</h3>
										<p>{client.profile.clientInvoiceMethod}</p>
									</div>
								{/if}
							</CardContent>
						</Card>

						<!-- Recent Invoices -->
						<Card class="w-full max-w-none col-span-4">
							<CardHeader class="flex flex-row items-center justify-between">
								<CardTitle class="flex items-center gap-2">
									<Receipt class="h-5 w-5 text-blue-600" />
									<span>Invoices</span>
								</CardTitle>
								<Button
									variant="outline"
									size="sm"
									class="gap-1"
									on:click={() => (showInvoiceDialog = true)}
								>
									<Plus class="h-4 w-4" />
									<span>New Invoice</span>
								</Button>
							</CardHeader>
							<CardContent>
								{#if invoices && invoices.length > 0}
									<div class="rounded-md border">
										<Table>
											<TableHeader>
												{#each $invoiceTable.getHeaderGroups() as headerGroup}
													<TableRow>
														{#each headerGroup.headers as header}
															<TableHead>
																<svelte:component
																	this={flexRender(
																		header.column.columnDef.header,
																		header.getContext()
																	)}
																/>
															</TableHead>
														{/each}
														<TableHead class="text-right">Actions</TableHead>
													</TableRow>
												{/each}
											</TableHeader>
											<TableBody>
												{#each $invoiceTable.getRowModel().rows as row}
													<TableRow>
														{#each row.getVisibleCells() as cell}
															<TableCell>
																<svelte:component
																	this={flexRender(cell.column.columnDef.cell, cell.getContext())}
																/>
															</TableCell>
														{/each}
														<TableCell class="text-right">
															<div class="flex justify-end gap-2">
																<Button
																	href={`/invoices/${row.getAllCells()[0].row.original.invoice.id}`}
																	variant="ghost"
																	size="icon"
																	class="h-8 w-8"
																>
																	<Eye class="h-4 w-4" />
																</Button>
															</div>
														</TableCell>
													</TableRow>
												{/each}
											</TableBody>
										</Table>
									</div>

									<!-- Invoice Pagination Controls -->
									<div class="flex items-center justify-between space-x-2 py-4">
										<div class="flex-1 text-sm text-muted-foreground">
											Showing {$invoiceTable.getState().pagination.pageIndex *
												$invoiceTable.getState().pagination.pageSize +
												1} to {Math.min(
												($invoiceTable.getState().pagination.pageIndex + 1) *
													$invoiceTable.getState().pagination.pageSize,
												$invoiceTable.getFilteredRowModel().rows.length
											)} of {$invoiceTable.getFilteredRowModel().rows.length} invoices
										</div>
										<div class="flex items-center space-x-2">
											<Button
												variant="outline"
												size="sm"
												on:click={() => $invoiceTable.previousPage()}
												disabled={!$invoiceTable.getCanPreviousPage()}
											>
												<ChevronLeft class="h-4 w-4" />
												Previous
											</Button>
											<Button
												variant="outline"
												size="sm"
												on:click={() => $invoiceTable.nextPage()}
												disabled={!$invoiceTable.getCanNextPage()}
											>
												Next
												<ChevronRight class="h-4 w-4" />
											</Button>
										</div>
									</div>
								{:else}
									<div class="flex flex-col items-center justify-center py-6 text-center">
										<Receipt class="h-12 w-12 text-gray-300 mb-2" />
										<h3 class="text-lg font-medium">No Invoices</h3>
										<p class="text-sm text-gray-500 mb-4">
											This client doesn't have any invoices yet.
										</p>
										<Button
											variant="outline"
											size="sm"
											class="gap-1"
											on:click={() => (showInvoiceDialog = true)}
										>
											<Plus class="h-4 w-4" />
											<span>Create First Invoice</span>
										</Button>
									</div>
								{/if}
							</CardContent>
						</Card>

						<!-- Staff -->
						<Card class="w-full max-w-none col-span-4">
							<CardHeader class="flex flex-row items-center justify-between">
								<CardTitle class="flex items-center gap-2">
									<Users class="h-5 w-5 text-blue-600" />
									<span>Client Staff</span>
								</CardTitle>
								{#if isAdmin}
									<Button
										size="sm"
										class="bg-blue-700 hover:bg-blue-800 gap-1"
										on:click={() => (inviteStaffDialogOpen = true)}
										disabled={!data.client?.locations?.length}
										title={data.client?.locations?.length
											? ''
											: 'Add a location before inviting staff'}
									>
										<UserPlus class="h-4 w-4" />
										Invite Staff
									</Button>
								{/if}
							</CardHeader>
							<CardContent>
								{#if staff && staff.length > 0}
									<div class="rounded-md border">
										<Table>
											<TableHeader>
												{#each $staffTable.getHeaderGroups() as headerGroup}
													<TableRow>
														{#each headerGroup.headers as header}
															<TableHead>
																<svelte:component
																	this={flexRender(
																		header.column.columnDef.header,
																		header.getContext()
																	)}
																/>
															</TableHead>
														{/each}
														<TableHead class="text-right">Actions</TableHead>
													</TableRow>
												{/each}
											</TableHeader>
											<TableBody>
												{#each $staffTable.getRowModel().rows as row}
													<TableRow>
														{#each row.getVisibleCells() as cell}
															<TableCell>
																<svelte:component
																	this={flexRender(cell.column.columnDef.cell, cell.getContext())}
																/>
															</TableCell>
														{/each}
														<TableCell class="text-right">
															<div class="flex justify-end gap-2">
																<Button
																	on:click={() => openManageLocations(row.original)}
																	variant="ghost"
																	size="icon"
																	class="h-8 w-8"
																	title="Manage locations"
																>
																	<MapPin class="h-4 w-4" />
																</Button>
																<Button
																	on:click={() => handleViewStaff(row.original)}
																	variant="ghost"
																	size="icon"
																	class="h-8 w-8"
																>
																	<Eye class="h-4 w-4" />
																</Button>
															</div>
														</TableCell>
													</TableRow>
												{/each}
											</TableBody>
										</Table>
									</div>

									<!-- Staff Pagination Controls -->
									<div class="flex items-center justify-between space-x-2 py-4">
										<div class="flex-1 text-sm text-muted-foreground">
											Showing {$staffTable.getState().pagination.pageIndex *
												$staffTable.getState().pagination.pageSize +
												1} to {Math.min(
												($staffTable.getState().pagination.pageIndex + 1) *
													$staffTable.getState().pagination.pageSize,
												$staffTable.getFilteredRowModel().rows.length
											)} of {$staffTable.getFilteredRowModel().rows.length} staff members
										</div>
										<div class="flex items-center space-x-2">
											<Button
												variant="outline"
												size="sm"
												on:click={() => $staffTable.previousPage()}
												disabled={!$staffTable.getCanPreviousPage()}
											>
												<ChevronLeft class="h-4 w-4" />
												Previous
											</Button>
											<Button
												variant="outline"
												size="sm"
												on:click={() => $staffTable.nextPage()}
												disabled={!$staffTable.getCanNextPage()}
											>
												Next
												<ChevronRight class="h-4 w-4" />
											</Button>
										</div>
									</div>
								{:else}
									<div class="flex flex-col items-center justify-center py-6 text-center">
										<Users class="h-12 w-12 text-gray-300 mb-2" />
										<h3 class="text-lg font-medium">No Staff</h3>
										<p class="text-sm text-gray-500">
											This client doesn't have any staff members yet.
										</p>
									</div>
								{/if}

								{#if isAdmin && (data.pendingInvites?.length ?? 0) > 0}
									<div class="mt-6">
										<h3 class="text-sm font-medium text-muted-foreground mb-2">
											Pending Invites ({data.pendingInvites.length})
										</h3>
										<PendingInvitesTable
											invites={data.pendingInvites}
											resendAction="?/resendStaffInvite"
											revokeAction="?/revokeStaffInvite"
										/>
									</div>
								{/if}
							</CardContent>
						</Card>
						{#if isAdmin}
							<Card class="w-full max-w-none col-span-4">
								<CardHeader class="pb-3">
									<CardTitle class="text-blue-600 flex items-center gap-2 text-lg">
										<MessageSquare class="h-4 w-4" />
										Admin Notes
									</CardTitle>
								</CardHeader>
								<CardContent class="pt-0">
									<AdminProfileComments
										comments={data.comments}
										currentUserId={user.id}
										addAction="?/addComment"
										deleteAction="?/deleteComment"
									/>
								</CardContent>
							</Card>
						{/if}
					</div>
				</TabsContent>

				<!-- Locations Tab -->
				<TabsContent value="locations" class="mt-6">
					<Card class="w-full max-w-none">
						<CardHeader class="flex flex-row items-center justify-between">
							<CardTitle>Client Locations</CardTitle>
							{#if isAdmin}
								<AddLocationDrawer
									{newLocationForm}
									company={data.client?.company}
									bind:open={locationDrawerExpanded}
								/>
							{/if}
						</CardHeader>
						<CardContent>
							{#if !locationTableData || locationTableData.length === 0}
								<div class="flex flex-col items-center justify-center py-8 text-center">
									<Building class="h-12 w-12 text-gray-300 mb-2" />
									<h3 class="text-lg font-medium">No Locations</h3>
									<p class="text-sm text-gray-500 mb-4">
										This client doesn't have any locations yet.
									</p>
								</div>
							{:else}
								<div class="rounded-md border">
									<Table>
										<TableHeader>
											{#each $locationTable.getHeaderGroups() as headerGroup}
												<TableRow>
													{#each headerGroup.headers as header}
														<TableHead>
															<svelte:component
																this={flexRender(
																	header.column.columnDef.header,
																	header.getContext()
																)}
															/>
														</TableHead>
													{/each}
													<TableHead class="text-right">Actions</TableHead>
												</TableRow>
											{/each}
										</TableHeader>
										<TableBody>
											{#each $locationTable.getRowModel().rows as row}
												<TableRow>
													{#each row.getVisibleCells() as cell}
														<TableCell>
															<svelte:component
																this={flexRender(cell.column.columnDef.cell, cell.getContext())}
															/>
														</TableCell>
													{/each}
													<TableCell class="text-right">
														<div class="flex justify-end gap-2">
															<Button
																href={`/clients/${client.profile.id}/locations/${row.getAllCells()[0].row.original.id}`}
																variant="ghost"
																size="icon"
																class="h-8 w-8"
															>
																<Eye class="h-4 w-4" />
															</Button>
														</div>
													</TableCell>
												</TableRow>
											{/each}
										</TableBody>
									</Table>
								</div>

								<!-- Location Pagination Controls -->
								<div class="flex items-center justify-between space-x-2 py-4">
									<div class="flex-1 text-sm text-muted-foreground">
										Showing {$locationTable.getState().pagination.pageIndex *
											$locationTable.getState().pagination.pageSize +
											1} to {Math.min(
											($locationTable.getState().pagination.pageIndex + 1) *
												$locationTable.getState().pagination.pageSize,
											$locationTable.getFilteredRowModel().rows.length
										)} of {$locationTable.getFilteredRowModel().rows.length} locations
									</div>
									<div class="flex items-center space-x-2">
										<Button
											variant="outline"
											size="sm"
											on:click={() => $locationTable.previousPage()}
											disabled={!$locationTable.getCanPreviousPage()}
										>
											<ChevronLeft class="h-4 w-4" />
											Previous
										</Button>
										<Button
											variant="outline"
											size="sm"
											on:click={() => $locationTable.nextPage()}
											disabled={!$locationTable.getCanNextPage()}
										>
											Next
											<ChevronRight class="h-4 w-4" />
										</Button>
									</div>
								</div>
							{/if}
						</CardContent>
					</Card>
				</TabsContent>

				<!-- Requisitions Tab -->
				<TabsContent value="requisitions" class="mt-6">
					<Card class="w-full max-w-none">
						<CardHeader class="flex flex-row items-center justify-between">
							<CardTitle>Requisitions</CardTitle>
							<div class="flex items-center gap-2">
								<!-- View Toggle -->
								<div class="inline-flex rounded-lg border border-gray-200 p-1">
									<button
										class={cn(
											'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
											requisitionView === 'table'
												? 'bg-blue-500 text-white'
												: 'text-gray-600 hover:text-gray-900'
										)}
										on:click={() => (requisitionView = 'table')}
									>
										<LayoutGrid class="h-4 w-4" />
									</button>
									<button
										class={cn(
											'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
											requisitionView === 'calendar'
												? 'bg-blue-500 text-white'
												: 'text-gray-600 hover:text-gray-900'
										)}
										on:click={() => (requisitionView = 'calendar')}
									>
										<CalendarIcon class="h-4 w-4" />
									</button>
								</div>

								{#if isAdmin}
									<Button
										on:click={() => (drawerExpanded = true)}
										size="sm"
										class="gap-1 bg-blue-500 hover:bg-blue-600"
									>
										<Plus class="h-4 w-4" />
										<span>New Requisition</span>
									</Button>
								{/if}
							</div>
						</CardHeader>
						<CardContent>
							{#if requisitionView === 'table'}
								<!-- Table View -->
								{#if requisitions && requisitions.length > 0}
									<div class="rounded-md border">
										<Table>
											<TableHeader>
												{#each $requisitionTable.getHeaderGroups() as headerGroup}
													<TableRow>
														{#each headerGroup.headers as header}
															<TableHead>
																<svelte:component
																	this={flexRender(
																		header.column.columnDef.header,
																		header.getContext()
																	)}
																/>
															</TableHead>
														{/each}
														<TableHead class="text-right">Actions</TableHead>
													</TableRow>
												{/each}
											</TableHeader>
											<TableBody>
												{#each $requisitionTable.getRowModel().rows as row}
													<TableRow
														class="cursor-pointer hover:bg-gray-50"
														on:click={() => goto(`/requisitions/${row.original.id}`)}
													>
														{#each row.getVisibleCells() as cell, cellIndex}
															<TableCell>
																{#if cellIndex === 0}
																	<!-- Position column with custom HTML -->
																	<div class="flex flex-col">
																		<span class="font-medium truncate max-w-[250px]">
																			{row.original.disciplineName}
																			<span class="text-xs text-muted-foreground"
																				>- Req# {row.original.id}</span
																			>
																		</span>
																		<span class="text-xs text-gray-500"
																			>{row.original.locationName || 'No location'}</span
																		>
																	</div>
																{:else if cellIndex === 1}
																	<!-- Status badge -->
																	<Badge
																		value={row.original.status}
																		class={cn(
																			row.original.status === 'PENDING' &&
																				'bg-yellow-300 hover:bg-yellow-400 text-white',
																			row.original.status === 'OPEN' &&
																				'bg-blue-500 hover:bg-blue-600 text-white',
																			row.original.status === 'FILLED' &&
																				'bg-green-400 hover:bg-green-500 text-white',
																			row.original.status === 'UNFULFILLED' &&
																				'bg-orange-400 hover:bg-orange-500 text-white',
																			row.original.status === 'CANCELED' &&
																				'bg-red-500 hover:bg-red-600 text-white'
																		)}
																	/>
																{:else if cellIndex === 2}
																	<!-- Requisition Type -->
																	{row.original.permanentPosition ? 'Permanent' : 'Temporary'}
																{:else if cellIndex === 3}
																	<!-- Rate -->
																	${row.original.hourlyRate?.toFixed(2) || '0.00'}
																{/if}
															</TableCell>
														{/each}
														<TableCell class="text-right">
															<div class="flex justify-end gap-2">
																<Button
																	href={`/requisitions/${row.original.id}`}
																	variant="ghost"
																	size="icon"
																	class="h-8 w-8"
																	on:click={(e) => e.stopPropagation()}
																>
																	<Eye class="h-4 w-4" />
																</Button>
															</div>
														</TableCell>
													</TableRow>
												{/each}
											</TableBody>
										</Table>
									</div>

									<!-- Pagination Controls -->
									<div class="flex items-center justify-between space-x-2 py-4">
										<div class="flex-1 text-sm text-muted-foreground">
											Showing {$requisitionTable.getState().pagination.pageIndex *
												$requisitionTable.getState().pagination.pageSize +
												1} to {Math.min(
												($requisitionTable.getState().pagination.pageIndex + 1) *
													$requisitionTable.getState().pagination.pageSize,
												$requisitionTable.getFilteredRowModel().rows.length
											)} of {$requisitionTable.getFilteredRowModel().rows.length} requisitions
										</div>
										<div class="flex items-center space-x-2">
											<Button
												variant="outline"
												size="sm"
												on:click={() => $requisitionTable.previousPage()}
												disabled={!$requisitionTable.getCanPreviousPage()}
											>
												<ChevronLeft class="h-4 w-4" />
												Previous
											</Button>
											<Button
												variant="outline"
												size="sm"
												on:click={() => $requisitionTable.nextPage()}
												disabled={!$requisitionTable.getCanNextPage()}
											>
												Next
												<ChevronRight class="h-4 w-4" />
											</Button>
										</div>
									</div>
								{:else}
									<div class="flex flex-col items-center justify-center py-8 text-center">
										<ClipboardList class="h-12 w-12 text-gray-300 mb-2" />
										<h3 class="text-lg font-medium">No Requisitions</h3>
										<p class="text-sm text-gray-500 mb-4">
											This client doesn't have any requisitions yet.
										</p>
										{#if isAdmin}
											<Button
												variant="outline"
												size="sm"
												class="gap-1"
												on:click={() => (drawerExpanded = true)}
											>
												<Plus class="h-4 w-4" />
												<span>Create First Requisition</span>
											</Button>
										{/if}
									</div>
								{/if}
							{:else}
								<!-- Calendar View -->
								<Calendar events={recurrenceDays} {selectEvent} />
							{/if}
						</CardContent>
					</Card>
				</TabsContent>
				<!-- Documents Tab -->
				<TabsContent value="documents" class="mt-6">
					<Card class="w-full max-w-none">
						<CardHeader class="flex flex-row items-center justify-between">
							<CardTitle>Documents</CardTitle>
							{#if isAdmin}
								<Dialog bind:open={uploadDocumentDialogOpen}>
									<DialogTrigger>
										<Button
											size="sm"
											class="gap-1 bg-blue-500 hover:bg-blue-600"
											on:click={() => (uploadDocumentDialogOpen = true)}
										>
											<Plus class="h-4 w-4" />
											Upload
										</Button>
									</DialogTrigger>
									<DialogContent>
										<DialogHeader>
											<DialogTitle>Upload Document</DialogTitle>
										</DialogHeader>
										<div class="space-y-4">
											<div>
												<Label for="docType">Document Type</Label>
												<select
													id="docType"
													bind:value={uploadDocumentType}
													class="mt-1 w-full p-2 border rounded text-sm"
												>
													<option value="LICENSE">License</option>
													<option value="CERTIFICATE">Certificate</option>
													<option value="AGREEMENT">Agreement</option>
													<option value="OTHER">Other</option>
												</select>
											</div>
											<div class="flex items-center gap-2">
												<input
													type="checkbox"
													id="adminOnly"
													bind:checked={uploadDocumentAdminOnly}
													class="h-4 w-4"
												/>
												<Label for="adminOnly" class="text-sm">Admin only</Label>
											</div>
											<FileDropzone
												onFileDrop={handleClientDocumentUpload}
												accept={['image/*', '.jpg', '.png', '.pdf', '.doc', '.docx']}
												maxSizeMB={10}
												multiple={false}
											/>
										</div>
									</DialogContent>
								</Dialog>
							{/if}
						</CardHeader>
						<CardContent>
							{#if data.documents && data.documents.length > 0}
								<table class="w-full border-collapse">
									<thead>
										<tr class="border-b">
											<th class="text-left py-3 px-4 font-medium text-sm">File</th>
											<th class="text-left py-3 px-4 font-medium text-sm">Type</th>
											<th class="text-left py-3 px-4 font-medium text-sm">Uploaded</th>
											<th class="text-right py-3 px-4 font-medium text-sm">Actions</th>
										</tr>
									</thead>
									<tbody>
										{#each data.documents as doc}
											<tr class="border-b hover:bg-gray-50">
												<td class="py-3 px-4">
													<div class="flex items-center gap-2">
														{#if doc.adminOnly}
															<Lock class="h-4 w-4 text-red-500 flex-shrink-0" />
														{/if}
														<FileText class="h-4 w-4 text-blue-600 flex-shrink-0" />
														<span class="text-sm font-medium">{doc.filename}</span>
													</div>
												</td>
												<td class="py-3 px-4 text-sm text-gray-600">{doc.type}</td>
												<td class="py-3 px-4 text-sm text-gray-600">
													{format(doc.createdAt, 'PP')}
												</td>
												<td class="py-3 px-4 text-right">
													<DropdownMenu>
														<DropdownMenuTrigger>
															<Button variant="ghost" size="icon">
																<MoreHorizontal class="h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem>
																<a
																	class="flex items-center w-full"
																	href={doc.uploadUrl}
																	target="_blank"
																	rel="noopener noreferrer"
																>
																	<Download class="h-4 w-4 mr-2" />
																	Download
																</a>
															</DropdownMenuItem>
															{#if isAdmin}
																<DropdownMenuItem>
																	<form
																		action="?/toggleClientDocumentLock"
																		method="post"
																		use:nativeEnhance={() => {
																			return async ({ result, update }) => {
																				if (result.type === 'success') {
																					await invalidateAll();
																				}
																				await update();
																			};
																		}}
																		class="w-full"
																	>
																		<input type="hidden" name="documentId" value={doc.id} />
																		<button
																			type="submit"
																			class="flex items-center w-full text-left"
																		>
																			{#if doc.adminOnly}
																				<Unlock class="h-4 w-4 mr-2" />
																				Unlock
																			{:else}
																				<Lock class="h-4 w-4 mr-2" />
																				Lock
																			{/if}
																		</button>
																	</form>
																</DropdownMenuItem>
																<DropdownMenuItem class="text-red-600">
																	<form
																		action="?/deleteClientDocument"
																		method="post"
																		use:nativeEnhance={() => {
																			return async ({ result, update }) => {
																				if (result.type === 'success') {
																					await invalidateAll();
																				}
																				await update();
																			};
																		}}
																		class="w-full"
																	>
																		<input type="hidden" name="documentId" value={doc.id} />
																		<button
																			type="submit"
																			class="flex items-center w-full text-left text-red-600"
																		>
																			<Trash2 class="h-4 w-4 mr-2" />
																			Delete
																		</button>
																	</form>
																</DropdownMenuItem>
															{/if}
														</DropdownMenuContent>
													</DropdownMenu>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{:else}
								<div class="flex flex-col items-center justify-center py-8 text-center">
									<FileText class="h-12 w-12 text-gray-300 mb-2" />
									<h3 class="text-lg font-medium">No Documents</h3>
									<p class="text-sm text-gray-500">No documents have been uploaded yet.</p>
								</div>
							{/if}
							<form
								id="client-documents-form"
								method="POST"
								action="?/uploadClientDocument"
								use:nativeEnhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'success') {
											uploadDocumentDialogOpen = false;
											uploadDocumentType = 'OTHER';
											uploadDocumentAdminOnly = false;
											await invalidateAll();
										}
										await update();
									};
								}}
							>
								<input type="hidden" name="uploadUrl" bind:value={clientDocsUrlString} />
								<input type="hidden" name="filename" bind:value={clientDocsFileString} />
								<input type="hidden" name="type" bind:value={uploadDocumentType} />
								<input type="hidden" name="adminOnly" value={String(uploadDocumentAdminOnly)} />
							</form>
						</CardContent>
					</Card>
				</TabsContent>

				<!-- Support Tickets Tab -->
				<TabsContent value="support" class="mt-6">
					<Card class="w-full max-w-none">
						<CardHeader class="flex flex-row items-center justify-between">
							<CardTitle>Support Tickets</CardTitle>
						</CardHeader>
						<CardContent>
							{#if supportTickets.length > 0}
								<div class="rounded-md border">
									<Table>
										<TableHeader>
											{#each $supportTable.getHeaderGroups() as headerGroup}
												<TableRow>
													{#each headerGroup.headers as header}
														<TableHead>
															<svelte:component
																this={flexRender(
																	header.column.columnDef.header,
																	header.getContext()
																)}
															/>
														</TableHead>
													{/each}
													<TableHead class="text-right">Actions</TableHead>
												</TableRow>
											{/each}
										</TableHeader>
										<TableBody>
											{#each $supportTable.getRowModel().rows as row}
												<TableRow>
													{#each row.getVisibleCells() as cell}
														<TableCell>
															<svelte:component
																this={flexRender(cell.column.columnDef.cell, cell.getContext())}
															/>
														</TableCell>
													{/each}
													<TableCell class="text-right">
														<div class="flex justify-end gap-2">
															<Button
																variant="ghost"
																size="icon"
																class="h-8 w-8"
																on:click={() => goto(`/support/ticket/${row.original.id}`)}
															>
																<Eye class="h-4 w-4" />
															</Button>
														</div>
													</TableCell>
												</TableRow>
											{/each}
										</TableBody>
									</Table>
								</div>

								<!-- Support Pagination Controls -->
								<div class="flex items-center justify-between space-x-2 py-4">
									<div class="flex-1 text-sm text-muted-foreground">
										Showing {$supportTable.getState().pagination.pageIndex *
											$supportTable.getState().pagination.pageSize +
											1} to {Math.min(
											($supportTable.getState().pagination.pageIndex + 1) *
												$supportTable.getState().pagination.pageSize,
											$supportTable.getFilteredRowModel().rows.length
										)} of {$supportTable.getFilteredRowModel().rows.length} tickets
									</div>
									<div class="flex items-center space-x-2">
										<Button
											variant="outline"
											size="sm"
											on:click={() => $supportTable.previousPage()}
											disabled={!$supportTable.getCanPreviousPage()}
										>
											<ChevronLeft class="h-4 w-4" />
											Previous
										</Button>
										<Button
											variant="outline"
											size="sm"
											on:click={() => $supportTable.nextPage()}
											disabled={!$supportTable.getCanNextPage()}
										>
											Next
											<ChevronRight class="h-4 w-4" />
										</Button>
									</div>
								</div>
							{:else}
								<div class="flex flex-col items-center justify-center py-8 text-center">
									<AlertCircle class="h-12 w-12 text-gray-300 mb-2" />
									<h3 class="text-lg font-medium">No Support Tickets</h3>
									<p class="text-sm text-gray-500 mb-4">
										This client doesn't have any support tickets yet.
									</p>
								</div>
							{/if}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	</section>
	<Dialog open={dialogOpen} onOpenChange={() => (dialogOpen = !dialogOpen)}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle class="text-xl text-left">{selectedEvent?.title}</DialogTitle>
				<DialogDescription>
					<div class="flex items-center gap-2">
						<img
							src={selectedEvent?.extendedProps.requisition.client.companyLogo}
							class="w-10 h-10 rounded-full shadow-lg"
							alt="company logo"
						/>
						<span>{selectedEvent?.extendedProps.requisition.client.companyName}</span>
					</div>
				</DialogDescription>
			</DialogHeader>

			{#if selectedEvent?.extendedProps.type === 'RECURRENCE_DAY'}
				{@const tz =
					selectedEvent.extendedProps.requisition?.referenceTimezone || 'America/New_York'}
				{@const dayStart = selectedEvent.extendedProps.recurrenceDay?.dayStart}
				{@const dayEnd = selectedEvent.extendedProps.recurrenceDay?.dayEnd}
				<p class="font-semibold">Date & Time</p>
				<div class="flex items-center gap-2 text-gray-500">
					<CalendarDays size={18} />
					{dayStart ? formatInTimeZone(new Date(dayStart), tz, 'EEEE, MMM d, yyyy') : ''}
				</div>
				<div class="flex items-center gap-2 text-gray-500">
					<Clock size={18} />
					<span>
						{dayStart ? formatInTimeZone(new Date(dayStart), tz, 'p') : ''} - {dayEnd
							? formatInTimeZone(new Date(dayEnd), tz, 'p')
							: ''}
						<span class="text-xs">({formatTimezoneName(tz)})</span>
					</span>
				</div>
				<DialogFooter>
					<a href={`/requisitions/${selectedEvent?.resourceIds?.[0]}`}>
						<Button type="button" class="ml-auto mt-4">View Requisition</Button>
					</a>
				</DialogFooter>
			{/if}
		</DialogContent>
	</Dialog>

	<Dialog bind:open={detailsDialogOpen}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Staff Details</DialogTitle>
			</DialogHeader>
			<div>
				{#if selectedProfile}
					<div class="space-y-4">
						<p>
							<strong>Name:</strong>
							{selectedProfile.user.firstName}
							{selectedProfile.user.lastName}
						</p>
						<p><strong>Email:</strong> {selectedProfile.user.email}</p>
						{#if selectedProfile.profile.staffRole}
							<p>
								<strong>Role:</strong>
								{STAFF_ROLE_ENUM[selectedProfile.profile.staffRole]}
							</p>
						{/if}
						<p>
							<strong>Primary Location:</strong>
							{selectedProfile.primaryLocation?.name || 'None Assigned'}
						</p>
						<p><strong>Birthday:</strong> {selectedProfile.profile.birthday || 'N/A'}</p>
						<p>
							<strong>Created At:</strong>
							{new Date(selectedProfile.profile.createdAt).toLocaleDateString()}
						</p>
					</div>
				{:else}
					<p>No staff profile selected.</p>
				{/if}
			</div>
			<DialogFooter>
				<DialogClose asChild>
					<Button on:click={handleCloseDetailsDialog} variant="outline" type="button" class="w-full"
						>Close
					</Button>
				</DialogClose>
			</DialogFooter>
		</DialogContent>
	</Dialog>
	<Dialog bind:open={showSetupLinkDialog}>
		<DialogContent class="sm:max-w-[550px]">
			<DialogHeader>
				<DialogTitle>Payment Setup Link Created</DialogTitle>
				<DialogDescription>
					Share this link with {client.user.firstName}
					{client.user.lastName} to complete payment setup
				</DialogDescription>
			</DialogHeader>

			<div class="space-y-4 py-4">
				<!-- Client Info -->
				<div class="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
					<div class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
						<User class="h-5 w-5 text-blue-600" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="font-medium text-sm">{client.user.firstName} {client.user.lastName}</p>
						<p class="text-xs text-gray-600 truncate">{client.user.email}</p>
					</div>
				</div>

				<!-- Setup Link -->
				<div class="space-y-2">
					<Label for="setup-link" class="text-sm font-medium">Setup Link</Label>
					<div class="flex gap-2">
						<Input
							id="setup-link"
							value={setupLink}
							readonly
							class="font-mono text-sm"
							on:click={(e) => e.target.select()}
						/>
						<Button
							variant="outline"
							size="icon"
							on:click={copySetupLink}
							title="Copy to clipboard"
						>
							<ClipboardList class="h-4 w-4" />
						</Button>
					</div>
					<p class="text-xs text-gray-500">
						Click the link to select all, or click the copy button
					</p>
				</div>

				<!-- What Happens -->
				<div class="bg-blue-50 border border-blue-100 rounded-lg p-4">
					<h4 class="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
						<CreditCard class="h-4 w-4" />
						<span>What happens next?</span>
					</h4>
					<ol class="text-xs text-blue-800 space-y-1.5 list-decimal list-inside ml-1">
						<li>Send this link to the client via email or text</li>
						<li>Client opens the link and enters payment information</li>
						<li>Stripe securely saves their payment method</li>
						<li>You can now create and charge invoices</li>
					</ol>
				</div>
			</div>

			<DialogFooter>
				<Button variant="outline" on:click={() => (showSetupLinkDialog = false)}>Done</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
{:else}
	<section
		class="container mx-auto px-4 py-6 flex flex-col items-center text-center sm:justify-center gap-4 md:gap-6"
	>
		<div class="p-8 bg-gray-50 rounded-lg">
			<AlertCircle class="h-12 w-12 mx-auto text-gray-400 mb-4" />
			<h2 class="text-2xl font-bold mb-2">No Client Found</h2>
			<p class="text-gray-500 mb-6">The requested client could not be found in our system.</p>
			<Button type="button" on:click={() => window.history.back()}>Go Back</Button>
		</div>
	</section>
{/if}
<AddRequisitionDrawer
	currentCompanyID={data.client?.company.id}
	{user}
	bind:drawerExpanded
	{adminForm}
/>

{#if isAdmin}
	<InviteStaffDialog
		bind:open={inviteStaffDialogOpen}
		action="?/inviteStaff"
		locations={data.client?.locations?.map((l) => ({ id: l.id, name: l.name })) ?? []}
		dialogTitle="Invite staff for {data.client?.company?.companyName ?? 'this client'}"
		dialogDescription="An invite email will go out with a sign-up link tied to the primary location you pick. You can assign additional locations after they accept."
	/>

	{#if manageLocationsForStaff}
		<StaffLocationsDialog
			bind:open={manageLocationsDialogOpen}
			action="?/updateStaffLocations"
			staffId={manageLocationsForStaff.staffId}
			staffName={manageLocationsForStaff.staffName}
			locations={data.client?.locations?.map((l) => ({ id: l.id, name: l.name })) ?? []}
			initialLocationIds={manageLocationsForStaff.locationIds}
			initialPrimaryLocationId={manageLocationsForStaff.primaryLocationId}
		/>
	{/if}
{/if}
