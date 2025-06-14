import { createContext, useState, useRef, useContext, useEffect } from "react";
import { useLocation } from 'react-router-dom';
import { HomeButton, NextPageButton, PreviousPageButton, ResetViewButton} from "../plan-buttons";
import { InteractivePage } from "../pdf-render";
import { MarkerLayer } from "../markers";
import { readPDF, loadPDF } from "../pdf-setup";
import { AppContext } from "../App";
import { DbContext } from "../main";


// -- CONTEXT VARIABLES --

// Define context object:
export const PlanContext = createContext();

// Define context provider:
function PlanProvider({children}) {

    // pdfFileName (as passed to this component when user clicked on thumbnail on homepage):
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const [pdfFileName, setPDFFileName] = useState(params.get('file')); // pdf fileName at end of path (e.g. "myplan.pdf")

    const [numPages, setNumPages] = useState(1); // number of pages in PDF (initialised to 1)
    const [pageNum, setPageNum] = useState(1); // page number (initialised to 1)
    const [zoom, setZoom] = useState(1); // zoom factor, where 1 means at least one dimension of the PDF is shown entirely on canvas (initialised to 1)
    const [scrollX, setScrollX] = useState(0); // rightwards scroll in true-size PDF pt, where 0 means left-aligned (initialised to 0)
    const [scrollY, setScrollY] = useState(0); // downwards scroll in true-size PDF pt, where 0 means top-aligned (initialised to 0)
    
    const [zoomIncrement, setZoomIncrement] = useState(1.04); // zoom increment factor
    const [scrollIncrement, setScrollIncrement] = useState(6); // absolute scroll increment in PDF pt, which will be divided by zoom factor (for finer scrolling when zoomed in)
    // ^ I have adjusted increment values such that rate is appropriate when doing trackpad pinching/dragging (which, as per my useWheelZoom and useWheelPan effects, causes continuous increments of zoom/scroll)

    // clickLocations:
        // Array of location objects, where each location has properties id, pdfPath, pageNum, x, y, imagePath.
        // x and y will be in pt from top left (rightwards & downwards, respectively), for true-size PDF (independent of zooming).
        // pdfPath and imagePath will be relative to pdf and image folder locations (defined in app context).
        // pdfPath is only an input in case we end up needing this... clickLocations will be generated/refreshed from a single PDF (pdfFileName), so pdfPath will be the same for all entries of clickLocations
        // IT MAY BE THAT MY PROGRAM ASSUMES ALL IS AT TOP LEVEL OF THE FOLDER (i.e. I SAY pdfPath, but I actually MEAN pdfFileName and assume it's directly in pdfFolder)
    const [clickLocations, setClickLocations] = useState([]); // initially empty
    // Get existing data from markers database:
    const {db} = useContext(DbContext);
    useEffect(() => {
        async function func() {

            if (!db) return;
            const res = await db.query('SELECT * FROM markers WHERE pdfPath = ?', [pdfFileName]); // only get data for this PDF
            // res.values will be an array of rows, or undefined if empty
            if (!(res.values && res.values.length > 0)) return;
            const loadedClickLocations = res.values.map(row => ({
            id: row.id,
            pdfPath: row.pdfPath,
            pageNum: row.pageNum,
            x: row.x,
            y: row.y,
            imagePath: row.imagePath
            }));
            setClickLocations(loadedClickLocations);

        }
        func();
    }, [db, pdfFileName]) // NB: changes to db do not trigger re-run; only triggers when db references different database (i.e. if db was intiially null and is now referencing the database object, it will run)

    // ^ MAY WISH TO CHANGE clickLocations SUCH THAT ID IS THE KEY AND EVERYTHING ELSE IS THE VALUE, FOR EASIER REFERENCE LATER (E.G. get the image associated with X ID)


    return (
        <PlanContext.Provider value={{
        pdfFileName, setPDFFileName,
        numPages, setNumPages,
        pageNum, setPageNum,
        zoom, setZoom,
        scrollX, setScrollX,
        scrollY, setScrollY,
        zoomIncrement, setZoomIncrement,
        scrollIncrement, setScrollIncrement,
        clickLocations, setClickLocations,
        }}>
            {children}
        </PlanContext.Provider>
    );
}


