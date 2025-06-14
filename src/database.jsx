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

    createTable(db);

    return db

}

async function createTable(db) {

    // Run table creation SQL if table does not yet exist (table will persist, so this is only for first time user is ever using app):
    const query = `
        CREATE TABLE IF NOT EXISTS markers (
        id TEXT PRIMARY KEY,
        pdfPath TEXT NOT NULL,
        pageNum INTEGER NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        imagePath TEXT
        );
    `;
    const res = await db.execute(query);
    if (res.changes && res.changes.changes && res.changes.changes < 0) {
      throw new Error(`Error: execute failed`);
    }

}
