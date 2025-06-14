import { useContext, useState, useRef, useEffect, createContext } from "react";
import { Link } from "react-router-dom";
import { PageCanvas } from "../pdf-render";
import { getAllPDFObjects, saveFile } from '../pdf-setup';
import { AppContext } from '../App';


// -- CONTEXT VARIABLES --

// Define context object:
const HomeContext = createContext();

// Define context provider:
function HomeProvider({children}) {

    const {pdfFolder, saveDir} = useContext(AppContext);
    const [pdfObjects, setPDFObjects] = useState([]); // object with pdf.js pdf objects keyed by their filenames.
    
    async function refreshPDFObjects() {
        const pdfObjects = await getAllPDFObjects(pdfFolder, saveDir);
        setPDFObjects(pdfObjects);
    };

    // Ensure children, which track pdfObjects, re-run with refreshed pdfObjects on mount and on change of pdfFolder/saveDir:
    useEffect(() => {
        refreshPDFObjects();
    }, [pdfFolder, saveDir])

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
            <div>
            
                {/* EXISTING PDF PLANS */}
                <h1>My Plans</h1>
                <ExistingPlans/>

                {/* SUBMIT PDF */}
                <h2>Add a plan</h2>
                <PDFInputForm/>

            </div>
        </HomeProvider>
    );
}


// ---- EXISTING PLANS ----

// Gets and displays all existing plans (i.e. all .pdf files) in saveDir as clickable links.
// Assumes no irrelevant .pdfs in saveDir.
function ExistingPlans() {

    const {pdfObjects, refreshPDFObjects} = useContext(HomeContext);
    
    // Note refreshPDFObjects is called by HomeProvider (parent) as an effect with pdfFolder and saveDir deps.
    // As ExistingPlans tracks pdfObjects, plans will automatically be updated on mount and if those deps change.
    // So, here, only need to call refreshPDFObjects on click of refresh button. Otherwise, refresh already handled by parent.
    
    return(
        <div>
            <button type="button" onClick={refreshPDFObjects}>Refresh plans</button>
            <div className="thumbnailsContainer">
                {Object.entries(pdfObjects).map(([fileName, pdf]) => {
                    const href = `/plan?file=${encodeURIComponent(fileName)}`;
                    return (
                        <Link key={fileName} to={href} className="thumbnail">
                            <ThumbnailViewer pdf={pdf}/>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

// Simple PDF viewer with no zoom/scroll capability, used only for displaying thumbnails of PDFs:
export function ThumbnailViewer({pdf}) { // pdf is pdf.js pdf object
    
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
        <PageCanvas ref={thumbnailRef} page={page} zoom={1} scrollX={0} scrollY={0} className="thumbnail"/>
    );
}


// ---- PDF INPUT FORM ----

function PDFInputForm() {

    const {pdfFolder, saveDir} = useContext(AppContext);
    const {refreshPDFObjects} = useContext(HomeContext);
    const [uploadMessage, setUploadMessage] = useState(null);
    
    const handleSubmit = async function(e) {

        e.preventDefault();

        // Get & validate pdf file:
        const fileInput = e.target.elements.fileInput;
        const file = fileInput.files[0];
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
        <div>
            <form id="pdfInputForm" onSubmit={handleSubmit}>
                <label htmlFor="fileInput">File input</label>
                <input type="file" name="fileInput" id="fileInput"/>
                <input type="submit" id="submitFile" value="Submit"/>
            </form>
            <p>{uploadMessage}</p>
        </div>
    );
}