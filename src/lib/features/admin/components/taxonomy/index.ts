// Public API for the admin taxonomy and settings screens: disciplines,
// experience levels, skill categories, skills, documents, blacklists.
export { default as BlacklistTable, type BlacklistRow } from './BlacklistTable.svelte';
// Generic-sounding pieces carry a Taxonomy prefix so the merged admin barrel can't clash.
export { default as TaxonomyConfirmDialog } from './ConfirmFormDialog.svelte';
export { default as DisciplineFields } from './DisciplineFields.svelte';
export { default as DisciplinesTable, type DisciplineRow } from './DisciplinesTable.svelte';
export { default as DocumentsTable } from './DocumentsTable.svelte';
export { default as ExperienceLevelsTable, type ExperienceLevelRow } from './ExperienceLevelsTable.svelte';
export { default as TaxonomyIconAction } from './IconAction.svelte';
export { default as TaxonomyReorderButtons } from './ReorderButtons.svelte';
export { default as TaxonomySearchField } from './SearchField.svelte';
export { default as SkillCategoriesTable, type SkillCategoryRow } from './SkillCategoriesTable.svelte';
export { default as SkillsTable, type SkillRow } from './SkillsTable.svelte';
// Named explicitly (not `export *`): the admin barrel merges several slices.
export {
	DOCUMENT_TYPES,
	documentTypeLabel,
	pageRows as pageLoadedRows,
	sortRows as sortLoadedRows,
	type DocumentType
} from './taxonomy';
export {
	candidateName as documentCandidateName,
	filterDocuments,
	isExpiringSoon,
	isGatingExpired,
	type CredentialFilter,
	type DocumentRow
} from './documents';
