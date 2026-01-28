// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
	throw new Error('No url');
}

export default defineConfig({
	schema: './src/lib/server/database/schemas/*',
	out: './src/lib/server/database/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: DATABASE_URL,
		ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined
	},
	extensionsFilters: ['postgis']
});
