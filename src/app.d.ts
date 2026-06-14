declare global {
	namespace App {
		interface Locals {
			user: import('$lib/server/auth').AppUser | null;
			session: import('$lib/server/auth').AuthSession | null;
			startTimer: number;
			error: string;
			errorId: string;
			errorStackTrace: string;
			message: unknown;
			track: unknown;
		}
		interface Error {
			code?: string;
			errorId?: string;
		}
		interface PageData {
			flash?: { type: 'success' | 'error'; message: string };
		}
	}
}

export {};
