/** Skills under their category, both in alphabetical order. */
export function groupByCategory<T extends { name: string; categoryName: string }>(skills: T[]): { name: string; skills: T[] }[] {
	const groups = new Map<string, T[]>();
	for (const skill of skills) groups.set(skill.categoryName, [...(groups.get(skill.categoryName) ?? []), skill]);
	return [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, list]) => ({ name, skills: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
}
