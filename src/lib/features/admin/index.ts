// Public API of the admin feature (doc 09): admin-menu-only tools.
export * from './components/taxonomy';
export * from './components/people';
export * from './components/comms';

export { default as AdminMenuGrid } from './components/AdminMenuGrid.svelte';
export { ADMIN_MENU_ITEMS } from './adminMenuItems';
export { ADMIN_MENU_AREAS, adminMenuFor, filterAdminMenu, groupAdminMenu, type AdminMenuArea, type AdminMenuItem } from './menu';

export { default as ComplianceQueue } from './components/compliance/ComplianceQueue.svelte';
export {
	SEVERITY_HINTS,
	SEVERITY_TONE,
	complianceTabs,
	reminderHint,
	type ComplianceRow
} from './components/compliance/compliance';
