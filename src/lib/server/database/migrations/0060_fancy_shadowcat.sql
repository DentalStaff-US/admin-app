-- Convert candidate_document_uploads.expiry_date from timestamptz to a true date.
--
-- HAND-EDITED, deliberately. drizzle-kit emitted this without a USING clause:
--     ALTER TABLE ... ALTER COLUMN "expiry_date" SET DATA TYPE date;
-- which casts a timestamptz using the SESSION timezone. A value stored as
-- 2027-04-30T00:00:00Z, read on a connection set to America/New_York, is
-- 2027-04-29 20:00 — so the bare form can silently move every expiry back a day,
-- and with it every job-visibility decision that reads the column.
--
-- The explicit UTC cast below matches how the application wrote these values before
-- this migration (always midnight UTC), so the conversion is value-preserving.
--
-- This column was never written to by any UI before certification tracking, so it is
-- expected to be entirely NULL at the time this runs and the USING clause is belt
-- and braces. Keep it anyway: it costs nothing and makes the migration correct if it
-- is ever replayed against a database that did capture values.
--
-- An expiration is a calendar date, not an instant. Storing it as one removes the
-- `AT TIME ZONE 'UTC'` pinning that every read previously needed.
ALTER TABLE "candidate_document_uploads"
  ALTER COLUMN "expiry_date" SET DATA TYPE date
  USING ("expiry_date" AT TIME ZONE 'UTC')::date;
