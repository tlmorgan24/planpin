import { forwardRef, useContext, useState, useEffect, useRef } from "react";
import { PlanContext } from "./pages/plan";
import { DbContext } from "./main";
import Modal from 'react-modal';

// ---- MARKER COMPONENT ----

// Creates marker at specified canvas location (where canvasX and canvasY are from top left of canvas in CS px):
// This marker will be used to show the user's click locations on the plan.
function Marker({ canvasX, canvasY }) {
    // CSS incorporated here rather than in .css file, due to dynamic nature of positioning and the fact that it is dependent on width & height.
    const width = 10; // px
    const height = 10; // px
    return(
        <div 
            className="marker" 
            style={{
                position: 'absolute', // such that left and top positions will be relative to parent (canvas), assuming that parent has non-static position.
                width: `${width}px`,
                height: `${height}px`,
                left: `${canvasX - width/2}px`,
                top: `${canvasY - height/2}px`,
                backgroundColor: 'red',
                borderRadius: '50%'
            }}
        />
    );
}


// ---- MARKER LAYER COMPONENT ----

// Layer over desired canvas which displays markers at stored click locations and handles clicks to store new ones.
// Defined as forwardRef as it must be referenced in PDFViewer component.
// For markers to be displayed in correct locations relative to the PDF shown by underlying canvas:
    // this component must be exact same size and location as canvas (by using appropriate CSS)
    // the mapping and drawnWindow passed to this component must be up to date, as calculated by the PageCanvas component after it has drawn.
export const MarkerLayer = forwardRef(({ page, canvas, mapping, drawnWindow }, markerLayerRef) => { // page is pdf.js page object

    // Note, when this component is called, it is possible canvas, mapping and drawnWindow will be null (see PDFViewer).
    // Hence, checks for these are incorporated in this component's effects & event handlers.

    const pageNum = page.pageNumber;
    const {clickLocations, setClickLocations, pdfFileName} = useContext(PlanContext);
    const {db} = useContext(DbContext);
    const [markerLocations, setMarkerLocations] = useState([]); // will be array of id, canvasX, and canvasY. id same as in database, canvas coordinates in CSS px.
    const [clickedId, setClickedId] = useState(null); // to track which marker was just clicked or added (will be null on first render, even if there are clickLocations already stored in database)

    // Trigger re-draw of markers when page, canvas, mapping, drawnWindow or clickLocations changes:
    useEffect(() => {
        if (!canvas || !mapping || !drawnWindow) return;
        drawMarkers(canvas, mapping, pageNum, clickLocations, setMarkerLocations)
    }, [page, canvas, mapping, drawnWindow, clickLocations]);

    // Define function to add clickLocation (hence marker) when user clicks:
    async function handleClick(e) {
        if (!mapping || !drawnWindow) return;
        if (e.target == markerLayerRef.current) { // click is not on a Marker; it is on blank space of the MarkerLayer itself
            await addMarker(e, mapping, drawnWindow, pageNum, clickLocations, setClickLocations, setClickedId);
            // ^ Thanks to the if statement, we ensure e.target is the MarkerLayer itself. 
            // This is important, as addMarker assumes e.target has same location & dimensions as canvas.
            // As per our CSS, MarkerLayer does have same location & dimensions as canvas. 
        }
        else { // click is on a Marker
            1; // REPLACE WITH FUNCTION TO EXECUTE WHEN CLICKING ON A MARKER
        }
    } 

    return(                        
        <div ref={markerLayerRef} className="markerLayer" onClick={handleClick}>
            {/* Render markers according to latest markerLocations: */}
            {markerLocations.map(({ id, canvasX, canvasY }, i) => (
                <Marker key={id} canvasX={canvasX} canvasY={canvasY} />
            ))}
            {/* Form modal to pop up when user wants to add a marker: */}
            <FormModal clickedId={clickedId} setClickedId={setClickedId} clickLocations={clickLocations} setClickLocations={setClickLocations} pdfFileName={pdfFileName} db={db} />
        </div>
    );

});


