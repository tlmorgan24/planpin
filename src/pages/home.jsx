import { useContext, useState, useRef, useEffect, createContext } from "react";
import { Link } from "react-router-dom";
import { PageCanvas } from "../pdf-render";
import { getAllPDFObjects, saveFile, removeFile } from '../pdf-setup';
import { AppContext } from '../App';
import { DbContext } from "../main";


// -- CONTEXT VARIABLES --

// Define context object:
const HomeContext = createContext();

// Define context provider:
function HomeProvider({children}) {

    const {pdfFolder, saveDir} = useContext(AppContext);
    const [pdfObjects, setPDFObjects] = useState([]); // object with pdf.js pdf objects keyed by their filenames.
    
    async function refreshPDFObjects() {
        if (pdfFolder === undefined) return; // only attempt to fetch PDFs if folder is defined (may not be defined on initial render)
        const pdfObjects = await getAllPDFObjects(pdfFolder, saveDir);
        setPDFObjects(pdfObjects);
    };

    // Ensure children, which track pdfObjects, re-run with refreshed pdfObjects on mount and on change of pdfFolder/saveDir:
    useEffect(() => {
        refreshPDFObjects();
    }, [pdfFolder, saveDir]);

    return (
        <HomeContext.Provider value={{
            pdfObjects, refreshPDFObjects
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

    const {pdfFolder, saveDir} = useContext(AppContext);
    const {refreshPDFObjects} = useContext(HomeContext);
    const [uploadMessage, setUploadMessage] = useState(null);
    
    const handleUpload = async function(e) {

        e.preventDefault();

        if (pdfFolder === undefined) return;

        // Get & validate pdf file:
        const file = e.target.files[0]; // as we are not using a form, e.target is the file input itself, not the form. So, we do e.target instead of e.target.elements["file-input"]
        if (file && file.type === 'application/pdf') {
            await(saveFile(file, pdfFolder, saveDir)); // file verified to be valid, hence save
            setUploadMessage('PDF file uploaded successfully!');
            await refreshPDFObjects(); // refresh pdfObjects context variable, which will cause ExistingPlans to update (as it tracks pdfObjects)
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
    const {refreshPDFObjects} = useContext(HomeContext);
    return(
        <button type="button" onClick={refreshPDFObjects}>Refresh plans</button>
    );
}



// ---- EXISTING PLANS ----

// Gets and displays all existing plans (i.e. all .pdf files) in saveDir as clickable links.
// Assumes no irrelevant .pdfs in saveDir.
// Also contains PDF input button to allow adding an existing plan, with button located in the same "thumbnails-container".
function Plans() {

    const {pdfObjects} = useContext(HomeContext);
    
    // Note refreshPDFObjects is called by HomeProvider (parent) as an effect with pdfFolder and saveDir deps.
    // As ExistingPlans tracks pdfObjects, plans will automatically be updated on mount and if those deps change.
    // So, here, only need to call refreshPDFObjects on click of refresh button. Otherwise, refresh already handled by parent.
    
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

    const {pdfFolder, imageFolder, saveDir} = useContext(AppContext);
    const {db} = useContext(DbContext);
    const {refreshPDFObjects} = useContext(HomeContext);

    async function handleClick() {

        if (!db || pdfFolder === undefined || imageFolder === undefined) return;

        const markersResult = await db.query('SELECT id FROM markers WHERE pdf_filename = ?', [fileName])
        // DO NOT DO "if (markersResult.values.length === 0) return;", as even if no markers, we still want to continue to delete markers and PDF
        let imageFileNames = [];
        if (markersResult.values.length !== 0) {
            const ids = markersResult.values.map(row => row['id']); // for one PDF, there will be multiple associated markers (we will want to delete all of them)
            const placeholders = ids.map(() => '?').join(', ') // e.g. if 3 IDs, will equal '?, ?, ?'

            const imagesResult = await db.query(`SELECT image_filename FROM images WHERE marker_id IN (${placeholders})`, ids)
            // DO NOT DO "if (imagesResult.values.length === 0) return;", as even if no images, we still want to continue to delete markers and PDF
            imageFileNames = imagesResult.values.map(row => row['image_filename']); // for one PDF id, there may be multiple associated images (we will want to delete all of them)
        }
        // ^ if no markers, or if no images associated to relevant markers, imageFileNames remains as empty array

        // Remove relevant entries from images database and markers database, and remove stored images and PDF itself from Filesystem:
        // Explicit deletion from images table unnecessary, seeing as ON DELETE CASCADE is already set up in database, so I have commented this out:
        /*
        // Note deletion from images table must come before deletion from markers table, as images table has foreign key constraint on markerId; i.e. marker must exist.
        await db.run(`DELETE FROM images WHERE marker_id IN (${placeholders})`, ids);
        */ 
        await db.run('DELETE FROM markers WHERE pdf_filename = ?', [fileName]);
        for (const imageFileName of imageFileNames) {
            await removeFile(imageFileName, imageFolder, saveDir);
        }
        await removeFile(fileName, pdfFolder, saveDir); // This final line is all that would be required if we were only deleting the PDF file and not the associated data

        await refreshPDFObjects();

    }

    return(
        <button type="button" className="delete-button" onClick={handleClick}>Delete</button>
    );

}
