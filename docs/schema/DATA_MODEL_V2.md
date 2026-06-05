# ZakLife Data Model v2

Goal: keep each module on a separate Firebase RTDB path so one tab cannot overwrite another tab during sync.

## Current rule

Firebase can stay as the realtime store. The risk is not Firebase itself; the risk is broad writes and mixed module data.

Do not write with `set()` to broad roots such as:

- `zaklife`
- `zaklife/data`
- `state`

Use module leaf paths and `update`, `PATCH`, or transactions.

## Source of truth

```text
monstea/pos source
  state

zaklife app source
  zaklife/meta
  zaklife/journal/entries
  zaklife/habits/definitions
  zaklife/habits/logs
  zaklife/calendar/notes
  zaklife/ideas/items
  zaklife/ideas/meta
  zaklife/content-calendar
  zaklife/tasks
  zaklife/quickdock
  zaklife/vault_encrypted
  zaklife/automation
  zaklife/agents
  zaklife/nana_messages
  zaklife/wallet/balances/current
```

`zaklife/data` is legacy fallback until migration is applied and the frontend is switched to module paths.

## Shape

```text
zaklife/
  meta/
    schemaVersion: 2
    migrationId
    migratedAt
    legacyPath: "zaklife/data"
    legacyPreserved: true

  journal/
    entries/{YYYY-MM-DD}

  habits/
    definitions/{habitId}
      id
      icon
      name
      cycleDays
      updatedAt
      schemaVersion: 2
    logs/{YYYY-MM-DD}/{habitId}: true

  calendar/
    notes/{dateOrNoteId}

  ideas/
    items/{ideaId}
    meta/
      nextIdeaId
      schemaVersion: 2

  content-calendar/{postId}
  tasks/{taskId}
  quickdock/{links|commands|notes|categories}
  vault_encrypted
  automation/{workerName}
  agents/{agentName}
```

## Migration rule

1. Run a full backup.
2. Verify the backup file.
3. Generate a migration plan from the backup.
4. Inspect counts.
5. Apply migration to module paths.
6. Keep `zaklife/data` untouched until the frontend has read/write module paths.
7. After a stable period, archive legacy data instead of deleting immediately.

## Backup rule

Every backup must contain:

- backup format
- contract version
- Firebase source URL
- exact path list
- data per path
- SHA-256 checksum per path

The backup writer must write to a temp file first, verify it, then replace the final file.

## Rollback

Because migration v2 does not delete `zaklife/data`, rollback is simple:

1. Keep frontend reading legacy path.
2. Ignore module paths.
3. Restore a backup only if legacy data itself was corrupted.

Do not restore over live Firebase without first exporting the current live state.
