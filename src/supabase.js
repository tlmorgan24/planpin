import { createClient } from "@supabase/supabase-js";

const key = import.meta.env.VITE_SUPABASE_API_KEY;
const url = import.meta.env.VITE_SUPABASE_URL;
const supabase = createClient(url, key);

// NOTE: synced_at column of each table means "last synced TO cloud"; last_synced_from_cloud of metadata table is opposite.

// Update all records of cloud database where local database has its "updated_at" more recent than its "last_synced" (or has never been synced):
async function pushToCloud(sqliteDb, supabaseDb, table) {

    // Get local changes not reflected in cloud database (records updated later than last sync)
    const sqliteQuery = await sqliteDb.query(`
        SELECT * 
        FROM ${table}
        WHERE updated_at > synced_at 
            OR synced_at IS NULL
    `);
    const localChanges = sqliteQuery.values;

    // Make changes to cloud database:
    await supabaseDb
        .from(table)
        .upsert(localChanges, {onConflict: ['id']}); // insert if ID does not exist, else update

    // Update synced_at to match the row's updated_at (as current update of row has been synced):
    await sqliteDb.run(`
        UPDATE ${table}
        SET synced_at = updated_at
        WHERE updated_at > synced_at 
            OR synced_at IS NULL
    `);

}

// Update all records of local database where cloud database has a more recent "updated_at" or row does not exist in local database:
async function pullFromCloud(sqliteDb, supabaseDb, table, userId) {

    const metaQuery = await sqliteDb.query(`SELECT last_synced_from_cloud FROM meta WHERE table_name = ? AND user_id = ?`, [table, userId]);
    const lastSyncedFromCloud = metaQuery.values.length > 0 ?
        metaQuery.values[0]['last_synced_from_cloud'] // if query does not return empty (row for this table/user already exists) 
        : null; // if query returns empty (row for this table/user does not exist yet, i.e. never been synced)

    const view = 'user_' + table; // views I created in Supabase, which are already filtered to only records for current authenticated user (efficient)

    const { data, error } = await supabaseDb
        .from(view)
        .select('*')
        .gt('updated_at', lastSyncedFromCloud || '1970-01-01T00:00:00Z'); // for efficiency, only get records changed since last sync (or never synced)
    if (error) { throw error; }

    /*

    If cloud record does not yet exist locally (no matching ID), can do a simple insertion; we don't care about 
    when updated_at is. If it does exist, there will be a conflict, on which we want to update the conflicting 
    record where updated_at is more recent.

    So, we want to do something like this (taking example that table==='images'):

    data.forEach(row => {
        const values = Object.values(row);
        sqliteDb.run(`
            INSERT INTO images (id, marker_id, image_filename, created_at, updated_at, synced_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                marker_id = excluded.marker_id,
                image_filename = excluded.image_filename,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                synced_at = excluded.synced_at,
                deleted_at = excluded.deleted_at
            WHERE excluded.updated_at > images.updated_at;
        `, values);
    });

    Note, the WHERE condition applies only to the ON CONFLICT logic; not to the INSERT INTO logic.
    Note, "excluded" is a special alias for "the column that would have been inserted, had there been no conflict".

    This is the right statement, but we want to batch the statements as part of an executeSet command for efficiency.
    Also, we want to make it general for any table.

    */

    // Get array of statements to be run (each as an object, with 'statement' property for statement itself, and 'values' for values of bind variables):
    const statements = data.map(row => {

        const columns = Object.keys(row);
        const values = Object.values(row);
        const columnsExceptId = columns.filter(col => col !== 'id');
      
        const valuesPlaceholder = columns.map(() => '?').join(', ');  // e.g. '?, ?' etc.
        const set = columnsExceptId.map(col => `${col} = excluded.${col}`).join(', '); // e.g. 'created_at = excluded.created_at, updated_at = excluded.created_at', etc.
      
        return {
            statement: `
                INSERT INTO ${table} (${columns.join(', ')})
                VALUES (${valuesPlaceholder})
                ON CONFLICT(id) DO UPDATE SET
                ${set}
                WHERE excluded.updated_at > ${table}.updated_at;
            `,
            values: values
        };

    });

    // Execute above batched statements:
    sqliteDb.executeSet(statements);
    
    // Get latest updated_at of synced rows, to set last_synced_from_cloud to:
    /* 
    This is a better alternative to just using CURRENT_TIMESTAMP, as if any updates happened to the cloud data 
    during sync (hence were missed in the retrieved data), we want to retrieve those updates in the next sync
    (i.e. can't set the last_synced_from_cloud time to later than that, as we retrieve updates above based
    on the condition that updated_at >= last_synced_from_cloud)
    */
    const maxUpdatedAt = data.reduce((max, row) =>
        new Date(row.updated_at) > new Date(max) ? 
            row.updated_at // value to set "max" to if above condition satisfied
            : max, // else, "max" is set to itself (remains unchanged)
        lastSyncedFromCloud || '1970-01-01T00:00:00Z' // initial value for "max"
    );

    // Update last_synced_from_cloud:
    await sqliteDb.run(`
        INSERT INTO meta (table_name, user_id, last_synced_from_cloud)
        VALUES (?, ?, ?)
        ON CONFLICT(table_name, user_id) DO UPDATE SET last_synced_from_cloud = ?
        `, [table, userId, maxUpdatedAt, maxUpdatedAt]
    );

}