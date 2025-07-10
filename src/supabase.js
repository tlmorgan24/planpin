import { createClient } from "@supabase/supabase-js";

export async function initSupabase() {

    // Note schema is already set up in Supabase, so no need to create tables etc here

    const key = import.meta.env.VITE_SUPABASE_API_KEY;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const supabase = createClient(url, key);

    return supabase;

}






// SS - original clean up local db/files functions (which acted separately, but I have now improved so that deleted files match deleted records exactly):

/*

// This function must be run BEFORE cleanUpLocalDb, as otherwise the database records won't exist to tell this function what files to delete
export async function cleanUpLocalFiles(db, userId, pdfFolder, imageFolder, saveDir) {

    // To ensure we only impact files associated with relevant user ID, need to do some joins, 
    // as images table only links to user_id through a foreign key chain through markers and plans tables (no direct user_id column):
    const imagesResult = await db.query(`
        SELECT i.image_filename
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
    const imageFileNames = imagesResult.values.map(row => row['image_filename']);
    for (const imageFileName of imageFileNames) {
        await removeFile(imageFileName, imageFolder, saveDir);
    }

    const plansResult = await db.query(`
        SELECT pdf_filename 
        FROM plans 
        WHERE user_id = ? 
            AND deleted_at IS NOT NULL 
            AND deleted_at < datetime('now', '-14 days')
            AND ((synced_at IS NOT NULL AND synced_at >= deleted_at)
                OR user_id = 'guest'
            )
    `, [userId]);
    const pdfFileNames = plansResult.values.map(row => row['pdf_filename']);
    for (const pdfFileName of pdfFileNames) {
        await removeFile(pdfFileName, pdfFolder, saveDir);
    }

}

export async function cleanUpLocalDb(db, userId) {

    // Note deletion from images table must come before deletion from markers table, as images table has foreign key constraint on markerId; i.e. marker must exist.

    // To ensure we only impact records associated with relevant user ID, need to do some joins, 
    // as images table only links to user_id through a foreign key chain through markers and plans tables (no direct user_id column):
    await db.run(`
        DELETE FROM images
        WHERE deleted_at IS NOT NULL
            AND deleted_at < datetime('now', '-14 days')
            AND ((synced_at IS NOT NULL AND synced_at >= deleted_at)
                OR EXISTS (
                SELECT 1
                FROM markers m
                JOIN plans p ON m.plan_id = p.id
                WHERE m.id = images.marker_id
                    AND p.user_id = 'guest'
                )
            )
            AND EXISTS (
                SELECT 1
                FROM markers m
                JOIN plans p ON m.plan_id = p.id
                WHERE m.id = images.marker_id
                    AND p.user_id = ?
            )
    `, [userId]);

    await db.run(`
        DELETE FROM markers
        WHERE deleted_at IS NOT NULL 
            AND deleted_at < datetime('now', '-14 days')
            AND ((synced_at IS NOT NULL AND synced_at >= deleted_at)
                OR EXISTS (
                SELECT 1
                FROM plans p
                WHERE p.id  = markers.plan_id
                    AND p.user_id = 'guest'
                )
            )
            AND EXISTS (
                SELECT 1
                FROM plans p
                WHERE p.id = markers.plan_id
                AND p.user_id = ?
            )
    `, [userId]);

    await db.run(`
        DELETE FROM plans
        WHERE user_id = ?
            AND deleted_at IS NOT NULL 
            AND deleted_at < datetime('now', '-14 days')
            AND ((synced_at IS NOT NULL AND synced_at >= deleted_at)
                OR user_id = 'guest'
            )
    `, [userId]);

}


*/






// SS - random backup:

