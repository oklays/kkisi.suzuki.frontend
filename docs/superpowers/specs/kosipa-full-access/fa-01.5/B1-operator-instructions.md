# B1: exporting production view and procedure definitions (operator instructions)

**Who runs this:** an authorized production operator only. Engineering does not run it and has no production access.

**What it exports:** definitions only, never data. That is table structures, view bodies, stored procedures and functions, triggers, indexes and server settings.

**Why it's needed:** without these, no balance or loan figure computed natively can be proven equal to legacy (12 B1; MIG-103). Of particular interest:

- `x_proc_create_matrix` (the payroll generator)
- `x_proc_create_shu`
- the views behind savings balances and loan amounts

**Tooling:** `apps/web/scripts/kosipa-b1-schema-export.sh`. It was rehearsed on synthetic objects of every kind (`apps/web/tests/kosipa-b1-export-db.test.mjs`, passing on 30 Oct 2026). The rehearsal showed:

- every definition kind is exported;
- `DEFINER` and `AUTO_INCREMENT` counters are stripped;
- a sentinel row value never appears in the output;
- the password never appears in any output.

## Steps

1. **Use a read-only account.** It needs `SELECT`, `SHOW VIEW` and `TRIGGER` on the KOSIPA database, plus `SHOW CREATE ROUTINE` (MariaDB ≥ 11.3) or `SELECT` on `mysql.proc` to read procedure bodies. Do not use a writer account.

2. **On the server (SSH), create the option file** `~/kosipa-b1.cnf` with mode `600`:

   ```ini
   [client]
   user=<read-only account>
   password=<its password>
   host=localhost
   ```

   The password never goes on the command line.

3. **Copy the script** to the server and make it executable.

4. **Dry run.** This executes nothing and prints the plan:

   ```bash
   ./kosipa-b1-schema-export.sh --database <kosipa db, e.g. n1608204_smart_kopkar> --defaults-file ~/kosipa-b1.cnf --out ~/kosipa-b1-<date>
   ```

5. **Real run.** Run the same command with `--run` added.

   - It refuses to finish if the dump ever contains `INSERT` or `REPLACE` statements.
   - If it prints `NOTE: no scheduled event is visible`, run this as the cPanel owner and report the number:

     ```sql
     SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='<db>';
     ```

     Events need the `EVENT` privilege to be seen at all.

6. **Hand over the folder unchanged:** `schema.sql`, `objects.tsv`, `indexes.tsv`, `server.tsv`, `SHA256SUMS`. Send it through the channel used for earlier schema evidence (`docs/migration/operator-handoff-schema-evidence.md`).

7. **Delete the option file:** `rm ~/kosipa-b1.cnf`.

## What happens next (engineering, offline)

The exported bodies replace the view and procedure stubs of the local staging copy. Only then can the reconciliation in 10 §5 compare native figures with legacy. Until B1 arrives, **no financial parity is claimed**, and no financial command (savings, loans, payroll, SHU) is enabled anywhere.
