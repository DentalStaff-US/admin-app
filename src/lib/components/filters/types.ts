export type FilterOption = {
	value: string;
	label: string;
	count?: number;
};

export type FilterDimension = {
	/** Stable key used when dispatching changes, e.g. "city". */
	key: string;
	/** Human label shown on the trigger and on each chip. */
	label: string;
	options: FilterOption[];
	selected: string[];
};
