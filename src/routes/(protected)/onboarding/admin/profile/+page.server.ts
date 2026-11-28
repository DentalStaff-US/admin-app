import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// This route was an empty page. A DTSS admin's profile lives in Settings, so
// send them there rather than show a blank screen.
export const load: PageServerLoad = async () => {
	redirect(302, '/settings?tab=PROFILE&role=ADMIN');
};