/*


// I WILL WANT TO INSERT THE BELOW UPLOAD/DOWNLOAD FUNCTIONS SOMEWHERE IN THE ABOVE PULL/PUSH FUNCTIONS.
// need to think about optimal place to insert them (so nothing will be left behind, e.g. updating synced_at should come last)

async function uploadPdfsToSupabase(sqliteDb, supabase, userId, folder, saveDir) {

    if (userId === 'guest') return; // guest account data is never synced

    // Get file names for all pdfs belonging to user that are undeleted AND haven't been synced before (WE MUST MAKE SURE TO ONLY UPDATE synced_at IN DATABASE *AFTER* UPLOADING THE FILE, as we'll never get another chance to upload it)
    const queryResult = await sqliteDb.query(`
        SELECT pdf_filename
        FROM plans
        WHERE user_id = ?
            AND deleted_at IS NULL
            AND synced_at IS NULL
    `, [userId]);
    const fileNamesFilter = queryResult.values.map(row => row['pdf_filename']);

    const fileNames = await getFilenames(folder, saveDir, fileNamesFilter);

    for (const fileName of fileNames) {

        const blob = await readAsBlob(fileName, folder, saveDir, 'application/pdf');
        const { data, error } = await supabase.storage
            .from('user-files') // only one bucket is required for all users, as the path to the filename is just treated as one long key (so can "create" a simulated new folder automatically)
            .upload(`${folder}/${fileName}`, blob, { contentType: 'application/pdf' }); // note folder is in form userId/pdf, and filename includes .pdf extension

    }

}

async function uploadImagesToSupabase(sqliteDb, supabase, userId, folder, saveDir) {

    if (userId === 'guest') return; // guest account data is never synced

    // Get file names for all images belonging to user that are undeleted AND haven't been synced before (WE MUST MAKE SURE TO ONLY UPDATE synced_at IN DATABASE *AFTER* UPLOADING THE FILE, as we'll never get another chance to upload it)
    const queryResult = await sqliteDb.query(`
        SELECT i.image_filename
        FROM images i
        JOIN markers m ON i.marker_id = m.id
        JOIN plans p ON m.plan_id = p.id
        WHERE p.user_id = ?
            AND i.deleted_at IS NULL
            AND i.synced_at IS NULL
    `, [userId]);
    const fileNamesFilter = queryResult.values.map(row => row['image_filename']);

    const fileNames = await getFilenames(folder, saveDir, fileNamesFilter);

    for (const fileName of fileNames) {

        const blob = await readAsBlob(fileName, folder, saveDir, 'image/jpeg');
        const { data, error } = await supabase.storage
            .from('user-files') // only one bucket is required for all users, as the path to the filename is just treated as one long key (so can "create" a simulated new folder automatically)
            .upload(`${folder}/${fileName}`, blob, { contentType: 'image/jpeg' }); // note folder is in form userId/img, and filename includes .jpg extension

    }

}

// MAKE SURE, WHEN DOWNLOADING, YOU SPECIFY WHOLE PATH (folder/filename)


async function downloadPdfsFromSupabase(sqliteDb, supabase, userId, folder, saveDir) {

    if (userId === 'guest') return; // guest account data is never synced

    // Get file names for all pdfs belonging to user that are undeleted AND haven't been synced before (WE MUST MAKE SURE TO ONLY UPDATE synced_at IN DATABASE *AFTER* UPLOADING THE FILE, as we'll never get another chance to upload it)
    const { data, error } = await supabase
        .from('user_plans') // view already filtered to current authenticated user
        .select('pdf_filename')
        .is('deleted_at', null)
        .is('synced_at', null);




    const fileNames = queryResult.values.map(row => row['pdf_filename']);

    for (const fileName of fileNames) {

        const blob = await readAsBlob(fileName, folder, saveDir, 'application/pdf');
        const { data, error } = await supabase.storage
            .from('user-files') // only one bucket is required for all users, as the path to the filename is just treated as one long key (so can "create" a simulated new folder automatically)
            .upload(`${folder}/${fileName}`, blob, { contentType: 'application/pdf' }); // note folder is in form userId/pdf, and filename includes .pdf extension

    }

}

*/