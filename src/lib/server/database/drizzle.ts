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
	},
	// Add these critical settings:
	max: 20, // Maximum pool size
	min: 2, // Minimum pool size (keep some connections alive)
	idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
	connectionTimeoutMillis: 5000, // Return error after 5 seconds if can't connect
	// PostgreSQL keepalive settings (prevents connection drops)
	keepAlive: true,
	keepAliveInitialDelayMillis: 10000
});

pool.on('error', (err, client) => {
	console.error('Unexpected error on idle client', err);
	// Don't exit the process - let the pool recover
});

// await pool.connect();
const db = drizzle(pool);

export default db;
