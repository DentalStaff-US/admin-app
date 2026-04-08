// lib/server/lucia.ts
import { Lucia, TimeSpan } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { userTable, sessionTable } from '$lib/server/database/schemas/auth';
import db from '$lib/server/database/drizzle';
import { dev } from '$app/environment';
import { Google } from 'arctic';
// import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';

const adapter = new DrizzlePostgreSQLAdapter(db, sessionTable, userTable);

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		name: 'client-session',
		expires: false, // session cookies have very long lifespan (2 years)
		attributes: {
			secure: !dev
		}
	},
	sessionExpiresIn: new TimeSpan(30, 'd'), // no more active/idle
	getUserAttributes: (attributes) => {
		return {
			userId: attributes.id,
			provider: attributes.provider,
			providerId: attributes.providerId,
			email: attributes.email,
			firstName: attributes.firstName,
			lastName: attributes.lastName,
			role: attributes.role,
			verified: attributes.verified,
			receiveEmail: attributes.receiveEmail,
			token: attributes.token,
			completedOnboarding: attributes.completedOnboarding,
			blacklisted: attributes.blacklisted,
			stripeCustomerId: attributes.stripeCustomerId,
			avatarUrl: attributes.avatarUrl,
			timezone: attributes.timezone
		};
	}
});

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: DatabaseUserAttributes;
		//DatabaseSessionAttributes: DatabaseSessionAttributes;
	}
}

interface DatabaseUserAttributes {
	id: string;
	provider: string;
	providerId: string;
	email: string;
	firstName: string;
	lastName: string;
	role: string;
	verified: boolean;
	receiveEmail: boolean;
	token: string;
	completedOnboarding: boolean;
	blacklisted: boolean;
	stripeCustomerId: string;
	timezone: string;
	avatarUrl: string | null;
}

/*interface DatabaseSessionAttributes {
	sessionExpiresIn: number;
}*/

// const googleRedirectUrl = dev
// 	? 'http://localhost:5173/auth/oauth/google/callback'
// 	: `${BASE_URL}/auth/oauth/google/callback`;

// export const googleOauth = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, googleRedirectUrl);
