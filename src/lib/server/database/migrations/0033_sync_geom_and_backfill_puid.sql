-- 0033_sync_geom_and_backfill_puid.sql
--
-- Two converging changes that have drifted between dev/staging/prod because
-- they were applied via the SQL editor on dev only:
--
--   1. Geom auto-population for candidate_profiles + company_office_locations.
--      Dev has trg_update_candidate_geom calling update_geom_from_lat_lon();
--      offices have no equivalent trigger anywhere, which is why all 8
--      offices currently have NULL geom.
--
--   2. The puid column / sequence on candidate_profiles. Dev has it; prod
--      does not, because migration 0029 referenced nextval(puid_seq) without
--      a corresponding CREATE SEQUENCE statement.
--
-- Every block is idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS)
-- so this can run on any environment regardless of current state and converge
-- them all to the same end state.

--------------------------------------------------------------------------------
-- 1. Geom sync function + triggers
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_geom_from_lat_lon()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lon IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lon::float, NEW.lat::float), 4326);
    ELSE
        NEW.geom := NULL;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_update_candidate_geom ON public.candidate_profiles;
--> statement-breakpoint
CREATE TRIGGER trg_update_candidate_geom
    BEFORE INSERT OR UPDATE OF lat, lon ON public.candidate_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_geom_from_lat_lon();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_update_office_geom ON public.company_office_locations;
--> statement-breakpoint
CREATE TRIGGER trg_update_office_geom
    BEFORE INSERT OR UPDATE OF lat, lon ON public.company_office_locations
    FOR EACH ROW EXECUTE FUNCTION public.update_geom_from_lat_lon();
--> statement-breakpoint

-- Backfill any existing rows where geom is NULL but lat/lon are set.
-- The trigger fires on UPDATE OF lat/lon, so a no-op `SET lat = lat` is enough
-- to recompute geom without duplicating the ST_SetSRID expression here.
UPDATE public.candidate_profiles
SET lat = lat
WHERE geom IS NULL AND lat IS NOT NULL AND lon IS NOT NULL;
--> statement-breakpoint

UPDATE public.company_office_locations
SET lat = lat
WHERE geom IS NULL AND lat IS NOT NULL AND lon IS NOT NULL;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- 2. puid column + sequence on candidate_profiles
--------------------------------------------------------------------------------

-- Sequence first (was created manually on dev, never on prod).
CREATE SEQUENCE IF NOT EXISTS public.puid_seq START WITH 5000 INCREMENT BY 1;
--> statement-breakpoint

-- Add the column without constraints; we'll add the unique + NOT NULL after
-- the backfill so this works on environments where the column doesn't exist
-- yet (prod) AND environments where it does (dev).
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS puid INTEGER;
--> statement-breakpoint

-- Backfill rows where puid is NULL, picking up after the highest existing
-- puid so we don't collide with values already assigned on dev. If no puids
-- exist yet (fresh prod), MAX is NULL → COALESCE → 4999, so the first row
-- gets 5000.
WITH starting_point AS (
    SELECT COALESCE((SELECT MAX(puid) FROM public.candidate_profiles), 4999) + 1 AS start_value
), ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS row_offset
    FROM public.candidate_profiles
    WHERE puid IS NULL
)
UPDATE public.candidate_profiles
SET puid = (SELECT start_value FROM starting_point) + ordered.row_offset
FROM ordered
WHERE public.candidate_profiles.id = ordered.id;
--> statement-breakpoint

-- Move the sequence past the new max so future inserts get a fresh value.
SELECT setval(
    'public.puid_seq',
    GREATEST((SELECT COALESCE(MAX(puid), 4999) FROM public.candidate_profiles), 4999)
);
--> statement-breakpoint

ALTER TABLE public.candidate_profiles
    ALTER COLUMN puid SET DEFAULT nextval('public.puid_seq');
--> statement-breakpoint

-- Enforce uniqueness via a unique index. Functionally identical to the
-- ADD CONSTRAINT … UNIQUE in migration 0029, but doesn't require a DO block
-- (some web SQL editors choke on anonymous PL/pgSQL).
CREATE UNIQUE INDEX IF NOT EXISTS candidate_profiles_puid_unique
    ON public.candidate_profiles(puid);
--> statement-breakpoint

ALTER TABLE public.candidate_profiles ALTER COLUMN puid SET NOT NULL;
