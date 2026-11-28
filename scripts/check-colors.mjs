#!/usr/bin/env node
// Reports Tailwind palette literals and hex colors in app code (design docs, 02 › The
// no-literals rule). Documented exceptions: gradient stops, emerald-300 on navy strips,
// and email templates, since mail clients can't read our tokens. Comments don't count.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LITERAL =
	/\b(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:gray|slate|blue|sky|teal|emerald|yellow|amber|orange|red|green|purple)-\d+|#[0-9a-fA-F]{3,8}\b/g;
const ALLOWED = new Set(['from-teal-50', 'to-emerald-50', 'from-slate-50', 'to-sky-50', 'text-emerald-300']);

function* walk(dir) {
	for (const name of readdirSync(dir)) {
		if (name === 'design-tokens' || name === 'email' || name.endsWith('.test.ts')) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) yield* walk(path);
		else if (/\.(svelte|ts)$/.test(name)) yield path;
	}
}

let found = 0;
for (const file of walk('src')) {
	readFileSync(file, 'utf8')
		.split('\n')
		.forEach((line, i) => {
			if (/^\s*(\/\*|\*|\/\/)/.test(line)) return;
			for (const [match] of line.matchAll(LITERAL)) {
				if (ALLOWED.has(match)) continue;
				console.log(`${file}:${i + 1}  ${match}`);
				found++;
			}
		});
}
console.log(found ? `${found} color literal(s) found` : 'No color literals found');
process.exit(found && !process.argv.includes('--report') ? 1 : 0);
