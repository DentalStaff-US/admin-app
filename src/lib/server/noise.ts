const BOT_SCAN_PATH_PATTERNS: RegExp[] = [
	/^\/\.env(\.|$)/,
	/^\/\.git(\/|$)/,
	/^\/\.aws(\/|$)/,
	/^\/\.ssh(\/|$)/,
	/^\/\.vscode(\/|$)/,
	/^\/wp-(admin|login|content|includes|json)(\/|\.|$)/,
	/^\/xmlrpc\.php$/,
	/^\/phpmyadmin(\/|$)/i,
	/^\/(pma|myadmin|adminer)(\/|$)/i,
	/^\/administrator(\/|$)/i,
	/^\/admin\.(php|asp|aspx|jsp)$/i,
	/\.(php|asp|aspx|jsp|cgi)$/i,
	/^\/vendor\//,
	/^\/(backup|backups|old|new|test|staging)(\/|$)/i,
	/^\/(config|configuration)\.(php|json|yml|yaml)$/i,
	/^\/(server-status|server-info)$/,
	/^\/cgi-bin\//,
	/^\/HNAP1\//i
];

export function isBotScanPath(pathname: string): boolean {
	return BOT_SCAN_PATH_PATTERNS.some((p) => p.test(pathname));
}
