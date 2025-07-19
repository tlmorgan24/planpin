import { useContext, useState, useRef, useEffect, createContext } from "react";
import Modal from 'react-modal';
import { Capacitor } from '@capacitor/core';
import { Link } from "react-router-dom";
import { PageCanvas } from "../pdf-render";
import { getPdfObjects, saveFile } from '../pdf-setup';
import { DbContext, UserContext } from "../main";
import { SyncButton, saveBlobToSupabase } from "../sync";
import Loading from "./Loading";
import { logOut, deleteAccount } from "./Auth";


// -- CONTEXT VARIABLES --
// ****** NOTE: I THINK HOME CONTEXT IS NOT USED ANYWHERE APART FROM THIS HOME SCRIPT ITSELF AND THE SYNC BUTTON.
// MAYBE I CAN CLEAN THINGS UP SO THAT THERE IS NO NEED TO DEFINE HOME CONTEXT? Something to consider for future

// Define context object:
export const HomeContext = createContext();

// Define context provider:
function HomeProvider({children}) {

    const {userId, pdfFolder, saveDir} = useContext(UserContext);
    const {db, supabase} = useContext(DbContext);
    const [pdfObjects, setPdfObjects] = useState([]); // object with pdf.js pdf objects keyed by their filenames.
    const [loadingPdfObjects, setLoadingPdfObjects] = useState(false); // to allow loading icon to show when PDF objects are being fetched
    const [settingsOpen, setSettingsOpen] = useState(false); // to allow settings modal to pop out when desired

    async function refreshPdfObjects() {

        console.log(userId);

        setLoadingPdfObjects(true);

        if ( userId === undefined || pdfFolder === undefined) return; // only attempt to fetch PDFs if folder is defined (may not be defined on initial render)

        let plansResultRows = [];
        if (Capacitor.getPlatform() !== 'web') {
            if (!db || !saveDir) return; 
            const plansResult = await db.query(
                `
                    SELECT pdf_filename 
                    FROM plans 
                    WHERE user_id = ? 
                        AND deleted_at IS NULL
                `, 
                [userId]
            );
            plansResultRows = plansResult.values;
        } else {
            if (!supabase) return; 
            const { data, error } = await supabase
                .from('plans')
                .select('pdf_filename')
                .eq('user_id', userId)
                .is('deleted_at', null);
            if (error) console.error("Error: ", error);
            plansResultRows = data;
        }

        const fileNamesFilter = plansResultRows.map(row => row['pdf_filename']); // array of all pdf_filenames belonging to the user that have not been soft deleted
        const pdfObjects = await getPdfObjects(pdfFolder, saveDir, fileNamesFilter, supabase); // applying fileNamesFilter means we won't retrieve pdfObjects for files the user has already (soft) deleted
        setPdfObjects(pdfObjects);
        
        setLoadingPdfObjects(false);

    };

    // Ensure children, which track pdfObjects, re-run with refreshed pdfObjects on mount and on change of pdfFolder/saveDir:
    // NB we will also (by using refreshPdfObjects in Sync button) refresh after every sync.
    useEffect(() => {
        refreshPdfObjects();
    }, [db, supabase, pdfFolder, saveDir]);

    return (
        <HomeContext.Provider value={{
            pdfObjects, refreshPdfObjects,
            loadingPdfObjects, setLoadingPdfObjects,
            settingsOpen, setSettingsOpen,
        }}>
            {children}
        </HomeContext.Provider>
    );
}


// -- PAGE --

export default function Home() {
        
    return(
        <HomeProvider>
            <div className="home-container">
                <div className="non-plans">
                    {Capacitor.getPlatform() !== 'web' ? <SyncButton /> : null} {/* only show sync button on mobile app */}
                    <h1>My Plans</h1>
                    <RefreshPlansButton />
                    <SettingsButton />
                    <SettingsModal />
                </div>
                <Plans/>
                {/* 
                Note the PDF input itself is treated like an existing PDF, appearing inside the Plans element.
                We will apply common styling to it as other thumbnails, making it fit nicely in the layout so that
                the input button, with its location/sizing, is showing you exactly where the added PDF will go.
                */}
            </div>
        </HomeProvider>
    );
}


