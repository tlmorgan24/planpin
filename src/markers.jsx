import { forwardRef, useContext, useState, useEffect, useRef } from "react";
import { PlanContext } from "./pages/plan";
import { AppContext } from "./App";
import { DbContext } from "./main";
import Modal from 'react-modal';
import { captureImage, saveImage, getImageUri } from "./image-setup";

// ---- MARKER COMPONENT ----

// Creates marker at specified canvas location (where canvasX and canvasY are from top left of canvas in CS px):
// This marker will be used to show the user's click locations on the plan.
function Marker({ id, canvasX, canvasY, setClickedId}) {
    // CSS incorporated here rather than in .css file, due to dynamic nature of positioning and the fact that it is dependent on width & height.
    const width = 10; // px
    const height = 10; // px

    function handleClick() {
        setClickedId(id);
        // Note: stop propagation not necessary, as MarkerLayer already uses condition in its click handler that the target must be MarkerLayer itself. So, clicks on Markers won't cause an extra marker to be added
    }

    return(
        <div 
            id={id} // marker ID as stored in database
            onClick={handleClick}
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
    const [clickedId, setClickedId] = useState(null); // to track which marker was just clicked or added (will be null on first render, even if there are markers already stored in database)

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
    }

    return(                        
        <div ref={markerLayerRef} className="markerLayer" onClick={handleClick}>
            {/* Render markers according to latest markerLocations: */}
            {markerLocations.map(({ id, canvasX, canvasY }) => (
                <Marker key={id} id={id} canvasX={canvasX} canvasY={canvasY} setClickedId={setClickedId} />
            ))}
            {/* Form modal to pop up when user wants to add a marker: */}
            <FormModal clickedId={clickedId} setClickedId={setClickedId} clickLocations={clickLocations} setClickLocations={setClickLocations} pdfFileName={pdfFileName} db={db} />
        </div>
    );

});


// ---- MARKER FORM ----

// When user adds a marker (see addMarker function), this modal form will pop up to allow them to input additional details about the defect:

function FormModal({ clickedId, setClickedId, clickLocations, setClickLocations, pdfFileName, db }) {

    /* 
    NOTE: the database's pdfPath and imagePath are currently relative to app's pdf and image folder locations 
    (defined in app context). They are not full file paths. PDFs and images must be in the respective folders.
    Currently, the app is set up to save all PDFs and images at the top level of their respective folders.
    */

    const {saveDir, imageFolder} = useContext(AppContext);
    const [imageUris, setImageUris] = useState([]); // will be array of paths for each EXISTING image associated with the marker (as taken from database; will remain empty if marker is new)
    const [newImages, setNewImages] = useState([]); // will be array of image objects for each NEWLY ADDED image to the marker.

    // Form values (if marker already exists in database, will be set to existing database values in below useEffect):
    const [formValues, setFormValues] = useState({description: null, severity: null, extent: null});

    const [isOpen, setIsOpen] = useState(false);
    const formRef = useRef(null);

    // Open form on change of clickedId (meaning user has just added a marker or clicked on an existing marker):
    useEffect(() => {
        async function func() {

            if (!clickedId) return; // on first render (when user has not yet clicked), do not open form
            /* 
            Also note, clickedId will be reset to null whenever form is closed/submitted (see other functions). This way,
            the user will be able to click again on the just-added marker, and the useEffect will still register
            a new clickedId, and form will open again. Even though the reset to null, itself, is a change in 
            clickedId and causes this effect to run, it will not cause form to open thanks to the above null check 
            on clickedId.
            */

            setIsOpen(true);

            // Get current data to set form values to (if marker already exists in database):
            const markersResult = await db.query('SELECT description, severity, extent FROM markers WHERE id = ?', [clickedId]);
            const row = markersResult.values[0]; // query should return one row (if marker exists) or zero rows (if no marker exists). If latter, row will return undefined
            if (!row) return; // new marker; no database data yet; will not update default form inputs or attempt to get images below
            const existingValues = {
                description: row.description,
                severity: row.severity,
                extent: row.extent,
            };
            setFormValues(existingValues);

            // Get already-saved image paths for this marker (won't be any if new marker, but may be 1 or more if re-selecting existing marker):
            const imagesResult = await db.query('SELECT imagePath FROM images WHERE markerId = ?', [clickedId]);
            if (imagesResult.values.length === 0) return; // no images yet
            const imagePaths = imagesResult.values.map(row => row['imagePath']);
            // Below commented-out line would not work, as await not allowed here. Using promise as below gets around this.
            // const imageUris = imagePaths.map(imagePath => await getImageUri(imagePath, imageFolder, saveDir))
            const imageUris = await Promise.all(imagePaths.map(async imagePath => {
                return await getImageUri(imagePath, imageFolder, saveDir);
            }));
            setImageUris(imageUris);

        }
        func();
    }, [clickedId])
    
    // If user requests close without pressing submit, close form and without submitting to database and erase the marker just added:
    async function onRequestClose() {

        // Check if marker already exists in database (if it does, we will not erase it from clickLocations, as it is not a just-added marker; user was instead clicking on an existing marker):
        const result = await db.query(
            'SELECT EXISTS ( SELECT 1 FROM markers WHERE id = ? )', 
            [clickedId]
        );
        const markerExists = Object.values(result.values[0])[0] === 1;
        if (!markerExists) {
            setClickLocations(clickLocations.filter(loc => loc.id !== clickedId)); // erase marker just added (could just pop the last item, but we're doing by ID to be safe, just in case last item somehow isn't the just-clicked marker)
        }

        setClickedId(null);
        setNewImages([]);
        setImageUris([]);
        setFormValues({description: null, severity: null, extent: null});
        setIsOpen(false);

    }

    async function onAddPhoto() {
        const image = await captureImage(); // image object is as saved from Camera.getPhoto
        setNewImages([...newImages, image]); // add new image to newImages array
    }

    // When user presses submit, submit to database and close form:
    async function handleSubmit(e) {
        
        e.preventDefault();

        const clickLocation = clickLocations.find(loc => loc.id === clickedId);
        const pageNum = clickLocation.pageNum;
        const x = clickLocation.x;
        const y = clickLocation.y;
        
        const description = formValues.description;
        const severity = formValues.severity;
        const extent = formValues.extent;

        // Check if marker already exists in database:
        const result = await db.query(
            'SELECT EXISTS ( SELECT 1 FROM markers WHERE id = ? )', 
            [clickedId]
        );
        const markerExists = Object.values(result.values[0])[0] === 1;

        if (markerExists) {
            // Edit existing entry in markers table of database:
            await db.run(`
                UPDATE markers 
                SET description = ?, severity = ?, extent = ? 
                WHERE id = ?
                `,
                [description, severity, extent, clickedId]
            );
        }

        else {
            // Create new entry in markers table of database:
            await db.run(`
                INSERT INTO markers (id, pdfPath, pageNum, x, y, description, severity, extent) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [clickedId, pdfFileName, pageNum, x, y, description, severity, extent]
            );
        }

        // NOTE: I CURRENTLY DO NOT HAVE A WAY TO DELETE EXISTING PHOTOS - WILL NEED TO ADD THIS FUNCTIONALITY

        // Save images and submit paths to images table of database (this must come after submission to markers table, as images table has foreign key constraint on markerId; i.e. marker must already exist):
        for (const image of newImages) {
            const imagePath = await saveImage(image, imageFolder, saveDir);
            // Submit to images table of database:
            await db.run(`
                INSERT INTO images (imagePath, markerId) 
                VALUES (?, ?)
                `,
                [imagePath, clickedId]
            );
        }

        setClickedId(null);
        setNewImages([]);
        setImageUris([]);
        setFormValues({description: null, severity: null, extent: null});
        setIsOpen(false);
    }

    function handleFormChange(event) {
        const { name, value } = event.target;
        setFormValues((prevState) => ({ ...prevState, [name]: value }));
    };

    return(
        <Modal className="modal" isOpen={isOpen} onRequestClose={onRequestClose}>
            
            <form onSubmit={handleSubmit}>

                <button type="button" onClick={onAddPhoto}>Add image</button>
                <br/>

                {/* Brief description of defect, e.g. "2mm horizontal crack to internal wall": */}
                <div class="formItem">
                    <label htmlFor="description">Description</label>
                    <input id="description" name="description" type="text" value={formValues.description} onChange={handleFormChange} />
                </div>
                
                {/* Severity of defect, 0-5 (0 being no defect; 5 being failure): */}
                <div class="formItem">
                    <label htmlFor="severity">Severity</label>
                    <input id="severity" name="severity" type="number" value={formValues.severity} onChange={handleFormChange} />
                </div>
                
                {/* Extent of defect, 0-5 (0 being no defect; 5 being full extent of element): */}
                <div class="formItem">
                    <label htmlFor="extent">Extent</label>
                    <input id="extent" name="extent" type="number" value={formValues.extent} onChange={handleFormChange} />
                </div>

                {/* Existing images (in database) associated with defect: */}
                {imageUris.map((imageUri) => (
                    <img className="defectImage" src={imageUri} />
                ))}

                {/* Newly-added images to defect (not yet in database, but having temporary paths): */}
                {newImages.map((image) => (
                    <img src={image.webPath} style={{ maxWidth: '100%', height: 'auto' }} />
                ))}

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
    // ^ This will trigger re-render of form modal (because clickedId is a dep for FormModal's useEffect block), so form for extra info will pop up, and the just-clicked location plus inputted data can all be sent to database in one go when form is submitted
    // Note, if form modal is closed without submitting (database not updated), it will purposely remove the item of clickLocations where id=clickedId IF this id is not in database (if it is in database, user is clicking on an existing marker, so we don't want to erase it just because they cancelled). This way, markers genuinely reflect what is in database.

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