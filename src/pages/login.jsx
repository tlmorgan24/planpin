import { useContext } from "react";
import { DbContext, UserContext } from "../main";
import { AppContext } from "../App";

export default function LoginScreen() {

    const {db} = useContext(DbContext); // we are confident db exists here, as App.jsx only sends user here if db exists (otherwise sends to loading screen)
    const {setUserId} = useContext(UserContext);
    const {saveDir, setPdfFolder, setImageFolder} = useContext(AppContext);

    async function setUpUser() {
    
        const id = 'guest'; // placeholder - should be 'guest' if user chooses to continue as guest, else the ID from login authentication 
        const email = null; // placeholder - should only be null if guest
        const password = null;  // placeholder - should only be null if guest

        // If user doesn't exist (i.e. user id gives no primary key conflict), create record for it:
        await db.run(`
            INSERT INTO users (id, email, password)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO NOTHING
        `, [id, email, password]);
        
        /*
        We don't have to depend too much on context here. userId (from UserContext) is only ever set in this component,
        so instead of getting "userId" from context to use in below functions, we can just use the id we obtained here directly.
        Likewise, pdfFolder and imageFolder (from AppContext) depend only on saveDir (which, as per App.jsx, is initialised as a
        constant and never null/undefined) and userId (whose up-to-date value we just obtained here directly). So, we can 
        set the folder names here directly from this information.
        This prevents unnecessary useEffects (hence re-renders) within this component and AppProvider.
        I.e., this function is the "single source of truth" for UserContext and AppContext and the only piece of code that
        sets the values (apart from saveDir, which is a constant defined in AppProvider).
        */

        const pdfFolder = `${id}/pdf`;
        const imageFolder = `${id}/img`;

        setUserId(id);
        setPdfFolder(pdfFolder);
        setImageFolder(imageFolder);

        // Clean up old records (MAY HAVE TO change the functions slightly to check all synced properly before clean up):
        // As explained above, we are confident all of these parameters are properly defined:
        await cleanUpLocalFiles(db, id, pdfFolder, imageFolder, saveDir);
        await cleanUpLocalDb(db, id);

    }

    return(
        <div className="login-container">
            <button onClick={setUpUser} style={{position: 'fixed', top: '100px'}}>Placeholder (continue as guest)</button>
        </div>
    );

}

export async function cleanUpLocalFiles(db, userId, pdfFolder, imageFolder, saveDir) {

    // WILL NEED TO IMPROVE THE CONDITIONS TO MAKE SURE RECORD IS SYNCED WITH CLOUD (OR USER IS GUEST):

    // To ensure we only impact files associated with relevant user ID, need to do some joins, 
    // as images table only links to user_id through a foreign key chain through markers and plans tables (no direct user_id column):
    const imagesResult = await db.query(`
        SELECT i.image_filename
        FROM images i
        JOIN markers m ON i.marker_id = m.id
        JOIN plans p ON m.plan_id = p.id
        WHERE p.user_id = ?
        AND i.deleted_at IS NOT NULL
        AND i.deleted_at < datetime('now', '-30 days')
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
        AND deleted_at < datetime('now', '-30 days')
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
        WHERE marker_id IN (
            SELECT m.id
            FROM markers m
            JOIN plans p ON m.plan_id = p.id
            WHERE p.user_id = ?
        )
        AND deleted_at IS NOT NULL
        AND deleted_at < datetime('now', '-30 days')
    `, [userId]);

    await db.run(`
        DELETE FROM markers
        WHERE plan_id IN (
            SELECT id
            FROM plans
            WHERE user_id = ?
        )
        AND deleted_at IS NOT NULL 
        AND deleted_at < datetime('now', '-30 days')
    `, [userId]);

    await db.run(`
        DELETE FROM plans
        WHERE user_id = ?
        AND deleted_at IS NOT NULL 
        AND deleted_at < datetime('now', '-30 days')
    `, [userId]);

}
