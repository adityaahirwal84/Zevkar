$ErrorActionPreference = 'Stop'

$suffix = [Guid]::NewGuid().ToString('N')
$restoreDatabase = "phase5_restore_$suffix"
$dumpPath = "/tmp/$restoreDatabase.dump"
$databaseCreated = $false
$dumpCreated = $false

function Invoke-PostgresContainer {
    param([string[]]$Arguments)
    & docker compose exec -T postgres @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL container command failed with exit code $LASTEXITCODE."
    }
}

function Get-DatabaseFingerprint {
    param([string]$Database)
    $query = "SELECT (SELECT version_num FROM alembic_version) || '|' || (SELECT count(*) FROM agencies) || '|' || (SELECT count(*) FROM users) || '|' || (SELECT count(*) FROM integrations) || '|' || (SELECT count(*) FROM workflows) || '|' || (SELECT count(*) FROM executions) || '|' || (SELECT count(*) FROM incidents)"
    if ($Database -eq '__SOURCE__') {
        $result = $query | & docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    } else {
        $result = $query | & docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$1"' sh $Database
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read the migration and row-count fingerprint for database $Database."
    }
    return ($result -join '').Trim()
}

try {
    $service = & docker compose ps --status running --services postgres
    if ($LASTEXITCODE -ne 0 -or $service -notcontains 'postgres') {
        throw 'The Compose PostgreSQL service must already be running.'
    }

    $existingQuery = "SELECT 1 FROM pg_database WHERE datname = '$restoreDatabase'"
    $existing = $existingQuery | & docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not verify the isolated restore database name.'
    }
    if (($existing -join '').Trim()) {
        throw "Refusing to overwrite existing database $restoreDatabase."
    }

    $sourceFingerprint = Get-DatabaseFingerprint -Database '__SOURCE__'

    $dumpCreated = $true
    Invoke-PostgresContainer @(
        'sh', '-c',
        'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$1"',
        'sh', $dumpPath
    )

    Invoke-PostgresContainer @(
        'sh', '-c',
        'createdb --template=template0 -U "$POSTGRES_USER" "$1"',
        'sh', $restoreDatabase
    )
    $databaseCreated = $true

    Invoke-PostgresContainer @(
        'sh', '-c',
        'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d "$1" "$2"',
        'sh', $restoreDatabase, $dumpPath
    )
    $restoredFingerprint = Get-DatabaseFingerprint -Database $restoreDatabase
    if ($sourceFingerprint -ne $restoredFingerprint) {
        throw 'The restored migration revision or key-table row counts did not match the source.'
    }

    Write-Output 'Backup/restore verification passed: Alembic revision and key-table row counts match.'
}
finally {
    try {
        if ($databaseCreated) {
            Invoke-PostgresContainer @(
                'sh', '-c',
                'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"',
                'sh', $restoreDatabase
            )
        }
    }
    finally {
        if ($dumpCreated) {
            Invoke-PostgresContainer @('sh', '-c', 'rm -f -- "$1"', 'sh', $dumpPath)
        }
    }
}
