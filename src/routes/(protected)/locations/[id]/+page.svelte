<script lang="ts">
    import ViewLink from './../../../../lib/components/tables/ViewLink.svelte';
    import {Tabs, TabsContent, TabsList, TabsTrigger} from '$lib/components/ui/tabs/index.js';
    import {Input} from '$lib/components/ui/input';
    import PhoneInput from '$lib/components/PhoneInput.svelte';
    import {Label} from '$lib/components/ui/label';
    import * as Select from '$lib/components/ui/select';
    import {STATES} from '$lib/config/constants';
    import {Save, X} from 'lucide-svelte';
    import {superForm} from 'sveltekit-superforms/client';
    import {onMount} from 'svelte';
    import {writable} from 'svelte/store';
    import {
        createSvelteTable,
        flexRender,
        getCoreRowModel,
        getSortedRowModel,
        type ColumnDef,
        type TableOptions
    } from '@tanstack/svelte-table';
    import Badge from '$lib/components/ui/badge/badge.svelte';
    import {cn} from '$lib/utils';
    import {STAFF_ROLE_ENUM, USER_ROLES} from '$lib/config/constants';
    import {Button} from '$lib/components/ui/button';
    import type {PageData} from './$types';
    import InviteStaffToLocationDialog from '$lib/components/dialogs/inviteStaffToLocationDialog.svelte';
    import {CardHeader, CardTitle, CardContent, CardFooter} from '$lib/components/ui/card';
    import {
        Table,
        TableBody,
        TableCell,
        TableHead,
        TableHeader,
        TableRow
    } from '$lib/components/ui/table/index.js';
    import {Card} from 'flowbite-svelte';
    import {
        Edit,
        Info,
        Users,
        ClipboardList,
        Building,
        Phone,
        Mail,
        MapPin,
        ExternalLink,
        Clock,
        UserPlus,
        Eye,
        UserMinus,
        Plus,
        AlertCircle
    } from 'lucide-svelte';
    import {getDayName} from '$lib/_helpers';
    import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
    import {clientRequisitionSchema, type ClientRequisitionSchema} from '$lib/config/zod-schemas';
    import {formatTimeForDisplay, formatTimeString} from '$lib/_helpers/UTCTimezoneUtils';
    import type {SuperValidated} from 'sveltekit-superforms';
    import AddressSearchAutocomplete from "$lib/components/AddressSearchAutocomplete.svelte";
    import type {AddressResult} from "$lib/types";

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
    };

    type RequisitionData = {
        id: number;
        status: 'PENDING' | 'OPEN' | 'FILLED' | 'UNFULFILLED' | 'CANCELED';
        title: string;
        experienceLevel: string | null;
        discipline: string | null;
    };

    export let data: PageData;

    // $: user = data.user;
    $: location = data.location;
    // $: client = data.client;
    $: company = data.company;
    $: requisitions = data.requisitions;
    $: locationStaff = data.locationStaff;
    $: allStaff = data.allStaff;
    $: assignForm = data.assignForm;
    $: staffDialogOpen = false;
    $: user = data.user;
    $: clientForm = data.clientForm;

    let staffTableData: StaffProfileData[] = [];
    let requisitionTableData: RequisitionData[] = [];
    let drawerExpanded = false;
    let selectedState = location?.state || '';
    let selectedTimezone = location?.timezone || '';

    const staffColumns: ColumnDef<StaffProfileData>[] = [
        // {
        // 	header: '',
        // 	id: 'id',
        // 	accessorFn: (original) => original.id,
        // 	cell: (original) =>
        // 		flexRender(ViewLink, {
        // 			href: `/admin/menu/admins/${original.getValue()}`
        // 		})
        // },
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
    const requisitionColumns: ColumnDef<RequisitionData>[] = [
        {
            header: '',
            id: 'id',
            accessorFn: (original) => original.id,
            cell: (original) =>
                flexRender(ViewLink, {
                    href: `/requisitions/${original.getValue()}`
                })
        },
        {
            header: 'Discipline',
            id: 'discipline',
            accessorKey: 'discipline'
        },
        {
            header: 'Status',
            id: 'status',
            accessorKey: 'status',
            cell: (original) =>
                flexRender(Badge, {
                    value: original.getValue(),
                    class: cn(
                        original.getValue() === 'PENDING' && 'bg-yellow-300 hover:bg-yellow-400',
                        original.getValue() === 'OPEN' && 'bg-blue-500 hover:bg-blue-600',
                        original.getValue() === 'FILLED' && 'bg-green-400 hover:bg-bg-green-500',
                        original.getValue() === 'UNFULFILLED' && 'bg-orange-400 hover:bg-orange-500',
                        original.getValue() === 'CANCELED' && 'bg-red-500 hover:bg-red-600'
                    )
                })
        },
        {
            header: 'Experience Level',
            id: 'experienceLevel',
            accessorKey: 'experienceLevel'
        }
    ];

    const staffOptions = writable<TableOptions<StaffProfileData>>({
        data: staffTableData,
        columns: staffColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel()
    });
    const requisitionOptions = writable<TableOptions<RequisitionData>>({
        data: requisitionTableData,
        columns: requisitionColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel()
    });

    $: {
        staffTableData = (locationStaff as StaffProfileData[]) || [];
        staffOptions.update((o) => ({...o, data: staffTableData}));
        requisitionTableData = (requisitions as RequisitionData[]) || [];
        requisitionOptions.update((o) => ({...o, data: requisitionTableData}));
    }

    onMount(() => {
        staffTableData = (locationStaff as StaffProfileData[]) || [];
        staffOptions.update((o) => ({...o, data: staffTableData}));
        requisitionTableData = (requisitions as RequisitionData[]) || [];
        requisitionOptions.update((o) => ({...o, data: requisitionTableData}));
    });
    // const formatTime = (time: string): string => {
    // 	const [hours, minutes] = time.split(':');
    // 	const date = new Date();
    // 	date.setHours(parseInt(hours), parseInt(minutes));
    // 	return date.toLocaleTimeString('en-US', {
    // 		hour: 'numeric',
    // 		minute: '2-digit',
    // 		hour12: true
    // 	});
    // };
    const staffTable = createSvelteTable(staffOptions);
    const requisitionsTable = createSvelteTable(requisitionOptions);

    const {
        form: locationForm,
        enhance: addressEnhance,
        submitting: isAddressSubmitting,
        errors: addressErrors
    } = superForm(data.locationForm, {
        onResult: ({result}) => {
            if (result.type === 'success') {
                editingLocation = false;
            }
        }
    });

    const {
        form: hoursForm,
        enhance: hoursEnhance,
        submitting: isHoursSubmitting,
        errors: hoursErrors
    } = superForm(data.operatingHoursForm, {
        onResult: ({result}) => {
            if (result.type === 'success') {
                editingHours = false;
            }
        }
    });

    // Edit state tracking
    let editingLocation = false;
    let editingHours = false;

    function cancelEdit(section) {
        switch (section) {
            case 'location':
                editingLocation = false;
                break;
            case 'hours':
                editingHours = false;
                break;
        }
    }

    $: JSONHours = JSON.parse($hoursForm.operatingHours) || {};
    $: stringifiedHours = JSON.stringify($hoursForm.operatingHours) || {};

    let selectedAddress: AddressResult | null = null;

    function handleAddressSelect(event: CustomEvent<AddressResult>) {
        const address = event.detail;
        console.log("Selected address:", address);
        selectedAddress = address;

        // $formData.streetOne = address.
        // Now you have both formatted address and coordinates
        // Save to your database, update form state, etc.
    }

    function handleClear() {
        console.log("Address cleared");
        selectedAddress = null;
    }

    $: {
        if (selectedAddress) {
            $locationForm.lat = selectedAddress.coordinates?.lat
            $locationForm.lon = selectedAddress.coordinates?.lng
            $locationForm.completeAddress = selectedAddress?.formatted_address
        }
    }
</script>

{#if location}
    <section class="container mx-auto px-4 py-6">
        <div class="flex flex-col gap-6">
            <!-- Header with location info -->
            <div class="py-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 class="text-3xl font-bold">Office Location Details</h1>
                        <h2 class="text-xl font-medium text-gray-700 mt-2">{location?.name}</h2>
                    </div>
                </div>
            </div>

            <!-- Tabs section -->
            <Tabs class="w-full">
                <TabsList class="grid grid-cols-3 lg:w-fit">
                    <TabsTrigger value="details" class="gap-2">
                        <Info class="h-4 w-4"/>
                        <span class="hidden md:inline">Details</span>
                    </TabsTrigger>
                    <TabsTrigger value="staff" class="gap-2">
                        <Users class="h-4 w-4"/>
                        <span class="hidden md:inline">Staff</span>
                    </TabsTrigger>
                    <TabsTrigger value="requisitions" class="gap-2">
                        <ClipboardList class="h-4 w-4"/>
                        <span class="hidden md:inline">Requisitions</span>
                    </TabsTrigger>
                </TabsList>

                <!-- Details Tab -->
                <TabsContent value="details" class="mt-6">
                    <div class="grid grid-cols-4 gap-6">
                        <Card class="w-full max-w-none col-span-4 md:col-span-2">
                            <CardHeader>
                                <div class="flex items-center justify-between">
                                    <CardTitle class="text-blue-600 flex items-center gap-2">
                                        <Building class="h-5 w-5"/>
                                        Location Information
                                    </CardTitle>
                                    {#if !editingLocation}
                                        <Button variant="ghost" size="sm" on:click={() => (editingLocation = true)}>
                                            <Edit class="h-4 w-4"/>
                                        </Button>
                                    {/if}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {#if editingLocation}
                                    <form
                                            method="POST"
                                            use:addressEnhance
                                            action="?/updateLocationDetails"
                                            class="space-y-4"
                                    >
                                        {#if $addressErrors}
                                            <div class="text-red-500 text-sm">
                                                {#each Object.values($addressErrors) as error}
                                                    <p>{error}</p>
                                                {/each}
                                            </div>
                                        {/if}

                                        <div class="grid grid-cols-1 gap-4">
                                            <div class="">
                                                <Label for="city">Street Address</Label>
                                                <AddressSearchAutocomplete
                                                        bind:selected={selectedAddress}
                                                        on:select={handleAddressSelect}
                                                        on:clear={handleClear}
                                                        placeholder="Enter your address..."
                                                        country="us"
                                                        maxResults={8}
                                                />
                                                <input type="hidden" name="lat" value={$locationForm?.lat}/>
                                                <input type="hidden" name="lon" value={$locationForm?.lon}/>
                                                <input type="hidden" name="completeAddress"
                                                       value={$locationForm?.completeAddress}/>
                                                <input type="hidden" name="name" value={location.name}/>
                                            </div>

                                            <div class="space-y-2">
                                                <Label for="timezone">Timezone</Label>
                                                <Select.Root
                                                        preventScroll={false}
                                                        selected={selectedTimezone}
                                                        onSelectedChange={(v) => {
														v && ($locationForm.timezone = String(v.value));
													}}
                                                >
                                                    <Select.Trigger>
                                                        <Select.Value/>
                                                    </Select.Trigger>
                                                    <Select.Content class="max-h-[150px] overflow-y-scroll">
                                                        {#each Intl.supportedValuesOf('timeZone').filter(z => z.startsWith('America')) as timezone}
                                                            <Select.Item value={timezone}>
                                                                <span>{timezone}</span>
                                                            </Select.Item>
                                                        {/each}
                                                    </Select.Content>
                                                    <Input name="timezone" type="hidden"
                                                           value={$locationForm.timezone}/>
                                                </Select.Root>
                                            </div>
                                        </div>

                                        <div class="space-y-2">
                                            <Label for="companyPhone">Office Phone</Label>
                                            <PhoneInput
                                                    id="companyPhone"
                                                    name="companyPhone"
                                                    bind:value={$locationForm.companyPhone}
                                                    placeholder="Enter office phone number"
                                            />
                                        </div>

                                        <div class="space-y-2">
                                            <Label for="email">Email Address</Label>
                                            <Input
                                                    id="email"
                                                    name="email"
                                                    type="email"
                                                    bind:value={$locationForm.email}
                                                    placeholder="Enter email address"
                                            />
                                        </div>

                                        <div class="flex gap-2 pt-4">
                                            <Button
                                                    type="submit"
                                                    size="sm"
                                                    class="gap-2 bg-green-500 hover:bg-green-600 text-white"
                                                    disabled={$isAddressSubmitting}
                                            >
                                                <Save class="h-4 w-4"/>
                                                {$isAddressSubmitting ? 'Saving...' : 'Save Changes'}
                                            </Button>
                                            <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    on:click={() => cancelEdit('location')}
                                                    class="gap-2 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-500"
                                            >
                                                <X class="h-4 w-4"/>
                                                Cancel
                                            </Button>
                                        </div>
                                        <input type="hidden" name="lat" value={$locationForm.lat}/>
                                        <input type="hidden" name="lon" value={$locationForm.lon}/>
                                        <input type="hidden" name="completeAddress"
                                               value={$locationForm.completeAddress}/>
                                    </form>
                                {:else}
                                    <div class="space-y-4">
                                        <div>
                                            <h3 class="text-sm font-medium text-muted-foreground">Address</h3>
                                            <address class="mt-1 not-italic text-sm">
                                                {location?.completeAddress || 'No address provided'}
                                            </address>
                                        </div>

                                        <div>
                                            <h3 class="text-sm font-medium text-muted-foreground">Contact
                                                Information</h3>
                                            <div class="mt-2 space-y-2">
                                                {#if location?.companyPhone}
                                                    <div class="flex items-center gap-2">
                                                        <Phone class="h-4 w-4 text-gray-500"/>
                                                        <a
                                                                href={`tel:${location.companyPhone}`}
                                                                class="text-blue-600 hover:underline"
                                                        >
                                                            {location.companyPhone}
                                                        </a>
                                                    </div>
                                                {/if}

                                                {#if location?.email}
                                                    <div class="flex items-center gap-2">
                                                        <Mail class="h-4 w-4 text-gray-500"/>
                                                        <a
                                                                href={`mailto:${location.email}`}
                                                                class="text-blue-600 hover:underline"
                                                        >
                                                            {location.email}
                                                        </a>
                                                    </div>
                                                {/if}

                                                {#if !location?.companyPhone && !location?.email}
                                                    <p class="text-sm text-muted-foreground">
                                                        No contact information available
                                                    </p>
                                                {/if}
                                            </div>
                                        </div>

                                        <div>
                                            <h3 class="text-sm font-medium text-muted-foreground">Company</h3>
                                            <p class="mt-1">{company?.companyName || 'Unknown'}</p>
                                        </div>
                                    </div>
                                {/if}
                            </CardContent>
                        </Card>

                        <Card class="w-full max-w-none col-span-4 md:col-span-2">
                            <CardHeader>
                                <div class="flex items-center justify-between">
                                    <CardTitle class="text-blue-600 flex items-center gap-2">
                                        <Clock class="h-5 w-5"/>
                                        Hours of Operation
                                    </CardTitle>
                                    {#if !editingHours}
                                        <Button variant="ghost" size="sm" on:click={() => (editingHours = true)}>
                                            <Edit class="h-4 w-4"/>
                                        </Button>
                                    {/if}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {#if editingHours}
                                    <form
                                            use:hoursEnhance
                                            method="POST"
                                            action="?/updateOperatingHours"
                                            class="space-y-4"
                                    >
                                        {#each Array.from({length: 7}, (_, i) => i) as dayIndex}
                                            <div class="space-y-2">
                                                <Label>{getDayName(dayIndex)}</Label>
                                                <div class="grid grid-cols-3 gap-2 items-center">
                                                    <div class="space-y-1">
                                                        <Label for={`open-${dayIndex}`} class="text-xs">Open
                                                            Time</Label>
                                                        <Input
                                                                id={`open-${dayIndex}`}
                                                                type="time"
                                                                value={formatTimeString(JSONHours[dayIndex]?.openTime) || ''}
                                                                disabled={JSONHours[dayIndex]?.isClosed}
                                                                on:change={(e) => {
																let hours = JSONHours;
																hours[dayIndex].openTime = formatTimeString(e.target.value);
																$hoursForm.operatingHours = JSON.stringify(hours);
															}}
                                                        />
                                                    </div>
                                                    <div class="space-y-1">
                                                        <Label for={`close-${dayIndex}`} class="text-xs">Close
                                                            Time</Label>
                                                        <Input
                                                                id={`close-${dayIndex}`}
                                                                type="time"
                                                                value={formatTimeString(JSONHours[dayIndex]?.closeTime) || ''}
                                                                disabled={JSONHours[dayIndex]?.isClosed}
                                                                on:change={(e) => {
																let hours = JSONHours;
																hours[dayIndex].closeTime = formatTimeString(e.target.value);
																$hoursForm.operatingHours = JSON.stringify(hours);
															}}
                                                        />
                                                    </div>
                                                    <div class="space-y-1">
                                                        <Label class="text-xs">Closed</Label>
                                                        <input
                                                                type="checkbox"
                                                                checked={JSONHours[dayIndex].isClosed}
                                                                class="h-4 w-4"
                                                                on:change={(e) => {
																let hours = JSONHours;
																hours[dayIndex].isClosed = e.target?.checked;

																$hoursForm.operatingHours = JSON.stringify(hours);
															}}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                        <input type="hidden" name="operatingHours" bind:value={stringifiedHours}/>
                                        {#if $hoursErrors}
                                            <div class="text-red-500 text-sm">
                                                {#each Object.values($hoursErrors) as error}
                                                    <p>{error}</p>
                                                {/each}
                                            </div>
                                        {/if}
                                        <div class="flex gap-2 pt-4">
                                            <Button type="submit" size="sm"
                                                    class="gap-2 bg-green-500 hover:bg-green-600">
                                                <Save class="h-4 w-4"/>
                                                {#if $isHoursSubmitting}
                                                    Saving...
                                                {:else}
                                                    Save Changes
                                                {/if}
                                            </Button>
                                            <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    on:click={() => cancelEdit('hours')}
                                                    class="gap-2 text-red-500 border-red-500 hover:bg-red-50 hover:text-red-500"
                                            >
                                                <X class="h-4 w-4"/>
                                                Cancel
                                            </Button>
                                        </div>
                                    </form>
                                {:else}
                                    <div class="space-y-3">
                                        {#each Array.from({length: 7}, (_, i) => i) as dayIndex}
                                            <div
                                                    class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
                                            >
												<span class="font-medium text-gray-700 w-24">
													{getDayName(dayIndex)}
												</span>
                                                <span class="text-gray-600">
													{#if location?.operatingHours?.[dayIndex]?.isClosed}
														<span class="text-red-500 font-medium">Closed</span>
													{:else if location?.operatingHours?.[dayIndex]?.openTime && location.operatingHours[dayIndex]?.closeTime}
														<span class="font-medium">
															{formatTimeForDisplay(location.operatingHours[dayIndex].openTime)}
                                                            - {formatTimeForDisplay(
                                                            location.operatingHours[dayIndex].closeTime
                                                        )}
														</span>
													{:else}
														<span class="text-muted-foreground">Hours not set</span>
													{/if}
												</span>
                                            </div>
                                        {/each}

                                        {#if location?.timezone}
                                            <div class="pt-2 text-xs text-muted-foreground border-t">
                                                All times shown in {location.timezone.replace('_', ' ')}
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <!-- Staff Tab -->
                <TabsContent value="staff" class="mt-6">
                    <Card class="w-full max-w-none">
                        <CardHeader class="flex flex-row items-center justify-between">
                            <CardTitle>Location Staff</CardTitle>
                            <div class="flex gap-2">
                                <InviteStaffToLocationDialog
                                        bind:open={staffDialogOpen}
                                        {allStaff}
                                        {location}
                                        {company}
                                        {assignForm}
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {#if staffTableData.length === 0}
                                <div class="text-center py-8">
                                    <Users class="h-12 w-12 mx-auto text-gray-300"/>
                                    <h3 class="mt-4 text-lg font-medium">No Staff Assigned</h3>
                                    <p class="mt-2 text-sm text-gray-500">
                                        This location doesn't have any staff assigned yet.
                                    </p>
                                    <InviteStaffToLocationDialog
                                            bind:open={staffDialogOpen}
                                            {allStaff}
                                            {location}
                                            {company}
                                            {assignForm}
                                    />
                                </div>
                            {:else}
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
                                                    <!-- Add Actions column -->
                                                    <TableCell>
                                                        <div class="flex justify-end gap-2">
                                                            <Button variant="ghost" size="icon" class="h-8 w-8">
                                                                <Eye class="h-4 w-4"/>
                                                            </Button>
                                                            <Button variant="ghost" size="icon"
                                                                    class="h-8 w-8 text-red-500">
                                                                <UserMinus class="h-4 w-4"/>
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            {/each}
                                        </TableBody>
                                    </Table>
                                </div>
                            {/if}
                        </CardContent>
                    </Card>
                </TabsContent>

                <!-- Requisitions Tab -->
                <TabsContent value="requisitions" class="mt-6">
                    <Card class="w-full max-w-none">
                        <CardHeader class="flex flex-row items-center justify-between">
                            <CardTitle>Location Requisitions</CardTitle>
                            {#if user?.role !== USER_ROLES.SUPERADMIN}
                                <Button
                                        on:click={() => {
										drawerExpanded = true;
									}}
                                        class="bg-blue-800 hover:bg-blue-900 text-white"
                                >
                                    <Plus class="inline mr-2" size={18}/>
                                    New Requisition
                                </Button>
                            {/if}
                        </CardHeader>
                        <CardContent>
                            {#if requisitionTableData.length === 0}
                                <div class="text-center py-8">
                                    <ClipboardList class="h-12 w-12 mx-auto text-gray-300"/>
                                    <h3 class="mt-4 text-lg font-medium">No Requisitions</h3>
                                    <p class="mt-2 text-sm text-gray-500">
                                        This location doesn't have any requisitions yet.
                                    </p>
                                    <Button variant="outline" class="mt-4 gap-1">
                                        <Plus class="h-4 w-4"/>
                                        Create First Requisition
                                    </Button>
                                </div>
                            {:else}
                                <div class="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            {#each $requisitionsTable.getHeaderGroups() as headerGroup}
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
                                                </TableRow>
                                            {/each}
                                        </TableHeader>
                                        <TableBody>
                                            {#each $requisitionsTable.getRowModel().rows as row}
                                                <TableRow>
                                                    {#each row.getVisibleCells() as cell}
                                                        <TableCell>
                                                            <svelte:component
                                                                    this={flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                            />
                                                        </TableCell>
                                                    {/each}
                                                </TableRow>
                                            {/each}
                                        </TableBody>
                                    </Table>
                                </div>
                            {/if}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    </section>
    <AddRequisitionDrawer {user} bind:drawerExpanded {clientForm} {location}/>
{:else}
    <section
            class="container mx-auto px-4 py-6 flex flex-col items-center text-center sm:justify-center gap-4 md:gap-6"
    >
        <div class="p-8 bg-gray-50 rounded-lg">
            <AlertCircle class="h-12 w-12 mx-auto text-gray-400 mb-4"/>
            <h2 class="text-2xl font-bold mb-2">No Location Found</h2>
            <p class="text-gray-500 mb-6">The requested location could not be found in our system.</p>
            <Button type="button" on:click={() => window.history.back()}>Go Back</Button>
        </div>
    </section>
{/if}
