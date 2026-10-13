-- Staff sign-in protection. `failedLoginCount` and `lockedUntil` pause sign-in
-- after repeated wrong passwords without depending on Upstash being configured.
-- `sessionVersion` is copied into the JWT; raising it (on a password change)
-- ends every session issued before. Defaults keep existing sessions valid.
ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
