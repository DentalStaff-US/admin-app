-- One-off reconciliation: make `approved` match `candidate_status = 'ACTIVE'`.
-- Run once against the shared DB after `npm run migrate` has applied the
-- candidate_status enum addition of 'DENIED'. After this, queries can rely
-- on `candidate_status` alone and the `approved` boolean stays in sync via
-- the updateStatus action.
UPDATE candidate_profiles
SET approved = (candidate_status = 'ACTIVE'),
    updated_at = now()
WHERE approved IS DISTINCT FROM (candidate_status = 'ACTIVE');