// ---- BUTTONS ----

function RefreshPlansButton() {
    const {refreshPdfObjects} = useContext(HomeContext);
    return(
        <button type="button" onClick={refreshPdfObjects}>Refresh plans</button>
    );
}

function SettingsButton() {
    const {setSettingsOpen} = useContext(HomeContext);
    function handleClick() {
        setSettingsOpen(true);
    }
    return(
        <button type="button" onClick={handleClick}>Settings</button>
    );
}


// ---- PDF INPUT ----

function PDFInput() {

    const {db, supabase} = useContext(DbContext);
    const {userId, pdfFolder, saveDir} = useContext(UserContext);
    const {refreshPdfObjects, loadingPdfObjects, setLoadingPdfObjects} = useContext(HomeContext);
    const [uploadMessage, setUploadMessage] = useState(null);
    
    const handleUpload = async function(e) {

        e.preventDefault();
        if (pdfFolder === undefined) return;
        setLoadingPdfObjects(true);

        const id = crypto.randomUUID(); // Database ID for PDF to add (will always be unique)

        // Get & validate pdf file:
        const file = e.target.files[0]; // as we are not using a form, e.target is the file input itself, not the form. So, we do e.target instead of e.target.elements["file-input"]
        
        if (file && file.type === 'application/pdf') { // file verified to be valid, hence save

            const platform = Capacitor.getPlatform();
            
            if (platform !== 'web') {
                // Save to file system:
                const fileName = await saveFile(file, pdfFolder, saveDir);
                // Add to database table:
                await db.run(
                    `
                        INSERT INTO plans (id, user_id, pdf_filename, created_at, updated_at) 
                        VALUES (?, ?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    `,
                    [id, userId, fileName]
                );
            }

            else { // on web
                // Save to file system:
                const fileName = await saveBlobToSupabase(supabase, file, file.name, pdfFolder, 'application/pdf', false) // false to not allow overwriting (PDF name will be incremented as necessary)
                // Add to database table:
                const { error } = await supabase
                    .from('plans')
                    .insert({
                        id: id,
                        user_id: userId,
                        pdf_filename: fileName,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });
                if (error) console.error('Error inserting plan: ', error);
            }

            setUploadMessage('PDF file uploaded successfully!');
            await refreshPdfObjects(); // refresh pdfObjects context variable, which will cause ExistingPlans to update (as it tracks pdfObjects)
        
        } else if (file) {
            setUploadMessage('The file must be a .pdf file.');
        } else {
            setUploadMessage('Please upload a file.');
        }

        // Only show the upload message for 5s before removing it:
        setTimeout(() => {
            setUploadMessage(null);
        }, 5000)
        
    };

    // We will style the overall pdf-input-container similarly to thumbnails of existing PDFs (e.g. same size), to fit nicely in layout.
    // If plans are loading (refreshPdfObjects is running), we will show a loading icon where the input container should go.

    // Loading icon:
    if (loadingPdfObjects) {
        return (
            <div className="pdf-input-container">
                <Loading />
            </div>
        )
    }

    // PDF input:
    else {
        return (
            <div className="pdf-input-container">
                {/* 
                File inputs are notoriously hard to style directly. To enable styling, we will
                hide the actual file input (set display: none) and style the label instead (clicking HTML label
                automatically triggers the input it is associated with via the "for" attribute).

                Also, rather than a traditional form with submit button (which would require user to select submit after
                selecting a file), we will directly monitor the file input for changes, and submit immediately on file selection.
                */}
                <label className="custom-file-input" htmlFor="file-input">File input</label>
                <input type="file" onChange={handleUpload} name="file-input" id="file-input" style={{display: "none"}}/>
                <p>{uploadMessage}</p>
            </div>
        );
    }
    
}


// ---- EXISTING PLANS ----

