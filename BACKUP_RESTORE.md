# PostgreSQL Backup and Restore

## Production requirements

- Use encrypted backups in a storage account separate from the database host. Restrict access by role and retain backups according to the organization's recovery objectives.
- For point-in-time recovery, enable PostgreSQL WAL archiving/PITR with the managed database provider. A periodic logical dump alone cannot provide point-in-time recovery.
- Protect backup encryption keys separately from the backup files. Do not commit backups or copy them into the repository.
- Schedule regular restore drills. A successful dump is not evidence that a backup can be restored.
- Do not restore into the live database as a test. Recover into an isolated PostgreSQL instance/database and verify the Alembic revision and application-level data.

## Local Compose restore drill (Windows PowerShell)

With the existing Compose PostgreSQL service running, execute:

```powershell
Set-Location 'C:\path\to\ai-automation-doctor-platform'
.\scripts\test-postgres-backup-restore.ps1
```

The script creates a uniquely named custom-format dump inside the PostgreSQL container, creates a uniquely named temporary database, restores into that database, and compares the Alembic revision and row counts for agencies, users, integrations, workflows, executions, and incidents. Its `finally` block drops only that exact temporary database and removes only that exact temporary dump. It does not drop, reset, or overwrite the configured application database.

The script requires a Compose PostgreSQL role permitted to create/drop temporary databases. Use a separately isolated development stack for a restore drill; never point the script at production unless the operator has explicitly approved the temporary database operations and verified the target cluster.
