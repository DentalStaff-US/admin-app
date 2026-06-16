// lib/server/auth.ts — Better Auth instance for the admin/client portal.
// Replaces the deprecated Lucia setup (lib/server/lucia.ts).
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, twoFactor, emailOTP, oneTimeToken } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { Argon2id } from 'oslo/password';
import { env } from '$env/dynamic/private';

import db from '$lib/server/database/drizzle';
import {
	userTable,
	sessionTable,
	accountTable,
	verificationTable,
	twoFactorTable
} from '$lib/server/database/schemas/auth';
import { ac, roles } from '$lib/permissions';
import { EmailService } from '$lib/server/email/emailService';
import { USER_ROLES } from '$lib/config/constants';

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 days (matches Lucia)

export const auth = betterAuth({
	appName: 'Dental Temps Staffing Solutions',
	baseURL: env.BASE_URL,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins: [env.BASE_URL, env.CANDIDATE_APP_DOMAIN].filter(Boolean) as string[],

	database: drizzleAdapter(db, {
		provider: 'pg',
		// Keys MUST match each model's resolved modelName (see below): user→'users',
		// session→'sessions', account/verification/twoFactor unchanged.
		schema: {
			users: userTable,
			sessions: sessionTable,
			account: accountTable,
			verification: verificationTable,
			twoFactor: twoFactorTable
		}
	}),

	user: {
		modelName: 'users',
		fields: {
			// Better Auth field → existing Drizzle property
			emailVerified: 'verified',
			image: 'avatarUrl'
		},
		additionalFields: {
			// Collected at signup (required input), stored alongside Better Auth's `name`.
			firstName: { type: 'string', required: true, input: true },
			lastName: { type: 'string', required: true, input: true },
			// App-managed columns Better Auth should be aware of but never accept as input.
			provider: { type: 'string', required: false, input: false },
			providerId: { type: 'string', required: false, input: false },
			receiveEmail: { type: 'boolean', required: false, input: false, defaultValue: true },
			completedOnboarding: {
				type: 'boolean',
				required: false,
				input: false,
				defaultValue: false
			},
			onboardingStep: { type: 'number', required: false, input: false, defaultValue: 1 },
			stripeCustomerId: { type: 'string', required: false, input: false },
			timezone: {
				type: 'string',
				required: false,
				input: false,
				defaultValue: 'America/New_York'
			}
		}
	},
	session: {
		modelName: 'sessions',
		expiresIn: SESSION_EXPIRES_IN_SECONDS
	},
	account: { modelName: 'account' },
	verification: { modelName: 'verification' },

	// Distinct cookie prefix from the candidate app preserves session segregation.
	advanced: {
		cookiePrefix: 'dtss-admin'
	},

	emailAndPassword: {
		enabled: true,
		// Verification is enforced by hooks.server.ts (route gating), not at sign-in,
		// to preserve the existing UX where unverified users land on the verify page.
		requireEmailVerification: false,
		// Keep existing Argon2id (oslo) hashes valid — no forced password resets.
		password: {
			hash: async (password) => new Argon2id().hash(password),
			verify: async ({ hash, password }) => new Argon2id().verify(hash, password)
		},
		sendResetPassword: async ({ user, url }) => {
			await new EmailService().sendEmail({
				to: [{ email: user.email }],
				subject: 'Reset your password',
				html: `<p>We received a request to reset your password.</p>
					<p><a href="${url}">Click here to reset your password</a></p>
					<p>If you did not request this, you can safely ignore this email.</p>`
			});
		}
	},
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await new EmailService().sendEmail({
				to: [{ email: user.email }],
				subject: 'Verify your email address',
				html: `<p>Welcome to Dental Temps Staffing Solutions.</p>
					<p><a href="${url}">Click here to verify your email address</a></p>`
			});
		}
	},

	plugins: [
		admin({
			ac,
			roles,
			// Only SUPERADMIN may call admin-plane endpoints (ban, impersonate, list users…).
			adminRoles: [USER_ROLES.SUPERADMIN],
			defaultRole: USER_ROLES.CANDIDATE,
			// Shown to a banned user who attempts to sign in (static fallback; the
			// sign-in action renders a tailored reason + duration on top of this).
			bannedUserMessage:
				'Your account has been suspended. Please contact support if you believe this is a mistake.'
		}),
		twoFactor(),
		emailOTP({
			async sendVerificationOTP({ email, otp }) {
				await new EmailService().sendEmail({
					to: [{ email }],
					subject: 'Your verification code',
					html: `<p>Your one-time verification code is:</p><p style="font-size:20px"><strong>${otp}</strong></p>`
				});
			}
		}),
		oneTimeToken(),
		// MUST be last: lets server actions / load functions set Better Auth cookies.
		sveltekitCookies(getRequestEvent)
	]
});

export type Auth = typeof auth;

// Better Auth's inferred shapes.
export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;

// App-facing user: Better Auth's user plus the Lucia-compatible aliases that
// hooks.server.ts adds (so existing `user.userId` / `user.verified` /
// `user.avatarUrl` reads across the app keep working unchanged).
export type AppUser = Omit<AuthUser, 'role'> & {
	// Our `role` column is NOT NULL (default 'CANDIDATE'); Better Auth types it
	// as nullable, so we pin it to string for the app's role checks.
	role: string;
	userId: string;
	verified: boolean;
	avatarUrl: string | null;
};