// Gets and displays all existing plans (i.e. all .pdf files) in saveDir as clickable links.
// Assumes no irrelevant .pdfs in saveDir.
// Also contains PDF input button to allow adding an existing plan, with button located in the same "thumbnails-container".
function Plans() {

    const {pdfObjects} = useContext(HomeContext);
    
    // Note refreshPdfObjects is called by HomeProvider (parent) as an effect with pdfFolder and saveDir deps.
    // As ExistingPlans tracks pdfObjects, plans will automatically be updated on mount and if those deps change.
    // So, here, only need to call refreshPdfObjects on click of refresh button. Otherwise, refresh already handled by parent.
    
    return(
        <div className='thumbnails-container'>
            <PDFInput/>
            {Object.entries(pdfObjects).map(([fileName, pdf]) => {
                const href = `/plan?file=${encodeURIComponent(fileName)}`;
                return (
                    <div className='thumbnail' key={fileName} >
                        <Link className='thumbnail-canvas' to={href} >
                            <ThumbnailViewer pdf={pdf} />
                        </Link>
                        <PDFDeleteButton fileName={fileName} />
                    </div>
                );
            })}
        </div>
    );
}

// Simple PDF viewer with no zoom/scroll capability, used only for displaying thumbnails of PDFs:
function ThumbnailViewer({pdf}) { // pdf is pdf.js pdf object
    
    const [page, setPage] = useState(null);
    const thumbnailRef = useRef(null); // need to provide ref to call PageCanvas with, as PageCanvas is a forwardRef and uses the reference within its code

    // need to wrap in async function, as "await" is used:
    useEffect(() => {
        async function func() {
            const pg = await pdf.getPage(1); // use first page for thumbnail
            setPage(pg);
        }
        func();
    }, [pdf]);

    /* 
    For initial render (before useEffect gets run), page will be null. Don't want null page to be passed to
    PageCanvas, as will cause error, so we want to immediately return nothing if page is null.

    Then, when rendering is finished, useEffect will be run, page will change, and this will trigger re-render, 
    now with valid page (note page is defined here in useState, meaning it is tracked, and re-render is 
    triggered by calling corresponding set function (setPage)).

    Note, this early return must still be at the end of the component, because this way, number & order of executed hooks 
    remains same on every component run (even if the early return occurs). If this was not the case, it would
    violate the rules of hooks.

    This concept is used in other places in this project, but the idea is not re-explained every time.
    */

    if (!page) return;

    return(
        <PageCanvas ref={thumbnailRef} className="thumbnail-canvas" page={page} zoom={1} scrollX={0} scrollY={0} />
    );
}

