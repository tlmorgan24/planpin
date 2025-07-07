import { useContext, useState, useRef, useEffect, createContext } from "react";
import { Link } from "react-router-dom";
import { PageCanvas } from "../pdf-render";
import { getPdfObjects, saveFile } from '../pdf-setup';
import { AppContext } from '../App';
import { DbContext, UserContext } from "../main";


// -- CONTEXT VARIABLES --
// ****** NOTE: I THINK HOME CONTEXT IS NOT USED ANYWHERE APART FROM THIS HOME SCRIPT ITSELF.
// MAYBE I CAN CLEAN THINGS UP SO THAT THERE IS NO NEED TO DEFINE HOME CONTEXT? Something to consider fur future

// Define context object:
const HomeContext = createContext();

// Define context provider:
function HomeProvider({children}) {

    const {userId} = useContext(UserContext);
    const {db} = useContext(DbContext);
    const {pdfFolder, saveDir} = useContext(AppContext);
    const [pdfObjects, setPdfObjects] = useState([]); // object with pdf.js pdf objects keyed by their filenames.
    
    async function refreshPdfObjects() {

        if (!saveDir || pdfFolder === undefined) return; // only attempt to fetch PDFs if folder is defined (may not be defined on initial render)
        const plansResult = await db.query('SELECT pdf_filename FROM plans WHERE user_id = ? AND deleted_at IS NULL', [userId]);
        const fileNamesFilter = plansResult.values.map(row => row['pdf_filename']); // array of all pdf_filenames belonging to the user that have not been soft deleted
        const pdfObjects = await getPdfObjects(pdfFolder, saveDir, fileNamesFilter); // applying fileNamesFilter means we won't retrieve pdfObjects for files the user has already (soft) deleted
        setPdfObjects(pdfObjects);

    };

    // Ensure children, which track pdfObjects, re-run with refreshed pdfObjects on mount and on change of pdfFolder/saveDir:
    useEffect(() => {
        refreshPdfObjects();
    }, [pdfFolder, saveDir]);

    return (
        <HomeContext.Provider value={{
            pdfObjects, refreshPdfObjects
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
                <h1>My Plans</h1>
                <RefreshPlansButton/>
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


// ---- PDF INPUT ----

function PDFInput() {

    const {db} = useContext(DbContext);
    const {userId} = useContext(UserContext);
    const {pdfFolder, saveDir} = useContext(AppContext);
    const {refreshPdfObjects} = useContext(HomeContext);
    const [uploadMessage, setUploadMessage] = useState(null);
    
    const handleUpload = async function(e) {

        e.preventDefault();

        if (pdfFolder === undefined) return;

        // Get & validate pdf file:
        const file = e.target.files[0]; // as we are not using a form, e.target is the file input itself, not the form. So, we do e.target instead of e.target.elements["file-input"]
        
        if (file && file.type === 'application/pdf') { // file verified to be valid, hence save

            const fileName = await saveFile(file, pdfFolder, saveDir);
            
            const id = crypto.randomUUID(); // Database ID for PDF to add (will always be unique)
            await db.run(`
                INSERT INTO plans (id, user_id, pdf_filename) 
                VALUES (?, ?, ?)
                `,
                [id, userId, fileName]
            );

            setUploadMessage('PDF file uploaded successfully!');
            await refreshPdfObjects(); // refresh pdfObjects context variable, which will cause ExistingPlans to update (as it tracks pdfObjects)
        
        } else if (file) {
            setUploadMessage('The file must be a .pdf file.');
        } else {
            setUploadMessage('Please upload a file.');
        }
        
    };

    return (
        <div className="pdf-input-container">
            {/* 
            File inputs are notoriously hard to style directly. To enable styling, we will
            hide the actual file input (set display: none) and style the label instead (clicking HTML label
            automatically triggers the input it is associated with via the "for" attribute).

            We will style the overall pdf-input-container similarly to thumbnails of existing PDFs (e.g. same size), to fit nicely in layout.

            Also, rather than a traditional form with submit button (which would require user to select submit after
            selecting a file), we will directly monitor the file input for changes, and submit immediately on file selection.
            */}
            <label className="custom-file-input" htmlFor="file-input">File input</label>
            <input type="file" onChange={handleUpload} name="file-input" id="file-input" style={{display: "none"}}/>
            <p>{uploadMessage}</p>
        </div>
    );
}

// ---- REFRESH PLANS ----

function RefreshPlansButton() {
    const {refreshPdfObjects} = useContext(HomeContext);
    return(
        <button type="button" onClick={refreshPdfObjects}>Refresh plans</button>
    );
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
                    <div className='thumbnail'>
                        <Link className='thumbnail-canvas' key={fileName} to={href}>
                            <ThumbnailViewer pdf={pdf}/>
                        </Link>
                        <PDFDeleteButton fileName={fileName}/>
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

    const {db} = useContext(DbContext);
    const {userId} = useContext(UserContext);
    const {refreshPdfObjects} = useContext(HomeContext);

    async function handleClick() {

        console.log("Delete button clicked!");
        console.log("plans table before deletion code: ", await db.query('SELECT * FROM plans'));

        if (!db) return;

        const plansResult = await db.query('SELECT id FROM plans WHERE pdf_filename = ? AND user_id = ?', [fileName, userId]);
        const planId = plansResult.values[0]['id']; // query should return only one value, so take the first (only) one
        // ^ note, we are confident plansResult.values will not be empty, and that the returned id has not been deleted, because if the PDFDeleteButton is being shown (i.e. was retrieved by refreshPdfObjects), the plan must exist and be non-soft-deleted in the database

        const markersResult = await db.query('SELECT id FROM markers WHERE plan_id = ? AND deleted_at IS NULL', [planId]);
        if (markersResult.values.length !== 0) {
            const markerIds = markersResult.values.map(row => row['id']); // for one PDF, there will be multiple associated markers (we will want to delete all of them)
            const markerIdPlaceholders = markerIds.map(() => '?').join(', ') // e.g. if 3 IDs, will equal '?, ?, ?'

            // Even though ON DELETE CASCADE is already set up in database, only works for hard deletion, so for soft-deletion, need to manually get the images associated with the deleted marker:
            // Note deletion from images table must come before deletion from markers table, as images table has foreign key constraint on markerId; i.e. marker must exist.
            // Even though this is only soft-delete, we want to ensure the deleted_at for the image is older than the deleted_at for the marker, so there is no reason for marker to get deleted without image being deleted first.
            // Likewise, deletion from markers table must come before deletion from plans table.
            await db.run(`UPDATE images SET deleted_at = CURRENT_TIMESTAMP WHERE marker_id IN (${markerIdPlaceholders}) AND deleted_at IS NULL`, markerIds) // the "AND deleted_at IS NULL" means we don't reset the deleted_at of already-deleted records (which would artificially extend their lifetime and potentially cause bugs)
            await db.run('UPDATE markers SET deleted_at = CURRENT_TIMESTAMP WHERE plan_id = ?', [planId]);
        }

        await db.run('UPDATE plans SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [planId]);
        
        // Note we are not deleting the files from local storage here, as that will happen during clean up 30 days later (see database.jsx)

        console.log("plans table after deletion code: ", await db.query('SELECT * FROM plans'));

        await refreshPdfObjects();

    }

    return(
        <button type="button" className="delete-button" onClick={handleClick}>Delete</button>
    );

}
