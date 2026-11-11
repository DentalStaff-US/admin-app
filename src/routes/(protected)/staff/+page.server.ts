import { redirect } from '@sveltejs/kit';

// Staff management lives in Settings › Team now; this keeps old links working.
export const load = () => redirect(301, '/settings?tab=STAFF&role=CLIENT');
