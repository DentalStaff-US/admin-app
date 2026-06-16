import type { PageServerLoad } from './$types';

// Landing page after Better Auth's /verify-email redirect. On failure BA appends
// ?error=<code>; on success there's no error param.
export const load: PageServerLoad = async (event) => {
	const error = event.url.searchParams.get('error');
	return { verifyError: error };
};
