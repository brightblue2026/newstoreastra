# Backup and recovery

Status: tooling and a disposable-database recovery drill are implemented. Production backup is **not activated**: no backup repository, encryption key, database credential or Supabase S3 credential is available in this workspace/repository. A checked-in workflow is not evidence of a successful production backup.

## What is protected

`scripts/backup.ts create` exports the application's PostgreSQL `public` schema in custom format, copies the entire Supabase `product-images` bucket using S3/rclone, records object metadata and SHA-256 checksums, and stores the package in an encrypted restic repository. It then removes plaintext staging files. The scheduled workflow runs `restic check` after creation and never uploads customer backups as GitHub artifacts.

This covers application records and image bytes, not a full Supabase platform clone: Supabase Auth, database roles, other schemas/buckets, external secrets, scheduled jobs and hosting configuration require their own recovery procedures. Product images in this app are immutable UUID paths; pause catalogue edits/deletions during backup to keep the database and object export aligned. The database dump is transactionally consistent, but a separate object export is not an atomic cross-service snapshot.

Supabase confirms that native database backups do not contain Storage object bytes: https://supabase.com/docs/guides/platform/backups

## Activate on a trusted runner

1. Choose an independent private backup repository (for example an S3-compatible bucket). Enable versioning/Object Lock where supported, restrictive access and storage alerts. Keep recovery credentials separate from application credentials. An India-resident backup destination is a conservative operational choice; verify applicable requirements with counsel.
2. Install compatible PostgreSQL client tools, restic and rclone. Use a `pg_dump` major version equal to or newer than the source server; validate restores against the intended recovery server version.
3. Initialize the restic repository once on a trusted workstation with `restic init`. Store its unique strong encryption password in a secret manager with a separate recovery copy. Losing the password makes backups unusable.
4. Configure the repository's protected `backups` environment: `BACKUP_DATABASE_URL` (direct or session-mode database connection, TLS `sslmode=verify-full`), optional `BACKUP_DB_CA_PEM`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`, `SUPABASE_S3_ENDPOINT`. Source and backup destination credentials are separate. Use least-privilege accounts; never commit keys.
5. Manually run the backup workflow and record the snapshot ID. Prove restore before setting the repository variable `BACKUP_ENABLED=true`. The schedule is daily at 20:17 UTC; a disabled job means **no backup**, not a successful backup.
6. Configure failure notifications and an independent freshness alarm when no successful snapshot exists within 26 hours. GitHub schedules can be delayed. Native Supabase PITR, when available and configured, complements these off-site backups for a smaller database recovery window.

## Verification and restore

`pnpm backup:verify` restores an exact `BACKUP_SNAPSHOT_ID` from the encrypted repository into temporary files, compares all SHA-256 hashes and restores the database into `RESTORE_DATABASE_URL`. That target must be local, empty and named with `_test` at the end. The script will not drop or overwrite an existing database. It reports restored Product rows and verified files. CI exercises the full path using synthetic data and a synthetic image file; this verifies tooling, not real Supabase S3 access or production recovery.

Monthly: run an isolated restore drill, `restic check --read-data`, compare critical order/invoice/stock records and open a sample of restored images. Time the drill; RTO is measured, not guessed. Do not expose restored customer data publicly. This drill verifies the downloaded storage files; a full S3 re-upload and restored hosted application still require staging verification.

For an actual incident: stop new order writes, preserve logs, restore into a **new** database/project, restore image bytes using the saved paths and metadata, configure roles/secrets/buckets, verify orders/invoices/stock and reconcile all payments since the backup with Razorpay before switching traffic. Never overwrite newer paid orders with an old snapshot.

## Retention

Suggested starting operational policy: 14 daily, 8 weekly and 12 monthly restore points, subject to cost, business approval and legal holds. No automatic deletion/pruning is enabled. Database backups do not replace an accountant-approved GST record archive; statutory records can require longer retention. Keep deletion/retention requests and backup expiry coordinated. Set a documented target RPO/RTO with the business; daily exports alone can lose up to a day's transactions.

## References

- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Restic backup/restore: https://restic.readthedocs.io/en/stable/040_backup.html and https://restic.readthedocs.io/en/stable/050_restore.html
- Supabase S3 access: https://supabase.com/docs/guides/storage/s3/authentication
