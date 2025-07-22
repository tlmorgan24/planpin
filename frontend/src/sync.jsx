import { useContext } from "react";
import { toast } from 'sonner';
import { Filesystem } from "@capacitor/filesystem";
import { DbContext, UserContext } from "./main";
import { HomeContext } from "./pages/Home";
import { getFilenames, saveFile, readAsBlob, removeFile } from "./pdf-setup";

/*
NOTE: a synced_at column exists in each local table to mean record-wise "last PUSHED TO cloud".
There is no record-wise tracking of pulls (unnecessary), but instead a table-wise last_synced_from_cloud 
(i.e. "last PULLED FROM cloud") in the meta table.

The synced_at column of all tables, and the entire meta table, do NOT exist in the cloud database. This would lead
to misleading data, as they are only used to track a single device's sync state for what THAT DEVICE should push/pull 
(multiple devices may sync with cloud, so a single sync value in the cloud has no useful meaning).

In light of the synced_at column's lack of cloud existence, we make sure in the pushToCloud function that that 
column is EXCLUDED (otherwise there would be an error). The pullToCloud function does not need to worry, as
it can simple pull all columns of the cloud database (as all columns in cloud exist locally, unlike vice versa).
*/


// Note, this sync button should not be shown on web, as sync is only applicable on mobile app (sync is always up-to-date on cloud):
export function SyncButton() {

    const {db: sqliteDb, supabase} = useContext(DbContext);
    const {userId, pdfFolder, imageFolder, saveDir} = useContext(UserContext);
    const {refreshPdfObjects} = useContext(HomeContext);

    async function handleClick() {
        toast.loading("Syncing...", {id: 'syncing'});
        if (!sqliteDb || pdfFolder === undefined || imageFolder === undefined || userId === undefined) return;
        console.log("Sync clicked.")
        console.log("Current local users table: ", await sqliteDb.query('SELECT * FROM users'));
        console.log("Current cloud users table: ", await supabase.from('users').select('*'));
        console.log("Current local plans table: ", await sqliteDb.query('SELECT * FROM plans'));
        console.log("Current cloud plans table: ", await supabase.from('plans').select('*'));
        console.log("Current local markers table: ", await sqliteDb.query('SELECT * FROM markers'));
        console.log("Current cloud markers table: ", await supabase.from('markers').select('*'));
        console.log("Current local images table: ", await sqliteDb.query('SELECT * FROM images'));
        console.log("Current cloud images table: ", await supabase.from('images').select('*'));
        if (userId === 'guest') {
            await localCleanUp(sqliteDb, userId, pdfFolder, imageFolder, saveDir); // sync not applicable, just clean up old deleted files in local storage
        }
        else {
            if (!supabase) return;
            try {
                await fullSync(sqliteDb, supabase, userId, pdfFolder, imageFolder, saveDir);
                toast.success('Sync complete!', {id: 'syncing'});
            } catch {
                toast.error('Something went wrong while syncing', {id: 'syncing'});
            }
            await refreshPdfObjects();
        }
    }

    return(
        <button type="button" onClick={handleClick}>Sync</button>
    );

}


async function localCleanUp(sqliteDb, userId, pdfFolder, imageFolder, saveDir) {
    const {pdfFileNames, imageFileNames} = await cleanUpLocalDb(sqliteDb, userId);
    await cleanUpLocalFiles(pdfFileNames, imageFileNames, pdfFolder, imageFolder, saveDir);
}

async function cloudCleanUp(supabase, sqliteDb, userId, pdfFolder, imageFolder) {
    const {pdfFileNames, imageFileNames} = await cleanUpCloudDb(supabase, sqliteDb, userId);
    await cleanUpCloudFiles(supabase, pdfFileNames, imageFileNames, pdfFolder, imageFolder);
}