// ---- MARKER FORM ----

// When user adds a marker (see addMarker function), this modal form will pop up to allow them to input additional details about the defect:

function FormModal({ clickedId, setClickedId, clickLocations, setClickLocations, pdfFileName, db }) {

    const [isOpen, setIsOpen] = useState(false);
    const formRef = useRef(null);

    // Open form on change of newClickLocation (meaning user has just added a marker; see addMarker function):
    useEffect(() => {
        if (!clickedId) return; // on first render (when user has not yet clicked), do not open form
        /* 
        Also note, clickedId will be reset to null whenever form is closed/submitted (see other functions). This way,
        the user will be able to click again on the just-added marker, and the useEffect will still register
        a new clickedId, and form will open again. Even though the reset to null, itself, is a change in 
        clickedId and causes this effect to run, it will not cause form to open thanks to the above null check 
        on clickedId.
        */
        setIsOpen(true);
    }, [clickedId])
    
    // If user requests close without pressing submit, close form and without submitting to database and erase the marker just added:
    function onRequestClose() {
        setClickLocations(clickLocations.slice(0, -1)); // erase marker just added
        setClickedId(null);
        setIsOpen(false);
    }

    // When user presses submit, submit to database and close form:
    async function handleSubmit(e) {
        e.preventDefault();
        const els = formRef.current.elements;

        const newClickLocation = clickLocations[clickLocations.length - 1]; // info for marker just added
        const id = newClickLocation.id;
        const pageNum = newClickLocation.pageNum;
        const x = newClickLocation.x;
        const y = newClickLocation.y;
        const imagePath = els.imagePath.value;
        const description = els.description.value;
        const severity = els.severity.value;
        const extent = els.extent.value;

        // Submit to database:
        await db.run(`
            INSERT INTO markers (id, pdfPath, pageNum, x, y, imagePath, description, severity, extent) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [id, pdfFileName, pageNum, x, y, imagePath, description, severity, extent]
        
        );

        // FOR DEVELOPMENT ONLY: console log to check database contents added correctly:
        const result = await db.query('SELECT * FROM markers');
        console.log('Table contents:', result);

        // *******************
        // pdfPath and imagePath will be relative to pdf and image folder locations (defined in app context).
        // IT MAY BE THAT MY PROGRAM ASSUMES ALL IS AT TOP LEVEL OF THE FOLDER (i.e. I SAY pdfPath, but I actually MEAN pdfFileName and assume it's directly in pdfFolder)
        
        setClickedId(null);
        setIsOpen(false);
    }

    return(
        <Modal isOpen={isOpen} onRequestClose={onRequestClose}>
            
            <form ref={formRef} onSubmit={handleSubmit}>

                <label htmlFor="imagePath">Image:</label>
                <input id="imagePath" name="imagePath" type="text" /> {/* will change to image input later */}

                {/* Brief description of defect, e.g. "2mm horizontal crack to internal wall": */}
                <label htmlFor="description">Description:</label>
                <input id="description" name="description" type="text" />

                {/* Severity of defect, 0-5 (0 being no defect; 5 being failure): */}
                <label htmlFor="severity">Severity:</label>
                <input id="severity" name="severity" type="number" />

                {/* Extent of defect, 0-5 (0 being no defect; 5 being full extent of element): */}
                <label htmlFor="extent">Extent:</label>
                <input id="extent" name="extent" type="number" />

                <button type="submit">Submit</button>
                <button type="button" onClick={onRequestClose}>Cancel</button>

            </form>

        </Modal>
    );
}


// ---- ADD & SHOW MARKERS ----

// Add click location to clickLocations (context variable) based on user's click and current zoom and scroll:
// Has knock-on effect of visibly adding a marker at that location.
// NB clickLocations and setClickLocations comes from useContext(PlanContext), but cannot be called here as this is not a React component.
// NOTE: assumes event target is the canvas itself (or an overlain element with same dimensions & position as canvas)
async function addMarker(e, mapping, drawnWindow, pageNum, clickLocations, setClickLocations, setClickedId) {

    const id = crypto.randomUUID(); // ID for marker to add (will always be unique)

    const canvas = e.target; // assuming event clicks on the canvas (or an overlain element with same dimensions & position as canvas)
    const clientX = e.clientX; // from left of visible viewport rightwards in CSS px
    const clientY = e.clientY; // from top of visible viewport downwards in CSS px
    const {canvasX, canvasY} = mapEventToCanvas(canvas, clientX, clientY);

    if (!(canvasX >= drawnWindow.leftX && canvasX <= drawnWindow.rightX && 
        canvasY >= drawnWindow.topY && canvasY <= drawnWindow.bottomY)) {
        return; // do nothing if click is outside drawn window of canvas
    }

    // Convert canvas coordinates to PDF coordinates (based on scale):
    const {pdfX, pdfY} = mapCanvasToPDF(canvasX, canvasY, mapping); // from top left in true-size pt
    
    // Add to clickLocations:
    const newClickLocation = { id:id, pageNum: pageNum, x: pdfX, y: pdfY };
    setClickLocations([...clickLocations, newClickLocation]);
    // ^ This will automatically cause marker to be added to canvas, because clickLocations and is a dep for MarkerLayer's useEffect block (which calls drawMarkers below)
    setClickedId(id);
    // ^ This will trigger re-render of form modal (because clickedId is a dep for FormModal's useEffect block), so form for extra info will pop up, and the new click location plus inputted data can all be sent to database in one go when form is submitted
    // Note, if form modal is closed without submitting (database not updated), it will purposely remove clickLocations' last item, so the just-added marker will be removed from canvas. This way, markers genuinely reflect what is in database.

};

// Set marker locations for all stored click locations based on current zoom and scroll:
// This function is only called in the MarkerLayer component, which defines state with markerLocations and setMarkerLocations.
// When this function sets updated marker locations, the MarkerLayer component is forced to re-run, rendering up to date markers.
export function drawMarkers(canvas, mapping, pageNum, clickLocations, setMarkerLocations) {
    const newMarkerLocations = [];
    if (clickLocations.length > 0) {
        clickLocations.forEach(loc => {
            if (loc.pageNum == pageNum) { // clickLocations is for entire PDF, so have to filter to relevant page
                const id = loc.id; // Unique ID from database
                // Convert PDF coordinates back to canvas coordinates (from top left, in CSS px):
                const {canvasX, canvasY} = mapPDFToCanvas(loc.x, loc.y, mapping); // function from markers.jsx
                // Create HTML element for marker only if within canvas:
                if (canvasX >=0 && canvasX <= canvas.clientWidth && canvasY >= 0 && canvasY <= canvas.clientHeight) {
                    newMarkerLocations.push({ id, canvasX, canvasY });
                }
            }
        });
    }
    setMarkerLocations(newMarkerLocations);
}


// ---- HELPER FUNCTIONS FOR COORDINATE CONVERSION ----

export function mapCanvasToPDF(canvasX, canvasY, mapping) {
    const pdfX = mapping.xOffset + (canvasX * mapping.scale); // from left rightwards in true-size pt
    const pdfY = mapping.yOffset + (canvasY * mapping.scale); // from top downwards in true-size pt
    return {pdfX, pdfY};
}

export function mapPDFToCanvas(pdfX, pdfY, mapping) {
    const canvasX = (pdfX - mapping.xOffset) / mapping.scale; // from left rightwards in px
    const canvasY = (pdfY - mapping.yOffset) / mapping.scale; // top downwards in px
    return {canvasX, canvasY};
}

export function mapEventToCanvas(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = (clientX - rect.left); // from left of canvas rightwards in CSS px
    const canvasY = (clientY - rect.top); // from top of canvas downwards in CSS px
    return {canvasX, canvasY};
}