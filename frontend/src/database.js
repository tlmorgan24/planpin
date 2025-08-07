import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

export async function initDb() {

    if (Capacitor.getPlatform() === "web") return; // SQLite database only applicable on native mobile app; not web (which exclusively uses cloud Supabase database)

    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const ret = await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection("markerdb")).result;
    let db;
    if (ret.result && isConn) {
        db = await sqlite.retrieveConnection("markerdb", false); // read-only set to false
    } else {
        db = await sqlite.createConnection("markerdb", false, "no-encryption", 1); // read-only set to false; version set to 1.
    }

    await db.open(); // open database to allow subsequent commands

    await createUsersTable(db); // stores data about each user, e.g. email (one row per user)
    await createCategoriesTable(db); // 0 or more categories for each user, from which user gets drop-down options to associate with each marker
    await createPlansTable(db); // stores data about each plan, e.g. owning user and associated pdf filename (0 or more plans per user)
    await createMarkersTable(db); // stores data about each marker, e.g. owning plan, location, category, etc (0 or more markers per plan)
    await createImagesTable(db); // stores data about each image, e.g. owning marker, location, etc (0 or more images per marker)
    await createMetaTable(db); // 1 row for each of above tables, to store timestamp for last pull from cloud (local-only table; not relevant to store in cloud database)

    return db

}

/*
NOTE: we will not add triggers to auto-set updated_at whenever table is updated, because that would mean,
when pulling data from cloud, the inserted cloud record gets given a misleadingly recent updated_at (which could
mean the record is considered new enough for sync to cloud again, causing infinite back-and-forth syncing).

But, we will at least set the default for updated_at to current date & time for new records, so only have to worry about 
setting updated_at when MODIFYING records rather than CREATING them. Instead of CURRENT_TIMESTAMP, we want to set it to
STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), which is in ISO 8601 format (for consistency with cloud database). Then we won't 
have to worry about time zones (always UTC) or comparison (as always comparing same format).

BUT, setting SQL function calls like this as a default value is not supported in SQLite. Can only set it manually
in insert or update. So, we will make sure to set created_at and updated_at to this in EVERY INSERT statement 
(and updated_at in every update statement, which we would need to do anyway even if the defaults did work).

Note, the default of now IS set for Supabase, as that is supported there.
*/

async function createUsersTable(db) { 

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    const tableCreationStatement = `
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT,
            company TEXT,
            country TEXT,
            subscription_tier TEXT NOT NULL DEFAULT 'starter',
            billing_cycle_start TIMESTAMP,
            billing_cycle_end TIMESTAMP,
            reports_this_billing_cycle INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            synced_at TIMESTAMP,
            deleted_at TIMESTAMP
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

    // Example for setting a trigger (have since removed triggers from local database as per above)
    /*

    // Add trigger to update "updated_at" field automatically when record is updated:
    // "IF NOT EXISTS" not valid syntax for triggers, so have to first check for trigger:

    const queryResult = await db.query(`
        SELECT name FROM sqlite_master
        WHERE type = 'trigger' AND name = 'users_trigger'
    `);

    if (queryResult.values.length === 0) { // trigger does not yet exist

        const triggerCreationStatement = `
            CREATE TRIGGER users_trigger
            AFTER UPDATE ON users
            FOR EACH ROW
            BEGIN
                UPDATE users SET updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
            END; 
        `
        await db.execute(triggerCreationStatement);
        
    }

    */

}

// This table wants to force no more than one of each combination of category_name and user_id (hence, composite primary key):
async function createCategoriesTable(db) {

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    const tableCreationStatement = `
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            category_name TEXT NOT NULL,
            user_id TEXT NOT NULL,
            color TEXT,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            synced_at TIMESTAMP,
            deleted_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

}

async function createPlansTable(db) {

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    const tableCreationStatement = `
        CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            pdf_filename TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            synced_at TIMESTAMP,
            deleted_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

}

async function createMarkersTable(db) {

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    const tableCreationStatement = `
        CREATE TABLE IF NOT EXISTS markers (
            id TEXT PRIMARY KEY,
            plan_id TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            reference NUMERIC NOT NULL CHECK (reference >= 0),
            category_id TEXT,
            description TEXT,
            severity INTEGER,
            extent INTEGER,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            synced_at TIMESTAMP,
            deleted_at TIMESTAMP,
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

}

async function createImagesTable(db) {

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    // This images table will give many-to-one relationship with markers table, as each marker can have mutliple associated images
    const tableCreationStatement = `
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            marker_id TEXT NOT NULL,
            image_filename TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            synced_at TIMESTAMP,
            deleted_at TIMESTAMP,
            FOREIGN KEY (marker_id) REFERENCES markers(id) ON DELETE CASCADE
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

}

/* 
NOTE: above makes use of a "deleted_at" column for soft deletes. This means, when a user deletes something, 
we will set deleted_at to the time it was deleted, instead of deleting the record entirely. That way, when syncing with cloud, it's easier
for cloud database to know what's been deleted, so it can be properly deleted from both local and cloud database when synced.

This means we must make sure that, when querying anything, we should generally add the condition that deleted_at IS NULL
(otherwise, e.g. markers that are supposed to be deleted will show up, etc.).

When user syncs, we will clean up local file storage and local database by removing 
records & files entirely if a record has been marked as deleted for more than 14 days AND EITHER 
the record is synced with cloud OR the user is a guest (no cloud sync to worry about).

We also clean up the cloud storage with the same logic.
*/

/* 
NOTE: the database only stores pdf_filename and image_filename (not full file path), as these are relative to user's pdf and image folder locations 
(defined in app context). Currently, the app is set up to save all PDFs and images at the top level of the user's pdf & image folders.
*/

/*

--- META TABLE ---

This table will have one record for each combination of table_name and user_id (hence, composite primary key).
It will be used for tracking the last time the local device pulled up-to-date data from the cloud.
This table (unlike all the others) does NOT have to exist in the cloud database.

*/

async function createMetaTable(db) {

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    const tableCreationStatement = `
        CREATE TABLE IF NOT EXISTS meta (
            table_name TEXT NOT NULL,
            user_id TEXT NOT NULL,
            last_synced_from_cloud TIMESTAMP,
            PRIMARY KEY (table_name, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

}