// -- PAGE --

export default function Plan() {

    // Get pdf file:
    const {pdfFolder, saveDir} = useContext(AppContext);
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const fileName = params.get('file');
    // readPDF and loadPDF are async functions, so have to put inside useEffect:
    const [pdf, setPDF] = useState(null);
    useEffect(() => {
        async function func() {
            const pdfData = await readPDF(fileName, pdfFolder, saveDir); // pdf data as Uint8Array
            const pdf = await loadPDF(pdfData); // pdf is pdf.js pdf object
            setPDF(pdf);
        }
        func();
    }, [fileName, pdfFolder, saveDir]);

    // For initial render (before useEffect kicks in), pdf will be null.
    // Don't want null pdf to be passed to PDFViewer, as will cause error, so immediately return nothing:
    if (!pdf) return null;
    
    return(
        <PlanProvider>
            <div>

                <HomeButton/>
        
                {/* PDF viewer */}

                <h1>PDF Plan</h1>

                <NextPageButton/>
                <PreviousPageButton/>
                <ResetViewButton/>
                <br/>

                <PDFViewer pdf={pdf}/>

            </div>
        </PlanProvider>
    );
}


// -- PDF VIEWER --

// Advanced PDF viewer comprising interactive page with zoom/scroll capability and marker layer to show stored click locations:
export function PDFViewer({pdf}) { // pdf is pdf.js pdf object

    const [page, setPage] = useState(null); // will be set to pdf.js page object
    const {pageNum, setNumPages} = useContext(PlanContext); // will be set to page number of current page

    const [canvas, setCanvas] = useState(null);
    const [mapping, setMapping] = useState(null);
    const [drawnWindow, setDrawnWindow] = useState(null);

    const interactivePageRef = useRef(null);
    const markerLayerRef = useRef(null);

    // -- SET PDF.JS PAGE OBJECT --
    
    // need to wrap in async function, as getPage (being an async function) requires "await" to be used:
    useEffect(() => {
        async function func() {
            const pg = await pdf.getPage(pageNum);
            setPage(pg);
            setNumPages(pdf.numPages);
        }
        func();
    }, [pdf, pageNum]);

    // -- EVENT LISTENERS --

    /* 
    Note MarkerLayer is the topmost visible element, so it will receive all events. Instead of letting it steal all 
    these, we want it to only handle click events itself, and to pass all other events to InteractivePage (which needs 
    them to handle zoom/scroll).
    */

    useEffect(() => {

        // Even though useEffect only runs after render, markerLayerRef and interactivePageRef will still be null on first useEffect, as component returns early (if (!page) return) without rendering these components.
        // Hence need to stop the useEffect running in this initial instance:
        if (!markerLayerRef.current || !interactivePageRef.current) return;

        function forwardToInteractivePage(e) {
            e.preventDefault(); // block default behaviour of original event
            interactivePageRef.current.dispatchEvent(new e.constructor(e.type, e)); // pass new synthetic event of same type to InteractivePage
            // The InteractivePage component will listen for and handle these events.
        }

        /*
        But we will not simply forward all events needed in InteractivePage to that component, because touchstart and 
        touchend are ALSO needed by MarkerLayer to register taps as clicks. We will need to determine when a touchstart 
        & touchend are close enough in time & space to consider as a tap. If so, we will dispatch a click event to 
        MarkerLayer (which MarkerLayer is listening for according to it's component code). We still, in all cases, 
        forward the touchstart and touchend events to InteractivePage (so, if they end up representing a drag/pinch,
        it can be handled properly; if the event is not a drag/pinch, it's fine as InteractivePage will not trigger 
        anything). What matters is that, if the event is a tap, MarkerLayer always receives it (as a click).
        */

        let touchStartTime;
        let touchStartX;
        let touchStartY;

        function handleTouchStart(e) {
            if (e.touches.length === 1) {
                touchStartTime = Date.now();
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
            forwardToInteractivePage(e); // still forward all events to InteractivePage, so if it turns out to be part of a drag/pinch, it will be handled properly
        }

        function handleTouchEnd(e) {
            if (touchStartTime) {
                const touchEndTime = Date.now();
                const touchDuration = touchEndTime - touchStartTime;
                
                // Check if it was a tap (short duration, little movement)
                if (touchDuration < 300) { // 300ms is typical time threshold for tap
                    const touch = e.changedTouches[0];
                    const movementX = Math.abs(touch.clientX - touchStartX);
                    const movementY = Math.abs(touch.clientY - touchStartY);
                    if (movementX < 10 && movementY < 10) { // 10px is typical movement threshold for tap
                        // event is a tap: dispatch click to MarkerLayer:
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            clientX: touch.clientX,
                            clientY: touch.clientY
                        });
                        markerLayerRef.current.dispatchEvent(clickEvent);
                    }
                }
            }

            forwardToInteractivePage(e); // still forward all events to InteractivePage, so if it turns out to be part of a drag/pinch, it will be handled properly
        }

        // Forward all events needed in InteractivePage, which MarkerLayer would otherwise steal:
        // Note passive:false is necessary if doing preventDefault() with wheel, touchstart & touchmove events:
        markerLayerRef.current.addEventListener('wheel', forwardToInteractivePage, { passive: false });
        markerLayerRef.current.addEventListener('touchstart', handleTouchStart, { passive: false });
        markerLayerRef.current.addEventListener('touchmove', forwardToInteractivePage, { passive: false });
        markerLayerRef.current.addEventListener('touchend', handleTouchEnd);
        // The MarkerLayer's click event will be listened to and handled by the MarkerLayer component (no need to listen for it here).
    
        // Clean-up function to remove listeners, preventing listeners from stacking on top of each other every run:
        return () => {
            if (!markerLayerRef.current) return; // in case MarkerLayer unmounts before this clean-up is carried out
            markerLayerRef.current.removeEventListener('wheel', forwardToInteractivePage);
            markerLayerRef.current.removeEventListener('touchstart', handleTouchStart);
            markerLayerRef.current.removeEventListener('touchmove', forwardToInteractivePage);
            markerLayerRef.current.removeEventListener('touchend', handleTouchEnd);
        };

    }, [page]);

    // -- DEFINE CALLBACK FUNCTION --

    // Define callback (to InteractivePage component) such that, after InteractivePage paints to browser,
    // it will update this component's canvas, mapping and drawnWindow states (which can then be passed to returned MarkerLayer):
    function setStates({canvas, mapping, drawnWindow}) {
        setCanvas(canvas);
        setMapping(mapping);
        setDrawnWindow(drawnWindow);
    }

    /* 
    When MarkerLayer is called (in this component's return code), it is possible that 
    canvas, mapping and drawnWindow would not have been set yet (will still be null).
    If we checked for this here and cancelled the render if these are null, then the page itself would not render.
    
    Instead, we want to cancel rendering of the MarkerLayer only, and allow the other components 
    (InteractivePage and descendants) to still render. Hence, we will do the check in the MarkerLayer component itself.
    */

    // -- RETURN --

    if (!page) return; // don't want to pass null page (which is the case on first run) to children components

    // Note using ref attribute on React components (InteractivePage & MarkerLayer) rather than traditional HTML elements is allowed here thanks to them having being defined as forwardRefs:
    return(
        <div className="pageContainer">
            <InteractivePage ref={interactivePageRef} page={page} callback={setStates}/>
            <MarkerLayer ref={markerLayerRef} page={page} canvas={canvas} mapping={mapping} drawnWindow={drawnWindow}/>
        </div>
    );
}