export async function fullSync(sqliteDb, supabase, userId, pdfFolder, imageFolder, saveDir) {

    console.log('Starting sync...');
    
    for (const table of ['users', 'plans', 'markers', 'images']) {
        try {
            await pullFromCloud(sqliteDb, supabase, table, userId, pdfFolder, imageFolder, saveDir);
            await pushToCloud(sqliteDb, supabase, table, userId, pdfFolder, imageFolder, saveDir);
        }
        catch (error) {
            console.error(`❌ Sync failed for table "${table}":`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
            throw error; // propagate error upward
        }
    }
    // cloudCleanUp relies on querying data from the local database, so best to run cloudCleanUp BEFORE localCleanUp (which will hard delete local records)
    await cloudCleanUp(supabase, sqliteDb, userId, pdfFolder, imageFolder);
    await localCleanUp(sqliteDb, userId, pdfFolder, imageFolder, saveDir);

}


// -------- SYNC FUNCTIONS --------

// Update all records of cloud database where local database has its "updated_at" more recent than its "last_synced" (or has never been synced):
async function pushToCloud(sqliteDb, supabase, table, userId, pdfFolder, imageFolder, saveDir) {

    if (userId === 'guest') return; // guest account data is never synced

    console.log('Starting pushing to cloud for table: ', table);

    /*
    We want to get local changes not reflected in cloud database (records updated later than last sync), 
    filtered to only current authenticated user (we will NOT sync other users' data).

    To only select records associated with relevant user ID, need to do some joins, as images table only 
    links to user_id through a foreign key chain through markers and plans tables (no direct user_id column):
    */
    let sqliteQuery = '';
    if (table === 'images') {
        sqliteQuery = `
            SELECT i.*
            FROM images i
            JOIN markers m ON i.marker_id = m.id
            JOIN plans p ON m.plan_id = p.id
            WHERE p.user_id = ?
                AND (i.updated_at > i.synced_at
                    OR i.synced_at IS NULL
                )
        `;
    }
    else if (table === 'markers') {
        sqliteQuery = `
            SELECT m.*
            FROM markers m
            JOIN plans p ON m.plan_id = p.id
            WHERE p.user_id = ?
                AND (m.updated_at > m.synced_at
                    OR m.synced_at IS NULL
                )
        `;
    }
    else if (table === 'plans') {
        sqliteQuery = `
            SELECT *
            FROM plans
            WHERE user_id = ?
                AND (updated_at > synced_at
                    OR synced_at IS NULL
                )
        `;
    }
    else if (table === 'users') {
        sqliteQuery = `
            SELECT *
            FROM users
            WHERE id = ?
                AND (updated_at > synced_at
                    OR synced_at IS NULL
                )
        `;
    }
    else {
        throw new Error(`Unknown table: ${table}`);
    }
    
    const sqliteResult = await sqliteDb.query(sqliteQuery, [userId]);
    const localChanges = sqliteResult.values;

    /*
    We now have only the POTENTIALLY relevant local changes, but we can't just push them all directly.
    We should only push them if the cloud database shows a less recent "updated_at" than the local database.
    E.g. if another device pushed more recent changes to the cloud database, we don't want to overwrite those.
    I.e. our conflict-resolution strategy is "latest update wins".
    */

    // Get current cloud records for potentially relevant local changes:
    const changedIds = localChanges.map(row => row['id']);
    const { data: cloudRecords, error: queryError } = await supabase
        .from(table)
        .select('id, updated_at')
        .in('id', changedIds);
    if (queryError) console.error("Error: ", queryError);

    // Convert to map for quick lookup of cloud updated_at by ID:
    const cloudMap = {};
    cloudRecords.forEach(row => { cloudMap[row.id] = row.updated_at; });

    // Filter local changes to only those with more recent updated_at than cloud record (or where cloud record does not exist):
    const rowsToPush = localChanges
        .map(({ synced_at, ...rest }) => rest ) // remove synced_at column from local changes, as doesn't exist in cloud database (so we don't want to push it)
        .filter(localRow => {
            const cloudUpdatedAt = cloudMap[localRow.id]; // in Python, this would throw error if key not found (record not in cloud), but in JS just returns undefined.
            return (
                !cloudUpdatedAt || // if cloudUpdatedAt undefined (cloud record does not exist), return true immediately (i.e. include this local row in the filter)
                new Date(localRow.updated_at) > new Date(cloudUpdatedAt) // or, include in filter if local updated_at is more recent than cloud updated_at
            );
    });

    // Make the changes to cloud database:
    const { error: upsertError } = await supabase
        .from(table)
        .upsert(rowsToPush, {onConflict: ['id']}); // insert if ID does not exist, else update
    if (upsertError) console.error("Error: ", upsertError);

    // Sync PDF and image files to cloud file storage:
    if (table === 'plans') {
        await uploadToSupabase(supabase, rowsToPush, pdfFolder, saveDir, 'application/pdf');
    }
    else if (table === 'images') {
        await uploadToSupabase(supabase, rowsToPush, imageFolder, saveDir, 'image/jpeg');
    }

    // Update synced_at of pushed rows to match the row's updated_at (as current update of row has been synced):
    const pushedIds = rowsToPush.map(row => row['id']);
    const pushedIdPlaceholders = pushedIds.map(() => '?').join(', '); // e.g. '?, ?' etc.
    await sqliteDb.run(`
        UPDATE ${table}
        SET synced_at = updated_at
        WHERE id IN (${pushedIdPlaceholders})
    `, pushedIds);

    console.log('Finished pushing to cloud for table: ', table);

}

// Update all records of local database where cloud database has a more recent "updated_at" or row does not exist in local database:
async function pullFromCloud(sqliteDb, supabase, table, userId, pdfFolder, imageFolder, saveDir) {

    if (userId === 'guest') return; // guest account data is never synced

    console.log('Starting pulling from cloud for table: ', table);

    const metaQuery = await sqliteDb.query(`
        SELECT last_synced_from_cloud 
        FROM meta 
        WHERE table_name = ? 
            AND user_id = ?
    `, [table, userId]);
    const lastSyncedFromCloud = metaQuery.values.length > 0 ?
        metaQuery.values[0]['last_synced_from_cloud'] // if query does not return empty (row for this table/user already exists) 
        : null; // if query returns empty (row for this table/user does not exist yet, i.e. never been synced)

    const view = 'user_' + table; // views I created in Supabase, which are already filtered to only records for current authenticated user (efficient)

    const { data, error } = await supabase
        .from(view) // view I have set up in Supabase, already filtered to current authenticated user (so no need to do any separate WHERE clause for this query or other queries which use this data).
        .select('*')
        .gt('updated_at', lastSyncedFromCloud || '1970-01-01T00:00:00Z'); // for efficiency, only get records changed since last sync (or never synced)
    if (error) console.error("Error: ", error);
    
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
    Also, we want to make it general for any table. So, we could do this:

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

    BUT for 'plans' and 'images' tables, we also need to track which rows were actually updated, 
    so we can retrieve only those files from the cloud. So, we have to do a SELECT to query the rows to be updated first.

    */

    // Need to download files from cloud storage for plans & images tables, so must track which rows were updated (even though not very efficient):
    if (table === 'plans' || table === 'images') {

        const rowsToModify = [];

        for (const row of data) {
            const localResult = await sqliteDb.query(
                `SELECT id FROM ${table} WHERE id = ?`, [row['id']]
            );

            if (localResult.values.length === 0) {
                rowsToModify.push(row); // this row will be inserted, as it does not exist locally
                continue;
            }

            const localUpdatedAt = localResult.values[0]['updated_at'];
            if (new Date(row['updated_at']) > new Date(localUpdatedAt)) {
                rowsToModify.push(row); // This row will be updated, as the cloud 'updated_at' is more recent than the local one
            }
        }

        if (rowsToModify.length > 0) { // we have to ensure executeSet is not executed with empty array (no statements), otherwise it will throw an error

            const statements = rowsToModify.map(row => {

                const columns = Object.keys(row);
                const values = Object.values(row);
                const columnsExceptId = columns.filter(col => col !== 'id');
            
                const valuesPlaceholder = columns.map(() => '?').join(', ');  // e.g. '?, ?' etc.
                const set = columnsExceptId.map(col => `${col} = excluded.${col}`).join(', '); // e.g. 'created_at = excluded.created_at, updated_at = excluded.created_at', etc.
            
                return {
                    statement: `
                        INSERT INTO ${table} (${columns.join(', ')})
                        VALUES (${valuesPlaceholder})
                        ON CONFLICT(id) DO UPDATE SET ${set};
                    `,
                    values
                };
            });
        
            sqliteDb.executeSet(statements);

        }

        if (table === 'plans') {
            const affectedFileNames = rowsToModify.map(row => row.pdf_filename);
            downloadFromSupabase(supabase, affectedFileNames, pdfFolder, saveDir);
        }
        else if (table === 'images') {
            const affectedFileNames = rowsToModify.map(row => row.image_filename);
            downloadFromSupabase(supabase, affectedFileNames, imageFolder, saveDir);
        }

    }

    // For other tables, no downloading of files required, so below is more efficient way to update table:
    else {

        if (data.length > 0) { // we have to ensure executeSet is not executed with empty array (no statements), otherwise it will throw an error

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
                        ON CONFLICT(id) DO UPDATE SET ${set}
                        WHERE excluded.updated_at > ${table}.updated_at;
                    `,
                    values: values
                };

            });

            // Execute above batched statements:
            sqliteDb.executeSet(statements);

        }

    }
    
    // Get latest updated_at of synced rows, to set last_synced_from_cloud to:
    /* 
    This is a better alternative to just using current date/time, as if any updates happened to the cloud data 
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

    console.log('Finished pulling from cloud for table: ', table);

}
    
async function uploadToSupabase(supabase, rowsToPush, folder, saveDir, mimeType) {

    let field = null;
    if (mimeType === 'application/pdf') {
        field = 'pdf_filename'
    }
    else if (mimeType === 'image/jpeg') {
        field = 'image_filename'
    }

    const fileNamesFilter = rowsToPush.map(row => row[field]);
    const fileNames = await getFilenames(folder, saveDir, fileNamesFilter);

    for (const fileName of fileNames) {
        const blob = await readAsBlob(fileName, folder, saveDir, mimeType);
        await saveBlobToSupabase(supabase, blob, fileName, folder, mimeType, true); // true to allow overwriting
    }

}

export async function saveBlobToSupabase(supabase, blob, fileName, folder, mimeType, overwrite) {

    let newName = fileName;

    if (!overwrite) {
        const extension = newName.includes('.') ? newName.slice(newName.lastIndexOf('.')) : '';
        const baseName = newName.slice(0, newName.lastIndexOf('.'));
        let counter = 1;
        while (await fileExistsInSupabase(supabase, newName, folder)) {
            newName = `${baseName}(${counter})${extension}`;
            counter++;
        }
        if (newName !== fileName) {
            console.log(`Filename ${fileName} already exists. Name changed to ${newName}.`)
        }
    }

    const { error } = await supabase.storage
        .from('user-files') // only one bucket is required for all users, as the path to the filename is just treated as one long key (so can "create" a simulated new folder automatically)
        .upload(`${folder}/${newName}`, blob, { // note folder is in form userId/img, and filename includes .jpg extension 
            contentType: mimeType,
            upsert: overwrite, // true to allow overwriting; false otherwise
        });
    if (error) console.error("Error: ", error);

    return newName;

}

async function fileExistsInSupabase(supabase, fileName, folder) {
    
    const { data, error } = await supabase.storage
        .from('user-files')
        .list(folder);

    if (error) {
        console.error('Error checking file existence: ', error);
        return false; // Assume not exists on error to avoid false positives
    }

    return data.some(file => file.name === fileName);
    
}

async function downloadFromSupabase(supabase, fileNames, folder, saveDir) {

    for (const fileName of fileNames) {
        const { data: blob, error } = await supabase.storage
            .from('user-files')
            .download(`${folder}/${fileName}`);
        if (error) console.error("Error: ", error);
        await saveFile(blob, folder, saveDir, fileName, true); 
        /*
        The saveFile function, though originally created for PDF file objects from HTML form submission, 
        also works in general for blobs of any file type.
        I call it with overwrite=true, so if file already exists, it will be overwritten.
        */
    }

}


// -------- CLEAN UP FUNCTIONS --------

/*
Note: cleaning up the database could be done in a single DELETE statement for each table, but we would lose access to the 
filenames (from images and plans tables) of hard-deleted records. We want to keep hold of those filenames, to 
hard delete those exact files from the local filesystem, so filesystem always matches database. So, we instead
do a SELECT statement to get the id and filenames of the records to be deleted, and then delete those "safe"-to-delete files.

The same philosophy is applied to both local and cloud databases.
*/

async function cleanUpLocalDb(db, userId) {

    // --- SELECT ---

    // Obtain the records to be deleted:

    /*
    To only select records associated with relevant user ID, need to do some joins, as images table only 
    links to user_id through a foreign key chain through markers and plans tables (no direct user_id column):
    */
    const imagesResult = await db.query(`
        SELECT i.id, i.image_filename
        FROM images i
        JOIN markers m ON i.marker_id = m.id
        JOIN plans p ON m.plan_id = p.id
        WHERE p.user_id = ?
            AND i.deleted_at IS NOT NULL
            AND i.deleted_at < datetime('now', '-14 days')
            AND ((i.synced_at IS NOT NULL AND i.synced_at >= i.deleted_at)
                OR p.user_id = 'guest'
            )
    `, [userId]);
    const imageIds = imagesResult.values.map(row => row['id']);
    const imageFileNames = imagesResult.values.map(row => row['image_filename']);

    const markersResult = await db.query(`
        SELECT m.id
        FROM markers m
        JOIN plans p ON m.plan_id = p.id
        WHERE p.user_id = ?
            AND m.deleted_at IS NOT NULL
            AND m.deleted_at < datetime('now', '-14 days')
            AND ((m.synced_at IS NOT NULL AND m.synced_at >= m.deleted_at)
                OR p.user_id = 'guest'
            )
    `, [userId]);
    const markerIds = markersResult.values.map(row => row['id']);

    const plansResult = await db.query(`
        SELECT id, pdf_filename 
        FROM plans 
        WHERE user_id = ? 
            AND deleted_at IS NOT NULL 
            AND deleted_at < datetime('now', '-14 days')
            AND ((synced_at IS NOT NULL AND synced_at >= deleted_at)
                OR user_id = 'guest'
            )
    `, [userId]);
    const planIds = plansResult.values.map(row => row['id']);
    const pdfFileNames = plansResult.values.map(row => row['pdf_filename']);

    // --- DELETE FROM DATABASE ---

    // Note deletion from images table must come before deletion from markers table, as images table has foreign key constraint on markerId; i.e. marker must exist. Etc. going up the tree.

    if (imageIds.length > 0) {
        const imageValuesPlaceholder = imageIds.map(() => '?').join(', ');  // e.g. '?, ?' etc.
        await db.run(`
            DELETE FROM images
            WHERE id IN (${imageValuesPlaceholder})
        `, imageIds);
    }

    if (markerIds.length > 0) {
        const markerValuesPlaceholder = markerIds.map(() => '?').join(', ');  // e.g. '?, ?' etc.
        await db.run(`
            DELETE FROM markers
            WHERE id IN (${markerValuesPlaceholder})
        `, markerIds);
    }

    if (planIds.length > 0) {
        const planValuesPlaceholder = planIds.map(() => '?').join(', ');  // e.g. '?, ?' etc.
        await db.run(`
            DELETE FROM plans
            WHERE id IN (${planValuesPlaceholder})
        `, planIds);
    }

    return { pdfFileNames, imageFileNames } // for deletion from filesystem

}

async function cleanUpLocalFiles(pdfFileNames, imageFileNames, pdfFolder, imageFolder, saveDir) {

    /*
    To simplify things, we take the filename query results returned from the cleanUpLocalDb function,
    so that we hard delete the exact same files whose records have been hard deleted in the database.
    */

    for (const imageFileName of imageFileNames) {
        await removeFile(imageFileName, imageFolder, saveDir);
    }

    for (const pdfFileName of pdfFileNames) {
        await removeFile(pdfFileName, pdfFolder, saveDir);
    }

}

async function cleanUpCloudDb(supabase, sqliteDb, userId) {

    if (userId === 'guest') return { imageFileNames: [], pdfFileNames: [] }; // guest account data is never synced

    // ------ SELECT ------

    // Obtain the records to be deleted:

    // --- IMAGES ---

    // Check which ids have a properly synced deletion as far as local database knows:
    // For this to be effective, we should run the function immediately after cloud sync (but the "double-check" below means this isn't critical)
    // This logic is same as for cleanUpLocalDb, but a bit simpler as we don't need to check for if user is guest
    const imagesQuery = await sqliteDb.query(`
        SELECT id
        FROM images
        WHERE deleted_at IS NOT NULL
            AND deleted_at < datetime('now', '-14 days')
            AND synced_at IS NOT NULL 
            AND synced_at >= deleted_at
            AND EXISTS (
                SELECT 1
                FROM markers m
                JOIN plans p ON m.plan_id = p.id
                WHERE m.id = images.marker_id
                    AND p.user_id = ?
            )
    `, [userId]);
    const imageIds = imagesQuery.values.map(row => row['id']);

    let safeImageIds = [];
    let safeImageFileNames = [];
    if (imageIds.length > 0) {

        // Double check in case any are not marked as deleted in cloud database (i.e. if someone restored it on a separate device, which we don't know about):
        const {data: imagesCloudCheck, error } = await supabase
            .from('images')
            .select('id, deleted_at, image_filename') // we need image_filename to delete the file from cloud storage later
            .in('id', imageIds);
        if (error) console.error("Error: ", error);

        const safeImageRecords = imagesCloudCheck.filter(row => row.deleted_at !== null);
        safeImageIds = safeImageRecords.map(row => row['id']);
        safeImageFileNames = safeImageRecords.map(row => row['image_filename']); // will be returned to allow deletion of the relevant files from cloud storage separately

    }

    // --- MARKERS ---

    const markersQuery = await sqliteDb.query(`
        SELECT id
        FROM markers
        WHERE deleted_at IS NOT NULL 
            AND deleted_at < datetime('now', '-14 days')
            AND synced_at IS NOT NULL 
            AND synced_at >= deleted_at
            AND EXISTS (
                SELECT 1
                FROM plans p
                WHERE p.id = markers.plan_id
                AND p.user_id = ?
            )
    `, [userId]);
    const markerIds = markersQuery.values.map(row => row['id']);

    let safeMarkerIds = [];
    if (markerIds.length > 0) {

        const {data: markersCloudCheck, error} = await supabase
            .from('markers')
            .select('id, deleted_at')
            .in('id', markerIds);
        if (error) console.error("Error: ", error);

        safeMarkerIds = markersCloudCheck
            .filter(row => row.deleted_at !== null)
            .map(row => row['id']);

    }

    // --- PLANS ---

    const plansQuery = await sqliteDb.query(`
        SELECT id
        FROM plans
        WHERE deleted_at IS NOT NULL 
            AND deleted_at < datetime('now', '-14 days')
            AND synced_at IS NOT NULL 
            AND synced_at >= deleted_at
            AND user_id = ?
    `, [userId]);
    const planIds = plansQuery.values.map(row => row['id']);

    let safePlanIds = [];
    let safePdfFileNames = [];
    if (planIds.length > 0) {

        const {data: plansCloudCheck, error} = await supabase
            .from('plans')
            .select('id, deleted_at, pdf_filename') // we need pdf_filename to delete the file from cloud storage later
            .in('id', planIds);
        if (error) console.error("Error: ", error);

        const safePlanRecords = plansCloudCheck.filter(row => row.deleted_at !== null);
        safePlanIds = safePlanRecords.map(row => row['id']);
        safePdfFileNames = safePlanRecords.map(row => row['pdf_filename']); // will be returned to allow deletion of the relevant files from cloud storage separately

    }

    // ------ DELETE FROM DATABASE ------

    // Delete the "safe" records from cloud database (i.e., records still marked as deleted in cloud database):

    if (safeImageIds.length > 0) {
        const { error } = await supabase
            .from('images')
            .delete()
            .in('id', safeImageIds);
        if (error) console.error("Error: ", error);
    }

    if (safeMarkerIds.length > 0) {
        const { error } = await supabase
            .from('markers')
            .delete()
            .in('id', safeMarkerIds);
        if (error) console.error("Error: ", error);
    }

    if (safePlanIds.length > 0) {
        const { error } = await supabase
            .from('plans')
            .delete()
            .in('id', safePlanIds);
        if (error) console.error("Error: ", error);
    }

    return { pdfFileNames:safePdfFileNames, imageFileNames:safeImageFileNames } // for deletion from cloud file storage

}


async function cleanUpCloudFiles(supabase, pdfFileNames, imageFileNames, pdfFolder, imageFolder) {

    /*
    To simplify things, we take the filename query results returned from the cleanUpCloudDb function,
    so that we hard delete the exact same files whose records have been hard deleted in the database.
    */

    if (pdfFileNames.length === 0 && imageFileNames.length === 0) return; // nothing to delete

    const imageFilePaths = imageFileNames.map(fileName => `${imageFolder}/${fileName}`);
    const pdfFilePaths = pdfFileNames.map(fileName => `${pdfFolder}/${fileName}`);

    const { error } = await supabase.storage
        .from('user-files')
        .remove([...imageFilePaths, ...pdfFilePaths]); // supabase allows batch deletion of multiple files at once
    if (error) console.error("Error: ", error);

}


// -------- WIPE FUNCTIONS --------

/*
This is like the above clean up functions, but hard deletes absolutely everything belonging to the user 
(totally wipes all their data, regardless of what has been marked as soft deleted).
*/

export async function wipeAll(supabase, sqliteDb, userId, saveDir) {
    if (sqliteDb) { // if on native mobile app
        await wipeLocalDb(sqliteDb, userId);
        await wipeLocalFiles(userId, saveDir);
    }
    // Even if on native mobile, still must wipe cloud database too:
    await wipeCloudDb(supabase, userId);
    await wipeCloudFiles(supabase, userId);
}

async function wipeLocalDb(db, userId) {

    // Thanks to ON DELETE CASCADE set up, only have to delete from users table itself, and all relevant records will be deleted from child tables:
    await db.run(`
        DELETE FROM users
        WHERE id = ?)
    `, userId);

}

async function wipeLocalFiles(userId, saveDir) {

    await Filesystem.rmdir({
        path: userId, // folder to remove
        directory: saveDir,
        recursive: true // remove ALL contents of ALL subfolders
      });

}

async function wipeCloudDb(supabase, userId) {

    if (userId === 'guest') return; // guest account data is never synced

    // Thanks to ON DELETE CASCADE set up, only have to delete from users table itself, and all relevant records will be deleted from child tables:
    const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
    if (error) console.error("Error: ", error);

}

async function wipeCloudFiles(supabase, userId) {

    if (userId === 'guest') return; // guest account data is never synced

    const folders = [`${userId}/pdf`, `${userId}/img`];
    
    let filePathsToRemove = [];
    for (const folder of folders) {
        // Get all files in folder:
        const { data: listData, error: listError } = await supabase.storage
            .from('user-files')
            .list(folder);
        if (listError) console.error('Error listing files: ', listError);
        const filePaths = listData.map(file => `${folder}/${file.name}`);
        filePathsToRemove = [...filePathsToRemove, ...filePaths]
    }

    const { removeError } = await supabase.storage
        .from('user-files')
        .remove(filePathsToRemove); // supabase allows batch deletion of multiple files at once
    if (removeError) console.error("Error removing files: ", removeError);
    
}