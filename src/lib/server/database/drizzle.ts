// import { DATABASE_URL } from '$env/static/private';
import * as dotenv from 'dotenv';
dotenv.config();
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
	// connectionString: DATABASE_URL
	ssl: {
		rejectUnauthorized: false // Add this to accept self-signed certificates
	}
});

await pool.connect();
const db = drizzle(pool);

export default db;
