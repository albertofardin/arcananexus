-- Remove the review/approval queue concept: every Action now always has
-- immediate effect, so the `status` field (and the `ActionStatus` enum it
-- referenced) no longer serves any purpose.
ALTER TABLE "Action" DROP COLUMN "status";

DROP TYPE "ActionStatus";
