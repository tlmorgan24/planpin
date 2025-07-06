import { JeepSqlite } from 'jeep-sqlite/dist/components/jeep-sqlite';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

export async function initDb() {

    const sqlite = new SQLiteConnection(CapacitorSQLite);

    // need jeep-sqlite stencil component if on web:
    if (Capacitor.getPlatform() === "web") {
        if (!customElements.get("jeep-sqlite")) {
            customElements.define("jeep-sqlite", JeepSqlite)
            const jeepSqliteEl = document.createElement("jeep-sqlite");
            document.body.appendChild(jeepSqliteEl);
        }
        await customElements.whenDefined("jeep-sqlite"); // wait for custom element to be defined before running app
        await sqlite.initWebStore(); // wait for web store to be intialised before connecting to database below
    }

    const ret = await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection("markerdb")).result;
    let db;
    if (ret.result && isConn) {
        db = await sqlite.retrieveConnection("markerdb", false); // read-only set to false
    } else {
        db = await sqlite.createConnection("markerdb", false, "no-encryption", 1); // read-only set to false; version set to 1.
    }

    await db.open(); // open database to allow subsequent queries
    // ^ This is where web version fails due to issues reading sql-wasm.wasm. 
    // But native mobile app works. Will just have to do native-only until I'm ready to do a serious cloud sync app
    // (in which case, the Capacitor fallback for browser would be inadequate even if I got it working)

    await createUsersTable(db);
    await createMarkersTable(db);
    await createImagesTable(db);

    return db

}

async function createUsersTable(db) { 

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    const tableCreationStatement = `
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT,
            password TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            synced_at TIMESTAMP,
            deleted INTEGER DEFAULT 0
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

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
                UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
            END; 
        `
        await db.execute(triggerCreationStatement);
        
    }

}

async function createMarkersTable(db) {

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    const tableCreationStatement = `
        CREATE TABLE IF NOT EXISTS markers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            pdf_filename TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            reference TEXT,
            category TEXT,
            description TEXT,
            severity INTEGER,
            extent INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            synced_at TIMESTAMP,
            deleted_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

    // Add trigger to update "updated_at" field automatically when record is updated:
    // "IF NOT EXISTS" not valid syntax for triggers, so have to first check for trigger:

    const queryResult = await db.query(`
        SELECT name FROM sqlite_master
        WHERE type = 'trigger' AND name = 'markers_trigger'
    `);

    if (queryResult.values.length === 0) { // trigger does not yet exist

        const triggerCreationStatement = `
            CREATE TRIGGER markers_trigger
            AFTER UPDATE ON markers
            FOR EACH ROW
            BEGIN
                UPDATE markers SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
            END; 
        `
        await db.execute(triggerCreationStatement);
        
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            synced_at TIMESTAMP,
            deleted INTEGER DEFAULT 0,
            FOREIGN KEY (marker_id) REFERENCES markers(id) ON DELETE CASCADE
        );
    `;
    const result = await db.execute(tableCreationStatement);
    if (result.changes && result.changes.changes && result.changes.changes < 0) {
        throw new Error('Error: execute failed');
    }

    // Add trigger to update "updated_at" field automatically when record is updated:
    // "IF NOT EXISTS" not valid syntax for triggers, so have to first check for trigger:

    const queryResult = await db.query(`
        SELECT name FROM sqlite_master
        WHERE type = 'trigger' AND name = 'images_trigger'
    `);

    if (queryResult.values.length === 0) { // trigger does not yet exist

        const triggerCreationStatement = `
            CREATE TRIGGER images_trigger
            AFTER UPDATE ON images
            FOR EACH ROW
            BEGIN
                UPDATE images SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
            END; 
        `
        await db.execute(triggerCreationStatement);
        
    }

}

/* 
NOTE: this makes use of a "deleted_at" column for soft deletes. This means, when a user deletes something, 
we set deleted_at to the time it was deleted, instead of deleting the record entirely. That way, when syncing with cloud, it's easier
for cloud database to know what's been deleted, so it can be properly deleted from both local and cloud database when synced.

This means we must make sure that, when querying anything, we should generally add the condition that deleted_at = NULL
(otherwise, e.g. markers that are supposed to be deleted will show up, etc.).
*/

/* 
NOTE: the database only stores pdf_filename and image_filename (not full file path), as these are relative to user's pdf and image folder locations 
(defined in app context). Currently, the app is set up to save all PDFs and images at the top level of the user's pdf & image folders.
*/
