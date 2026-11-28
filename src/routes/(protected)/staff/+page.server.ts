import { redirect } from '@sveltejs/kit';

// Staff management lives at /team now; this keeps old links working.
export const load = () => redirect(301, '/team');
