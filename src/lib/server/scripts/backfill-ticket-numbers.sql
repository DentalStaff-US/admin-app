-- Add + backfill support_tickets.ticket_number (the short, human-friendly
-- reference shown as "Ticket #42"; the UUID `id` stays the canonical key).
--
-- RUN THIS INSTEAD OF `npm run migrate` for this change.
-- `drizzle-kit push` adds the NOT NULL serial column by TRUNCATING the table
-- (data loss). This script does the same end result safely: add the column
-- NULLABLE, backfill every row, then enforce NOT NULL — no truncation.
--
-- The end state is byte-for-byte what `serial('ticket_number').notNull()
-- .unique()` describes (a sequence named support_tickets_ticket_number_seq,
-- OWNED BY the column, with a nextval default, plus a NOT NULL + UNIQUE),
-- so the Drizzle schema matches afterward and a later `push` is a no-op.
--
-- Idempotent: safe to run on a fresh prod DB (column missing, rows present) and
-- to re-run on staging (column already added by an earlier push, table empty).
-- Run once per database.

BEGIN;

-- 1. The sequence backing the serial. (serial uses exactly this name.)
CREATE SEQUENCE IF NOT EXISTS support_tickets_ticket_number_seq;

-- 2. Add the column NULLABLE — adding a nullable column never truncates.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_number integer;

-- 3. Number every row in creation order (oldest = #1). Two-step negative
--    parking avoids transient unique-constraint collisions during the update
--    (Postgres checks the unique index per row, so we can't swap two numbers
--    in a single statement).
WITH ordered AS (
	SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
	FROM support_tickets
)
UPDATE support_tickets s
SET ticket_number = -o.rn
FROM ordered o
WHERE s.id = o.id;

UPDATE support_tickets
SET ticket_number = -ticket_number
WHERE ticket_number < 0;

-- 4. Wire the column to the sequence so new tickets auto-increment (this is
--    what makes it a real serial).
ALTER TABLE support_tickets
	ALTER COLUMN ticket_number SET DEFAULT nextval('support_tickets_ticket_number_seq');
ALTER SEQUENCE support_tickets_ticket_number_seq OWNED BY support_tickets.ticket_number;

-- 5. Point the sequence just past the highest number so the next ticket is
--    MAX+1. is_called=false → the next nextval() returns this value exactly.
--    COALESCE(MAX,0)+1 is >= 1, so this is valid even on an empty table.
SELECT setval(
	'support_tickets_ticket_number_seq',
	COALESCE((SELECT MAX(ticket_number) FROM support_tickets), 0) + 1,
	false
);

-- 6. Now that every row has a value, enforce NOT NULL + UNIQUE. The unique
--    constraint name matches Drizzle's `.unique()` convention so push sees no
--    diff. Guarded so a re-run (or a constraint left by an earlier push) is OK.
ALTER TABLE support_tickets ALTER COLUMN ticket_number SET NOT NULL;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_ticket_number_unique'
	) THEN
		ALTER TABLE support_tickets
			ADD CONSTRAINT support_tickets_ticket_number_unique UNIQUE (ticket_number);
	END IF;
END $$;

COMMIT;
