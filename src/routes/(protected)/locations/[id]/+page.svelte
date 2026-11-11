<script lang="ts">
    // Legacy syntax kept: this page's superForm wiring is unchanged from before
    // the redesign; only the markup moved onto the design-system components.
    import {Input} from '$lib/components/ui/input';
    import PhoneInput from '$lib/components/PhoneInput.svelte';
    import {Label} from '$lib/components/ui/label';
    import * as Select from '$lib/components/ui/select';
    import {Checkbox} from '$lib/components/ui/checkbox';
    import {Button} from '$lib/components/ui/button';
    import {superForm} from 'sveltekit-superforms/client';
    import {USER_ROLES} from '$lib/config/constants';
    import type {PageData} from './$types';
    import InviteStaffToLocationDialog from '$lib/components/dialogs/inviteStaffToLocationDialog.svelte';
    import PendingInvitesTable from '$lib/components/PendingInvitesTable.svelte';
    import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
    import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';
    import type {AddressResult} from '$lib/types';
    import {enhance} from '$app/forms';
    import {getDayName} from '$lib/_helpers';
    import {formatTimeForDisplay, formatTimeString} from '$lib/_helpers/UTCTimezoneUtils';
    import {AlertCircle, ClipboardList, Pencil, Plus, Star, UserMinus, Users} from 'lucide-svelte';
    import Page from '$dtss/Page.svelte';
    import Section from '$dtss/Section.svelte';
    import FactGrid from '$dtss/FactGrid.svelte';
    import Notice from '$dtss/Notice.svelte';
    import EmptyState from '$dtss/EmptyState.svelte';
    import DataTable from '$dtss/DataTable.svelte';
    import StatusBadge from '$dtss/StatusBadge.svelte';
    import {page} from '$app/stores';
    import {ConfirmAction, DetailHeader, DetailTabs, StaffTable, readTab, type StaffRow} from '$features/people';

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
        isPrimary?: boolean | null;
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

    let drawerExpanded = false;
    let selectedTimezone = location?.timezone || '';
    $: staffRows = ((locationStaff ?? []) as unknown as (StaffRow & { isPrimary?: boolean | null })[]);
    $: requisitionRows = ((requisitions ?? []) as RequisitionData[]);
    $: requisitionColumns = [
        { id: 'discipline', header: 'Discipline', value: (r: RequisitionData) => r.discipline ?? r.title ?? '—' },
        { id: 'status', header: 'Status', cell: reqStatusCell },
        { id: 'experience', header: 'Experience', value: (r: RequisitionData) => r.experienceLevel ?? '—' }
    ];
    $: tabs = [
        { value: 'details', label: 'Details' },
        { value: 'staff', label: 'Staff', count: staffRows.length },
        { value: 'requisitions', label: 'Requisitions', count: requisitionRows.length }
    ];
    let tab = readTab($page.url.searchParams.get('tab'), ['details', 'staff', 'requisitions'] as const);

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

    function cancelEdit(section: 'location' | 'hours') {
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
    // $hoursForm.operatingHours is already a JSON string: submit it as-is.
    // Re-stringifying double-encoded it, so the action parsed back a string and
    // wrote that into the jsonb column (the admin location page had the same fix).
    $: stringifiedHours = $hoursForm.operatingHours || '{}';

    function setHours(dayIndex: number, patch: Record<string, unknown>) {
        const hours = JSONHours;
        hours[dayIndex] = { ...hours[dayIndex], ...patch };
        $hoursForm.operatingHours = JSON.stringify(hours);
    }

    let selectedAddress: AddressResult | null = null;

    function handleAddressSelect(event: CustomEvent<AddressResult>) {
        const address = event.detail;
        selectedAddress = address;

        // $formData.streetOne = address.
        // Now you have both formatted address and coordinates
        // Save to your database, update form state, etc.
    }

    function handleClear() {
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

{#snippet reqStatusCell(r: RequisitionData)}<StatusBadge status={r.status} />{/snippet}

{#snippet staffActions(row: StaffRow)}
    {@const member = row as StaffRow & { isPrimary?: boolean | null }}
    <div class="flex items-center justify-end gap-1">
        {#if member.isPrimary}
            <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Primary</span>
        {:else}
            <form method="POST" action="?/updateStaffOnLocation" use:enhance>
                <input type="hidden" name="staffId" value={member.profile.id}/>
                <input type="hidden" name="action" value="makePrimary"/>
                <Button type="submit" variant="ghost" size="icon" class="size-9"
                        aria-label="Make this {member.user.firstName}'s primary location">
                    <Star class="size-4" aria-hidden="true"/>
                </Button>
            </form>
        {/if}
        <ConfirmAction
                action="?/updateStaffOnLocation"
                fields={{ staffId: member.profile.id, action: 'remove' }}
                title="Remove {member.user.firstName} {member.user.lastName} from {location?.name}?"
                description="They lose access to this location's requests and timesheets. Their other locations are unchanged."
                confirmLabel="Remove from location"
                label="Remove {member.user.firstName} from this location"
                icon={UserMinus}
                iconOnly
                variant="ghost"
        />
    </div>
{/snippet}

{#snippet emptyStaff()}
    <EmptyState icon={Users} title="No staff assigned" description="Add your team to this location so they can see its requests and timesheets."/>
{/snippet}

{#if location}
    <Page>
        <DetailHeader title={location.name} subtitle={company?.companyName ?? 'Office location'} back={{ href: '/locations', label: 'Locations' }}>
            {#snippet actions()}
                {#if user?.role !== USER_ROLES.SUPERADMIN && data.canCreateRequisitions}
                    <Button class="gap-2" on:click={() => (drawerExpanded = true)}><Plus class="size-4" aria-hidden="true"/>New requisition</Button>
                {/if}
            {/snippet}
        </DetailHeader>

        {#if user?.role !== USER_ROLES.SUPERADMIN && data.clientStatus && !data.canCreateRequisitions}
            <Notice tone="pending">Your account is {String(data.clientStatus ?? 'PENDING').toLowerCase()}, so posting requests is paused until it's approved.</Notice>
        {/if}

        <DetailTabs {tabs} bind:value={tab} label="Location sections">
            {#snippet children(active)}
                {#if active === 'details'}
                    <div class="grid gap-6 lg:grid-cols-2">
                        <Section title="Location">
                            {#snippet actions()}
                                {#if !editingLocation}
                                    <Button variant="outline" size="sm" class="gap-2" aria-label="Edit location details" on:click={() => (editingLocation = true)}><Pencil class="size-4" aria-hidden="true"/>Edit</Button>
                                {/if}
                            {/snippet}
                            {#if editingLocation}
                                <form method="POST" use:addressEnhance action="?/updateLocationDetails" class="space-y-4">
                                    {#if $addressErrors && Object.keys($addressErrors).length}
                                        <Notice tone="negative" alert>{#each Object.values($addressErrors) as error}<p>{error}</p>{/each}</Notice>
                                    {/if}
                                    <div class="space-y-2">
                                        <Label for="address-search">Street address</Label>
                                        <p class="text-sm text-muted-foreground">On file: {location.completeAddress || 'none'}</p>
                                        <AddressSearchAutocomplete
                                                bind:selected={selectedAddress}
                                                on:select={handleAddressSelect}
                                                on:clear={handleClear}
                                                placeholder="Search for the new address…"
                                                country="us"
                                                maxResults={8}
                                        />
                                        <input type="hidden" name="lat" value={$locationForm.lat}/>
                                        <input type="hidden" name="lon" value={$locationForm.lon}/>
                                        <input type="hidden" name="completeAddress" value={$locationForm.completeAddress}/>
                                        <input type="hidden" name="name" value={location.name}/>
                                    </div>
                                    <div class="space-y-1.5">
                                        <Label for="timezone">Timezone</Label>
                                        <Select.Root
                                                preventScroll={false}
                                                selected={{ value: $locationForm.timezone || selectedTimezone, label: ($locationForm.timezone || selectedTimezone || 'Choose a timezone').replace('_', ' ') }}
                                                onSelectedChange={(v) => { v && ($locationForm.timezone = String(v.value)); }}
                                        >
                                            <Select.Trigger id="timezone"><Select.Value/></Select.Trigger>
                                            <Select.Content class="max-h-60 overflow-y-auto">
                                                {#each Intl.supportedValuesOf('timeZone').filter((z) => z.startsWith('America')) as timezone}
                                                    <Select.Item value={timezone}>{timezone.replace('_', ' ')}</Select.Item>
                                                {/each}
                                            </Select.Content>
                                        </Select.Root>
                                        <input name="timezone" type="hidden" value={$locationForm.timezone}/>
                                    </div>
                                    <div class="grid gap-4 sm:grid-cols-2">
                                        <div class="space-y-2">
                                            <Label for="companyPhone">Office phone</Label>
                                            <PhoneInput id="companyPhone" name="companyPhone" bind:value={$locationForm.companyPhone}/>
                                        </div>
                                        <!-- Onboarding stores ONE number as cell or office; both need a field here. -->
                                        <div class="space-y-2">
                                            <Label for="cellPhone">Office cell</Label>
                                            <PhoneInput id="cellPhone" name="cellPhone" bind:value={$locationForm.cellPhone}/>
                                        </div>
                                    </div>
                                    <div class="space-y-2">
                                        <Label for="email">Email</Label>
                                        <Input id="email" name="email" type="email" bind:value={$locationForm.email} placeholder="frontdesk@example.com"/>
                                    </div>
                                    <div class="space-y-2">
                                        <Label for="website">Website</Label>
                                        <Input id="website" name="website" type="url" bind:value={$locationForm.website} placeholder="https://example.com"/>
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <Button type="submit" disabled={$isAddressSubmitting}>{$isAddressSubmitting ? 'Saving…' : 'Save changes'}</Button>
                                        <Button variant="outline" on:click={() => cancelEdit('location')}>Cancel</Button>
                                    </div>
                                </form>
                            {:else}
                                <div class="space-y-4">
                                    <address class="not-italic">{location.completeAddress || 'No address on file'}</address>
                                    <FactGrid columns={2} facts={[
                                        { label: 'Office phone', value: location.companyPhone || '—' },
                                        { label: 'Office cell', value: location.cellPhone || '—' },
                                        { label: 'Email', value: location.email || '—' },
                                        { label: 'Website', value: location.website || '—' },
                                        { label: 'Timezone', value: location.timezone?.replace('_', ' ') || 'Not set' },
                                        { label: 'Practice', value: company?.companyName || '—' }
                                    ]}/>
                                </div>
                            {/if}
                        </Section>

                        <Section title="Operating hours" flush={!editingHours}>
                            {#snippet actions()}
                                {#if !editingHours}
                                    <Button variant="outline" size="sm" class="gap-2" aria-label="Edit operating hours" on:click={() => (editingHours = true)}><Pencil class="size-4" aria-hidden="true"/>Edit</Button>
                                {/if}
                            {/snippet}
                            {#if editingHours}
                                <form use:hoursEnhance method="POST" action="?/updateOperatingHours" class="space-y-4">
                                    <ul class="divide-y rounded-lg border">
                                        {#each Array.from({ length: 7 }, (_, i) => i) as dayIndex}
                                            <li class="grid grid-cols-2 items-center gap-3 p-3">
                                                <span class="font-semibold">{getDayName(dayIndex)}</span>
                                                <div class="flex items-center justify-end gap-2">
                                                    <Checkbox id={`closed-${dayIndex}`} checked={!!JSONHours[dayIndex]?.isClosed} onCheckedChange={(v) => setHours(dayIndex, { isClosed: v === true })}/>
                                                    <Label for={`closed-${dayIndex}`} class="font-normal">Closed</Label>
                                                </div>
                                                <div class="space-y-1">
                                                    <Label for={`open-${dayIndex}`} class="text-xs">Opens</Label>
                                                    <Input id={`open-${dayIndex}`} type="time" value={formatTimeString(JSONHours[dayIndex]?.openTime) || ''} disabled={JSONHours[dayIndex]?.isClosed}
                                                           on:change={(e) => setHours(dayIndex, { openTime: formatTimeString(e.currentTarget.value) })}/>
                                                </div>
                                                <div class="space-y-1">
                                                    <Label for={`close-${dayIndex}`} class="text-xs">Closes</Label>
                                                    <Input id={`close-${dayIndex}`} type="time" value={formatTimeString(JSONHours[dayIndex]?.closeTime) || ''} disabled={JSONHours[dayIndex]?.isClosed}
                                                           on:change={(e) => setHours(dayIndex, { closeTime: formatTimeString(e.currentTarget.value) })}/>
                                                </div>
                                            </li>
                                        {/each}
                                    </ul>
                                    <input type="hidden" name="operatingHours" value={stringifiedHours}/>
                                    {#if $hoursErrors && Object.keys($hoursErrors).length}
                                        <Notice tone="negative" alert>{#each Object.values($hoursErrors) as error}<p>{error}</p>{/each}</Notice>
                                    {/if}
                                    <div class="flex flex-wrap gap-2">
                                        <Button type="submit" disabled={$isHoursSubmitting}>{$isHoursSubmitting ? 'Saving…' : 'Save hours'}</Button>
                                        <Button variant="outline" on:click={() => cancelEdit('hours')}>Cancel</Button>
                                    </div>
                                </form>
                            {:else if location.operatingHours}
                                <ul class="divide-y">
                                    {#each Array.from({ length: 7 }, (_, i) => i) as dayIndex}
                                        {@const day = location.operatingHours[dayIndex]}
                                        <li class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6">
                                            <span class="font-semibold">{getDayName(dayIndex)}</span>
                                            {#if day?.isClosed}<span class="text-muted-foreground">Closed</span>
                                            {:else if day?.openTime && day?.closeTime}<span class="tabular-nums">{formatTimeForDisplay(day.openTime)}–{formatTimeForDisplay(day.closeTime)}</span>
                                            {:else}<span class="text-muted-foreground">Not set</span>{/if}
                                        </li>
                                    {/each}
                                </ul>
                            {:else}
                                <p class="px-5 py-4 text-sm text-muted-foreground sm:px-6">Hours not set yet.</p>
                            {/if}
                        </Section>
                    </div>
                {:else if active === 'staff'}
                    <div class="space-y-6">
                        <Section title="Staff at this location" flush>
                            {#snippet actions()}
                                <InviteStaffToLocationDialog bind:open={staffDialogOpen} {allStaff} {location} {company} {assignForm}/>
                            {/snippet}
                            <StaffTable rows={staffRows} actions={staffActions} empty={emptyStaff} class="rounded-none border-0 shadow-none"/>
                        </Section>
                        {#if (data.pendingInvites?.length ?? 0) > 0}
                            <Section title="Pending invites" flush>
                                <PendingInvitesTable invites={data.pendingInvites} resendAction="?/resendStaffInvite" revokeAction="?/revokeStaffInvite" showLocation={false} embedded/>
                            </Section>
                        {/if}
                    </div>
                {:else if active === 'requisitions'}
                    {#snippet emptyReqs()}
                        <EmptyState icon={ClipboardList} title="No requisitions yet" description="Requests posted for this location show up here.">
                            {#if user?.role !== USER_ROLES.SUPERADMIN && data.canCreateRequisitions}
                                <Button on:click={() => (drawerExpanded = true)}>Post the first request</Button>
                            {/if}
                        </EmptyState>
                    {/snippet}
                    <DataTable rows={requisitionRows} columns={requisitionColumns} key={(r) => r.id} rowHref={(r) => `/requisitions/${r.id}`}
                               rowLabel={(r) => `Open requisition ${r.id}`} caption="Location requisitions" empty={emptyReqs}/>
                {/if}
            {/snippet}
        </DetailTabs>
    </Page>
    <AddRequisitionDrawer {user} bind:drawerExpanded {clientForm} {location}/>
{:else}
    <Page width="narrow">
        <EmptyState icon={AlertCircle} title="Location not found" description="This location couldn't be found, or it isn't one of yours.">
            <Button href="/locations">Back to locations</Button>
        </EmptyState>
    </Page>
{/if}