// Button to delete PDF (identified by fileName input) and all associated database data and images on click:
function PDFDeleteButton({fileName}) {

    const {db, supabase} = useContext(DbContext);
    const {userId} = useContext(UserContext);
    const {refreshPdfObjects, setLoadingPdfObjects} = useContext(HomeContext);

    async function handleClick() {

        setLoadingPdfObjects(true);

        const platform = Capacitor.getPlatform();
            
        if (platform !== 'web') {

            if (!db) return;

            const plansResult = await db.query(
                `
                    SELECT id 
                    FROM plans 
                    WHERE pdf_filename = ? 
                        AND user_id = ?
                `, 
                [fileName, userId]
            );
            const planId = plansResult.values[0]['id']; // query should return only one value, so take the first (only) one
            // ^ note, we are confident plansResult.values will not be empty, and that the returned id has not been deleted, because if the PDFDeleteButton is being shown (i.e. was retrieved by refreshPdfObjects), the plan must exist and be non-soft-deleted in the database

            const markersResult = await db.query(
                `
                    SELECT id 
                    FROM markers 
                    WHERE plan_id = ? 
                        AND deleted_at IS NULL
                `, 
                [planId]
            );
            if (markersResult.values.length !== 0) {
                const markerIds = markersResult.values.map(row => row['id']); // for one PDF, there will be multiple associated markers (we will want to delete all of them)
                const markerIdPlaceholders = markerIds.map(() => '?').join(', ') // e.g. if 3 IDs, will equal '?, ?, ?'

                // Even though ON DELETE CASCADE is already set up in database, only works for hard deletion, so for soft-deletion, need to manually get the images associated with the deleted marker:
                // Note deletion from images table must come before deletion from markers table, as images table has foreign key constraint on markerId; i.e. marker must exist.
                // Even though this is only soft-delete, we want to ensure the deleted_at for the image is older than the deleted_at for the marker, so there is no reason for marker to get deleted without image being deleted first.
                // Likewise, deletion from markers table must come before deletion from plans table.
                await db.run(
                    `
                        UPDATE images 
                        SET deleted_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
                            updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now') 
                        WHERE marker_id IN (${markerIdPlaceholders}) 
                            AND deleted_at IS NULL
                    `, // ^ the "AND deleted_at IS NULL" means we don't reset the deleted_at of already-deleted records (which would artificially extend their lifetime and potentially cause bugs)
                    markerIds
                );
                await db.run(
                    `
                        UPDATE markers 
                        SET deleted_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
                            updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                        WHERE plan_id = ?
                            AND deleted_at IS NULL
                    `,  // ^ the "AND deleted_at IS NULL" means we don't reset the deleted_at of already-deleted records (which would artificially extend their lifetime and potentially cause bugs)
                    [planId]
                );
            }

            await db.run(
                `
                    UPDATE plans 
                    SET deleted_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
                        updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE id = ?
                `, 
                [planId]
            );
        
        }

        else { // on web

            if (!supabase) return;

            // Get plan ID from pdf_filename and user_id:
            const { data: plansData, error: plansError } = await supabase
                .from('plans')
                .select('id')
                .eq('pdf_filename', fileName)
                .eq('user_id', userId)
                .single(); // assumes one result expected
            if (plansError) console.error('Error fetching plan: ', plansError);

            const planId = plansData['id'];

            // Get all markers for that plan which are not soft-deleted:
            const { data: markersData, error: markersError } = await supabase
                .from('markers')
                .select('id')
                .eq('plan_id', planId)
                .is('deleted_at', null);
            if (markersError) console.error('Error fetching markers: ', markersError);

            // Soft-delete images and markers associated with plan:
            if (markersData.length !== 0) {

                const markerIds = markersData.map(marker => marker.id);

                // Soft-delete images:
                const { error: imagesUpdateError } = await supabase
                    .from('images')
                    .update({
                        deleted_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .in('marker_id', markerIds)
                    .is('deleted_at', null);
                if (imagesUpdateError) console.error('Error soft-deleting images: ', imagesUpdateError);

                // Soft-delete markers:
                const { error: markersUpdateError } = await supabase
                    .from('markers')
                    .update({
                        deleted_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('plan_id', planId)
                    .is('deleted_at', null);
                if (markersUpdateError) console.error('Error soft-deleting markers: ', markersUpdateError);

            }

            // Soft-delete the plan itself:
            const { error: planUpdateError } = await supabase
                .from('plans')
                .update({
                    deleted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', planId);
            if (planUpdateError) console.error('Error soft-deleting plan: ', planUpdateError);

        }
        
        // Note we are not hard-deleting the files from storage here, as that happens as part of separate clean-up function (see sync.jsx)

        await refreshPdfObjects();

    }

    return(
        <button type="button" className="bad" onClick={handleClick}>Delete</button>
    );

}


// ---- SETTINGS ----

function SettingsModal() {

    const { userId, setUserId } = useContext(UserContext);
    const { db, supabase } = useContext(DbContext);
    const { saveDir } = useContext(HomeContext);
    const { settingsOpen, setSettingsOpen } = useContext(HomeContext);
    const [loading, setLoading] = useState(false);

    function closeSettings() {
        setSettingsOpen(false);
    }
    async function logOutUser() {
        await logOut(supabase, setUserId);
    }
    async function deleteUserAccount() {
        setLoading(true);
        await deleteAccount(supabase, db, userId, setUserId, saveDir);
        setLoading(false);
    }

    return (
        <Modal className="settings-modal" isOpen={settingsOpen} onRequestClose={closeSettings}>
            <div className="big-buttons-container">
                <button type="button" onClick={logOutUser}>Log out</button>
                <button type="button" className="bad" onClick={deleteUserAccount}>
                    {loading ? <Loading /> : 'Delete account'}
                </button>
                <button type="button" onClick={closeSettings}>Close</button>
            </div>
        </Modal>
    );
}
