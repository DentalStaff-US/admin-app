import crypto from 'node:crypto';

const MAX_AGE_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 30_000;

export type SignedHeaders = {
	'x-job-name': string;
	'x-timestamp': string;
	'x-signature': string;
};

function computeSignature(jobName: string, timestamp: string, secret: string): string {
	return crypto.createHmac('sha256', secret).update(`${jobName}.${timestamp}`).digest('hex');
}

export function signJobRequest(jobName: string, secret: string): SignedHeaders {
	const timestamp = new Date().toISOString();
	return {
		'x-job-name': jobName,
		'x-timestamp': timestamp,
		'x-signature': computeSignature(jobName, timestamp, secret)
	};
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyJobRequest(
	headers: Headers,
	expectedJobName: string,
	secret: string
): VerifyResult {
	const jobName = headers.get('x-job-name');
	const timestamp = headers.get('x-timestamp');
	const signature = headers.get('x-signature');

	if (!jobName || !timestamp || !signature) {
		return { ok: false, reason: 'missing signature headers' };
	}
	if (jobName !== expectedJobName) {
		return { ok: false, reason: 'job name mismatch' };
	}

	const ts = Date.parse(timestamp);
	if (Number.isNaN(ts)) {
		return { ok: false, reason: 'invalid timestamp' };
	}
	const age = Date.now() - ts;
	if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
	if (age < -CLOCK_SKEW_MS) return { ok: false, reason: 'future timestamp' };

	const expected = computeSignature(jobName, timestamp, secret);
	const sigBuf = Buffer.from(signature, 'hex');
	const expBuf = Buffer.from(expected, 'hex');
	if (sigBuf.length === 0 || sigBuf.length !== expBuf.length) {
		return { ok: false, reason: 'bad signature length' };
	}
	if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
		return { ok: false, reason: 'signature mismatch' };
	}
	return { ok: true };
}
