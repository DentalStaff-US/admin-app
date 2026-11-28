// Public API of the people feature (professionals, practices, locations,
// practice staff). Routes import from here, not from internal files (09).
export * from './people';
export * from './lists';

export { default as AddPersonDialog } from './components/AddPersonDialog.svelte';
export { default as BlacklistSection } from './components/BlacklistSection.svelte';
export { default as ConfirmAction } from './components/ConfirmAction.svelte';
export { default as DetailHeader } from './components/DetailHeader.svelte';
export { default as DetailTabs } from './components/DetailTabs.svelte';
export { default as HistoryTimeline } from './components/HistoryTimeline.svelte';
export { default as ListSearch } from './components/ListSearch.svelte';
export { default as PersonAvatar } from './components/PersonAvatar.svelte';
export { default as ProfileNotes } from './components/ProfileNotes.svelte';
export { default as StatusMenu } from './components/StatusMenu.svelte';

export * from './credentials';
export { default as ToneBadge } from './components/ToneBadge.svelte';
export { default as FormPhoneInput } from './components/FormPhoneInput.svelte';

export { default as ProfessionalsTable } from './components/professionals/ProfessionalsTable.svelte';
export { default as ProfessionalDetailPage } from './components/professionals/ProfessionalDetailPage.svelte';
export { default as ClientsTable } from './components/clients/ClientsTable.svelte';
export { default as ClientDetailPage } from './components/clients/ClientDetailPage.svelte';
export { default as StaffTable } from './components/staff/StaffTable.svelte';
export { default as EditLocationDialog } from './components/locations/EditLocationDialog.svelte';
export { default as LocationsTable } from './components/locations/LocationsTable.svelte';
export { default as StaffDetailsDialog } from './components/staff/StaffDetailsDialog.svelte';
