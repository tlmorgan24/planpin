import { forwardRef, useContext, useState, useEffect, useRef } from "react";
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { PlanContext } from "./pages/Plan";
import { DbContext, UserContext } from "./main";
import { AppContext } from "./App";
import Modal from 'react-modal';
import { captureImage, saveImage, getImageUri, getSupabaseImageUri } from "./image-setup";
import Loading from "./pages/Loading";
import ConfirmModal from "./ConfirmModal";
import { ManageCategoriesButton } from "./categories";

// ---- MARKER COMPONENT ----

// Creates marker at specified canvas location (where canvasX and canvasY are from top left of canvas in CS px):
// This marker will be used to show the user's click locations on the plan.
// category_name not yet used, but the infrastructure to provide it to this component is in place, so can add feature to e.g. show category name on hover.
function Marker({ id, canvasX, canvasY, color, category_name, setClickedId }) {
    
    // CSS incorporated here rather than in .css file, due to dynamic nature of positioning and the fact that it is dependent on width & height.
    const width = 10; // px
    const height = 10; // px

    function handleClick() {
        setClickedId(id);
        // Note: stop propagation not necessary, as MarkerLayer already uses condition in its click handler that the target must be MarkerLayer itself. So, clicks on Markers won't cause an extra marker to be added
    }

    return(
        <div
            className="marker"
            id={id} // marker ID as stored in database
            onClick={handleClick}
            style={{
                position: 'absolute', // such that left and top positions will be relative to parent (canvas), assuming that parent has non-static position.
                width: `${width}px`,
                height: `${height}px`,
                left: `${canvasX - width/2}px`,
                top: `${canvasY - height/2}px`,
                backgroundColor: color || 'red', // if color is null, default to red
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
    const {clickLocations, setClickLocations, planId} = useContext(PlanContext);
    const {db, supabase} = useContext(DbContext);

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
            await addMarker(e, mapping, drawnWindow, pageNum, setClickLocations, setClickedId);
            // ^ Thanks to the if statement, we ensure e.target is the MarkerLayer itself. 
            // This is important, as addMarker assumes e.target has same location & dimensions as canvas.
            // As per our CSS, MarkerLayer does have same location & dimensions as canvas. 
        }
    }

    return(                        
        <div ref={markerLayerRef} className="marker-layer" onClick={handleClick}>
            {/* Render markers according to latest markerLocations: */}
            {markerLocations.map(({ id, canvasX, canvasY, color, category_name }) => (
                <Marker key={id} id={id} canvasX={canvasX} canvasY={canvasY} color={color} category_name={category_name} setClickedId={setClickedId} />
            ))}
            {/* Marker form modal to pop up when user wants to add a marker: */}
            <FormModal clickedId={clickedId} setClickedId={setClickedId} clickLocations={clickLocations} setClickLocations={setClickLocations} planId={planId} db={db} supabase={supabase} />
            {/* Category form modal to pop up when user wants to add/edit a category: */}

        </div>
    );

});


// ---- MARKER FORM ----

// When user adds a marker (see addMarker function) or clicks on existing marker, this modal form will pop up to allow them to input additional details about the item:

function FormModal({ clickedId, setClickedId, clickLocations, setClickLocations, planId, db, supabase }) {

    /* 
    NOTE: the database only stores pdf_filename and image_filename (not full file path), as these are relative to user's pdf and image folder locations 
    (defined in app context). Currently, the app is set up to save all PDFs and images at the top level of the user's pdf & image folders.
    */

    const {saveDir, imageFolder} = useContext(UserContext);
    const {categoryOptionsData} = useContext(AppContext); // options for category data to assign to marker (populated based off categories table of database for this user). Array of objects, each with an id, category_name and color property

    const [imageIds, setImageIds] = useState([]); // will be array of file names for each EXISTING image associated with the marker (as taken from database; will remain empty if marker is new)
    const [imageUris, setImageUris] = useState([]); // will be array of URIs for each EXISTING image associated with the marker (will remain empty if marker is new), in same order as imageFileNames
    const [newImages, setNewImages] = useState([]); // will be array of image objects for each NEWLY ADDED image to the marker.
    const [markerInDb, setMarkerInDb] = useState(false); // will be whether or not marker is already in the database (true if existing marker user has clicked on; false if new marker user is adding)
    
    const [loading, setLoading] = useState(false); // to allow modal to show a loading icon when this is set to true (note we opt for manual loading instead of just a toast, so that we can prevent the user seeing & interacting with the form modal while it is loading/submitting)
    const [imagesToLoad, setImagesToLoad] = useState(0); // number of images remaining to load before we can set loading to false (will be set to number of imageUris)

    const textAreaRef = useRef(null); // HTML textarea element used for description (we have to useRef to enable auto-resizing as part of handleTextAreaChange below)

    // Form values (if marker already exists in database, will be set to existing database values in below useEffect):
    const [formValues, setFormValues] = useState({reference: '', categoryId: '', description: '', severity: '', extent: ''});

    const [isOpen, setIsOpen] = useState(false); // whether this modal is open or not

    // Open form on change of clickedId (meaning user has just added a marker or clicked on an existing marker):
    useEffect(() => {
        async function func() {

            if (!clickedId || imageFolder === undefined) return; // on first render (when user has not yet clicked), do not open form
            /* 
            Also note, clickedId will be reset to null whenever form is closed/submitted (see other functions). This way,
            the user will be able to click again on the just-added marker, and the useEffect will still register
            a new clickedId, and form will open again. Even though the reset to null, itself, is a change in 
            clickedId and causes this effect to run, it will not cause form to open thanks to the above null check 
            on clickedId.
            */

            setLoading(true);
            setIsOpen(true);

            const platform = Capacitor.getPlatform();

            // Get current data to set form values to (if marker already exists in database):

            let row = null;
            let maxRefNo = 0; // highest existing reference number, so can pre-populate reference input with...
            let prepopulatedRefNo = 0; // ...next-highest integer

            if (platform !== 'web') { // on mobile

                // Get maximum reference for this plan (including of all deleted markers, to prevent misleading duplicates):
                const maxResult = await db.query(
                    `
                        SELECT MAX(reference) AS max_reference
                        FROM markers
                        WHERE plan_id = ?
                    `,
                    [planId]
                );
                if (maxResult.values.length > 0) {
                    maxRefNo = maxResult.values[0]['max_reference'];
                }

                // Get form data:
                const markersResult = await db.query(
                    `
                        SELECT reference, category_id, description, severity, extent 
                        FROM markers 
                        WHERE id = ? 
                            AND deleted_at IS NULL
                    `, 
                    [clickedId]
                );
                if (markersResult.values.length !== 1) { // new marker; no database data yet; will not update default form inputs or attempt to get images below
                    setMarkerInDb(false);
                    setLoading(false);
                    // Only other thing we need to set before returning is the default reference number for new marker:
                    prepopulatedRefNo = Math.floor(maxRefNo) + 1;
                    setFormValues(prev => ({...prev, reference: prepopulatedRefNo}));
                    return;
                }
                row = markersResult.values[0]; // query should return one row (if marker exists) or zero rows (if no marker exists). If latter, row will return undefined

            }

            else { // on web

                // Get maximum reference for this plan (including of all deleted markers, to prevent misleading duplicates):
                const { maxData, maxError } = await supabase
                    .from('user_markers')
                    .select('reference')
                    .eq('plan_id', planId)
                    .order('reference', { ascending: false }) // no max function in supabase client, so must order descending and get first result
                    .limit(1);
                if (maxError) console.error('Error: ', maxError);
                if (maxData && maxData.length > 0) {
                    maxRefNo = maxData[0]['max_reference'];
                }

                // Get form data:
                const { data, error } = await supabase
                    .from('user_markers')
                    .select('reference, category_id, description, severity, extent')
                    .eq('id', clickedId)
                    .is('deleted_at', null);
                if (error) console.error('Error: ', error);
                if (data.length !== 1) { // new marker; no database data yet; will not update default form inputs or attempt to get images below
                    setMarkerInDb(false);
                    setLoading(false);
                    // Only other thing we need to set before returning is the default reference number for new marker:
                    prepopulatedRefNo = Math.floor(maxRefNo) + 1;
                    setFormValues(prev => ({...prev, reference: prepopulatedRefNo}));
                    return;
                }
                row = data[0];

            }

            // Here, we make sure that, if existing values are null, they are set to empty strings in the form to keep React happy
            const existingValues = {
                reference: row.reference || prepopulatedRefNo, // note we allow user to choose a different reference and conserve this; prepopulatedRefNo is only a default value if ref unspecified
                categoryId: row.category_id ?? '',
                description: row.description ?? '',
                severity: row.severity ?? '',
                extent: row.extent ?? '',
            };
            setFormValues(existingValues);

            // Get already-saved images for this marker (may be 0, 1 or more):

            let imagesResultRows = [];
            if (platform !== 'web') { // on mobile
                const imagesResult = await db.query(
                    `
                        SELECT id, image_filename 
                        FROM images 
                        WHERE marker_id = ? 
                            AND deleted_at IS NULL
                    `, 
                    [clickedId]
                );
                imagesResultRows = imagesResult.values;
            }
            else { // on web
                const { data, error } = await supabase
                    .from('user_images')
                    .select('id, image_filename')
                    .eq('marker_id', clickedId)
                    .is('deleted_at', null);
                if (error) console.error('Error: ', error);
                imagesResultRows = data;
            }

            const imageIds = imagesResultRows.map(row => row['id']); // if no images, imageIds will be empty array, no problem
            const imageFileNames = imagesResultRows.map(row => row['image_filename']); // if no images, imageFileNames will be empty array, no problem
            
            // Below commented-out line would not work, as await not allowed here. Using promise as below gets around this.
            //const imageUris = imageFileNames.map(imageFileName => await getImageUri(imageFileName, imageFolder, saveDir))
            let imageUris = [];
            if (platform !== 'web') { // on mobile
                imageUris = await Promise.all(imageFileNames.map(async imageFileName => {
                    return await getImageUri(imageFileName, imageFolder, saveDir);
                }));
            }
            else { // on web
                imageUris = await Promise.all(imageFileNames.map(async imageFileName => {
                    return await getSupabaseImageUri(supabase, imageFileName, imageFolder);
                }));
            }
            
            setImageIds(imageIds);
            setImageUris(imageUris);
            setMarkerInDb(true); // marker must exist in database, as if not, we would have returned from this function earlier

            // Instead of directly setting loading to false, we want to check all images have actually been rendered (not just the URIs fetched):
            
            if (imageUris.length > 0) {
                setImagesToLoad(imageUris.length); // initially, need to load all these images; as the images load, imagesToLoad will be decremented by handleImageLoaded, eventually setting loading to false
            } else {
                setLoading(false); // if no images, nothing more to load
            }

        }
        func();
    }, [clickedId]);

    function handleImageLoaded() {
        setImagesToLoad(prev => {
            if (prev === 1) {
                setLoading(false);
            }
            return prev - 1;
        });
    }

    // Whenever we close modal, we want to make sure to reset states so that future clicks will start fresh:
    function closeModal() {
        setClickedId(null);
        setNewImages([]);
        setImageUris([]);
        setMarkerInDb(false);
        setFormValues({reference: '', categoryId: '', description: '', severity: '', extent: ''});
        setIsOpen(false); // finally, close the modal
        setLoading(true); // so next modal will open with loading screen until its effect finishes
    }
    
    // If user requests close without pressing submit, close form and without submitting to database and erase the marker just added:
    async function onRequestClose() {

        if (!markerInDb) {
            setClickLocations(prev => prev.filter(loc => loc.id !== clickedId)); // erase marker just added (could just pop the last item, but we're doing by ID to be safe, just in case last item somehow isn't the just-clicked marker)
        }
        closeModal();

    }

    async function onAddPhoto() {
        const image = await captureImage(); // image object is as saved from Camera.getPhoto
        toast.loading("Adding image...", {id: 'loading'}); // this toast must come AFTER captureImage, because otherwise, if user cancels image capture, loading toast will persist
        setNewImages(prev => [...prev, image]); // add new image to newImages array
        toast.success("Image added", {id: 'loading'});
    }

    // When user presses submit, submit to database and close form:
    async function handleSubmit(e) {
        
        e.preventDefault();

        if (imageFolder === undefined) return;
        setLoading(true);
 
        const clickLocation = clickLocations.find(loc => loc.id === clickedId);
        const pageNum = clickLocation.pageNum;
        const x = clickLocation.x;
        const y = clickLocation.y;
        
        const reference = formValues.reference; // if form input is empty string, would not be able to submit to database, as number is expected (and we have NOT NULL constraint anyway). But no worries, as we ensure "required" in the HTML input below, so user can't submit empty string
        const categoryId = formValues.categoryId === '' ? null : formValues.categoryId; // if form input is empty string, cannot submit to database, as UUID is expected, and empty string is not a UUID (should be explicitly made null instead)
        const description = formValues.description;
        const severity = formValues.severity === '' ? null : formValues.severity; // if form input is empty string, cannot submit to database, as number is expected (should be made null instead)
        const extent = formValues.extent === '' ? null : formValues.extent; // if form input is empty string, cannot submit to database, as number is expected (should be made null instead)

        const platform = Capacitor.getPlatform();

        // Create new, or edit existing, marker in database (for supabase, can achieve simply with "upsert" method)

        if (platform !== 'web') { // on mobile (no easy "upsert", best to do two separate statements based on condition)

            if (markerInDb) {
                // Edit existing entry in markers table of database:
                await db.run(
                    `
                        UPDATE markers 
                        SET reference = ?, category_id = ?, description = ?, severity = ?, extent = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                        WHERE id = ?
                    `,
                    [reference, categoryId, description, severity, extent, clickedId]
                );
            }
            else {
                // Create new entry in markers table of database:
                await db.run(
                    `
                        INSERT INTO markers (id, plan_id, page_number, x, y, reference, category_id, description, severity, extent, created_at, updated_at) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    `,
                    [clickedId, planId, pageNum, x, y, reference, categoryId, description, severity, extent]
                );
            }

        }

        else { // on web (easy "upsert", especially considering we have set up defaults to NOW for created_at and updated_at in Supabase)

            const {error} = await supabase
                .from('markers')
                .upsert(
                    {
                        id: clickedId,
                        plan_id: planId,
                        page_number: pageNum,
                        x,
                        y,
                        reference,
                        category_id: categoryId,
                        description,
                        severity,
                        extent,
                        updated_at: new Date().toISOString(), // set to NOW
                        // Note, no need to specify created_at, as this will be set to NOW by default for new records, and if we were to set it NOW here, it would overwrite existing created_at if already exists (which we don't want).
                    }, 
                    { onConflict: 'id' }
                );
            if (error) console.error("Error: ", error);

        }

        // Save images and submit file names to images table of database (this must come after submission to markers table, as images table has foreign key constraint on markerId; i.e. marker must already exist):
        for (const image of newImages) {

            const imageId = crypto.randomUUID(); // ID for image to add (will always be unique)
            const imageFileName = await saveImage(image, imageFolder, saveDir, supabase);
            // Submit to images table of database:
            if (platform !== 'web') {
                await db.run(
                    `
                        INSERT INTO images (id, marker_id, image_filename, created_at, updated_at) 
                        VALUES (?, ?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    `,
                    [imageId, clickedId, imageFileName]
                );
            }
            else { // on web
                await supabase
                    .from('images')
                    .insert(
                        {
                            id: imageId,
                            marker_id: clickedId,
                            image_filename: imageFileName,
                            // no need for created_at and updated_at, as supabase makes these default to now
                        }
                    ); 
            }

        }

        // Update clickLocations with new information according to category assigned to the marker:
        /* 
        KNOWN MINOR BUG: IF USER EDITS THE PROPERTIES OF A CATEGORY AND SUBMITS THE CATEGORY MODAL, 
        BUT THEN CANCELS THIS FORM MODAL, THE UPDATED CATEGORY PROPERTIES PERSIST, BUT THE CHANGES ARE
        NOT REFLECTED IN CLICKLOCATIONS (e.g. colour does not update). I think this is an acceptable bug for now
        (all you have to do is go Home and back onto the plan, and the colours update).

        IF I WANT TO FIX THIS BUG, I should do it by updating (all) clickLocations within the CategoryModal submission. 
        Then, changes like a new colour are reflected regardless of whether this marker FormModal is submitted or cancelled.
        */

        let color = null;
        let category_name = null;

        if (categoryId) {

            if (platform !== 'web') { // on mobile
                const categoriesResult = await db.query(
                    `
                        SELECT category_name, color
                        FROM categories
                        WHERE id = ?
                    `, 
                    [categoryId]
                );
                color = categoriesResult.values[0]['color']; 
                category_name = categoriesResult.values[0]['category_name']
            }

            else { // on web
                const { data, error } = await supabase
                    .from('user_categories')
                    .select('category_name, color')
                    .eq('id', categoryId)
                    .single(); // exactly one result expected
                if (error) console.error('Error: ', error);
                color = data['color']; 
                category_name = data['category_name'];
            }
        
        }

        const updatedClickLocations = clickLocations.map(loc => 
            loc.id === clickedId ? { ...loc, color, category_name } : loc
        );
        setClickLocations(updatedClickLocations);

        toast.success("Submitted!");
        closeModal();
        // we can leave loading=true, so that next time modal is opened, will open with loading screen until useEffect finishes

    }

    function handleFormChange(event) {
        const { name, value } = event.target;
        setFormValues((prevState) => ({ ...prevState, [name]: value }));
    };

    // Have to manually resize text area to enable dynamic size change based on length of user input:
    function handleTextAreaChange(event) {
        if (textAreaRef.current) {
            // Assuming 2.5rem is the desired minimum height of textarea (at time of writing, this matches the height of the normal input elements)
            textAreaRef.current.style.height = '2.5rem';
            textAreaRef.current.style.height = `max(${textAreaRef.current.scrollHeight}px, 2.5rem)`; // Adjust height to content
          }
        handleFormChange(event);
    };

    return(
        <Modal 
            className={{base: 'side-modal', afterOpen: 'after-open', beforeClose: 'before-close'}} 
            closeTimeoutMS={300} 
            isOpen={isOpen} 
            onRequestClose={onRequestClose}
            style={{
                overlay: { zIndex: 1000 },
                content: { zIndex: 1001 }
            }}
        >

            {/* 
            Note, we are giving this modal a high z-index (1000), so it stacks above generic page content. This will be our
            LOWEST-STACKED modal. Other modals we want to open at the same time and stack on top (e.g. categories manager)
            will have higher z-index (1100, 1200, etc.).
            
            Note, we are giving it the class 'side-modal' in all cases, and a second class 'show' if modal is open.
            This allows us to create a smooth CSS transition to pop out the modal.

            If loading, we show the loading screen and set the form to hidden. By setting it to hidden,
            the images will still load and onLoad triggers will fire, allowing the loading screen to eventually 
            go away once all images are loaded. We also need to set position to fixed and off screen, so won't take up 
            space in modal until all ready. If we were to set display to none, the triggers would never fire, and
            the loading screen would never go away. If we were to simply set loading to false at the end of the useEffect 
            and not bother with onLoad triggers, the images would come in one by one, with their delete buttons appearing
            before they do, and it looks quite messy.
            */}

            { loading ? <Loading /> : null }

            <form onSubmit={handleSubmit} style={ loading ? {position: 'fixed', top: '200vh', visibility: 'hidden'} : {} } > {/* properties left as defaults defined in index.css if not loading */}

                <h2>{`Item #${formValues.reference}`}</h2>

                {/* Item reference, e.g. "123" (note we make the input required, matching database constraint of NOT NULL): */}
                <div className="form-item">
                    <label htmlFor="reference">Reference</label>
                    <input id="reference" name="reference" type="number" min="0" required value={formValues.reference} onChange={handleFormChange} />
                </div>

                {/* Item category, e.g. "Internal walls" (NB, I use categoryId instead of category-id for attributes, even though against HTML convention, so it matches the formValues state and handleFormChange works properly): */}
                <div className="form-item">
                    <label htmlFor="categoryId">Category</label>
                    <select id="categoryId" name="categoryId" value={formValues.categoryId} onChange={handleFormChange} >
                        <option value="">--Choose a category--</option>
                        {categoryOptionsData.map(row => (
                            <option key={row['id']} value={row['id']}>{row['category_name']}</option> // ensures IDs are stored as form values, but category NAMES are what are actually shown to user
                        ))}
                    </select>
                    <ManageCategoriesButton />
                </div>

                {/* Brief description of item, e.g. "2mm horizontal crack to internal wall" (uses textarea instead of input, to allow spilling over multiple lines): */}
                <div className="form-item">
                    <label htmlFor="description">Description</label>
                    <textarea ref={textAreaRef} id="description" name="description" value={formValues.description} onChange={handleTextAreaChange} />
                </div>
                
                {/* Severity of item, 0-5 (0 being no defect; 5 being failure): */}
                <div className="form-item">
                    <label htmlFor="severity">Severity</label>
                    <input id="severity" name="severity" type="number" value={formValues.severity} onChange={handleFormChange} />
                </div>
                
                {/* Extent of item, 0-5 (0 being no defect; 5 being full extent of element): */}
                <div className="form-item">
                    <label htmlFor="extent">Extent</label>
                    <input id="extent" name="extent" type="number" value={formValues.extent} onChange={handleFormChange} />
                </div>

                {/* Existing images (in database) associated with item: */}
                {imageUris.map((imageUri, i) => (
                <div className="item-image-container" key={i} >
                    <img src={imageUri} onLoad={handleImageLoaded} />
                    <ImageDeleteButton index={i} imageIds={imageIds} setImageIds={setImageIds} setImageUris={setImageUris} />
                </div>
                ))}

                {/* Newly-added images to item (not yet in database, but having temporary paths): */}
                {newImages.map((image, i) => (
                <div className="item-image-container" key={i} >
                    <img src={image.webPath} />
                    <NewImageDeleteButton index={i} setNewImages={setNewImages}/>
                </div>
                ))}

                <div className="big-buttons-container">
                    <button type="button" className="accented" onClick={onAddPhoto}>Add image</button>
                    <button type="submit" className="accented">Submit</button>
                    <button type="button" onClick={onRequestClose}>Cancel</button>
                    <MarkerDeleteButton markerId={clickedId} markerInDb={markerInDb} setClickLocations={setClickLocations} closeModal={closeModal} />
                </div>

            </form>
            
        </Modal>
    );

}

// Button to delete image (identified by index of imageIds and imageUris array):
function ImageDeleteButton({index, imageIds, setImageIds, setImageUris}) {

    const {db, supabase} = useContext(DbContext);
    const [showConfirm, setShowConfirm] = useState(false); // to allow confirmation modal to be shown before deleting

    async function deleteImage() {

        setShowConfirm(false);
        toast.loading("Deleting image...", {id: 'deleting'});

        const imageId = imageIds[index];

        if (Capacitor.getPlatform() !== 'web') { // on mobile
            await db.run(
                `
                    UPDATE images 
                    SET deleted_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
                        updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE id = ?
                `, 
                [imageId]
            );
        }
        else { // on web
            const {error} = await supabase
                .from('images')
                .update(
                    {
                        deleted_at: new Date().toISOString(), // set to NOW
                        updated_at: new Date().toISOString(), // set to NOW
                    }
                )
                .eq('id', imageId);
            if (error) console.error("Error: ", error);
        }
        
        // Remove image from relevant states (triggering re-render of images):
        setImageIds(prev => prev.filter((_, i) => i !== index)); // sets imageIds to new array with same items as previous array, except without item at specified index
        setImageUris(prev => prev.filter((_, i) => i !== index));

        toast.success("Image deleted", {id: 'deleting'});

    }

    function onRequestDelete() {
        setShowConfirm(true); // when user clicks "Delete" button, show confirmation modal
    }
    function onCancelDelete() {
        setShowConfirm(false);
    }

    return(
        <>
            <button type="button" className="bad" onClick={onRequestDelete}>Delete image</button>
            <ConfirmModal isOpen={showConfirm} onConfirm={deleteImage} onCancel={onCancelDelete}/>
        </>
    );

}

// Button to delete newly-added image which isn't yet in database (identified by index of newImages array):
function NewImageDeleteButton({index, setNewImages}) {

    async function handleClick() {
        toast.loading("Removing image...", {id: 'deleting'});
        // Remove image from newImages state (triggering re-render of images):
        setNewImages(prev => prev.filter((_, i) => i !== index)); // sets newImages to new array with same items as previous array, except without item at specified index
        toast.success("Image removed", {id: 'deleting'});
    }

    return(
        <button type="button" className="bad" onClick={handleClick}>Delete image</button>
    );

}

// Button to delete marker:
function MarkerDeleteButton({markerId, markerInDb, setClickLocations, closeModal}) {

    const {db, supabase} = useContext(DbContext);

    const [display, setDisplay] = useState('none');
    const [showConfirm, setShowConfirm] = useState(false); // to allow confirmation modal to be shown before deleting

    useEffect(() => {
        if (markerInDb) {
            setDisplay(undefined); // make no change to display property (use existing CSS value)
        }
        else {
            setDisplay('none'); // do not display delete button (marker does not exist in database, so only options should be to submit or cancel)
        }
    }, [markerId, markerInDb]);

    async function deleteMarker() {
        
        // Even though ON DELETE CASCADE is already set up in database, only works for hard deletion, so for soft-deletion, need to manually get the images associated with the deleted marker:
        // Note deletion from images table must come before deletion from markers table, as images table has foreign key constraint on markerId; i.e. marker must exist.
        // Even though this is only soft-delete, we want to ensure the deleted_at for the image is older than the deleted_at for the marker, so there is no reason for marker to get deleted without image being deleted first.
        
        setShowConfirm(false);
        toast.loading("Deleting marker...", {id: 'deleting'});

        if (Capacitor.getPlatform() !== 'web') { // on mobile

            await db.run(
                `
                    UPDATE images 
                    SET deleted_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
                        updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE marker_id = ?
                `, 
                [markerId]
            );
    
            await db.run(
                `
                    UPDATE markers 
                    SET deleted_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
                        updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE id = ?
                `, 
                [markerId]
            );

        }

        else { // on web

            const {imagesError} = await supabase
                .from('images')
                .update(
                    {
                        deleted_at: new Date().toISOString(), // set to NOW
                        updated_at: new Date().toISOString(), // set to NOW
                    }
                )
                .eq('marker_id', markerId);
                if (imagesError) console.error("Error: ", imagesError);

            const {markersError} = await supabase
                .from('markers')
                .update(
                    {
                        deleted_at: new Date().toISOString(), // set to NOW
                        updated_at: new Date().toISOString(), // set to NOW
                    }
                )
                .eq('id', markerId);
                if (markersError) console.error("Error: ", markersError);

        }

        setClickLocations(prev => prev.filter(loc => loc.id !== markerId)); // visually erase marker
        toast.success("Marker deleted", {id: 'deleting'});
        closeModal();

    }

    function onRequestDelete() {
        setShowConfirm(true); // when user clicks "Delete" button, show confirmation modal
    }
    function onCancelDelete() {
        setShowConfirm(false);
    }
 
    return(
        <>
            <button type="button" className="bad" onClick={onRequestDelete} style={{display: display}}>Delete marker</button>
            <ConfirmModal isOpen={showConfirm} onConfirm={deleteMarker} onCancel={onCancelDelete}/>
        </>
    );

}


// ---- ADD & SHOW MARKERS ----

// Add click location to clickLocations (context variable) based on user's click and current zoom and scroll:
// Has knock-on effect of visibly adding a marker at that location.
// NB setClickLocations comes from useContext(PlanContext).
// NOTE: assumes event target is the canvas itself (or an overlain element with same dimensions & position as canvas)
async function addMarker(e, mapping, drawnWindow, pageNum, setClickLocations, setClickedId) {

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
    const newClickLocation = { id:id, pageNum: pageNum, x: pdfX, y: pdfY, color: null, category_name: null }; // some values initially null, as at this point, form modal has not yet popped out for user to choose a category
    setClickLocations(prev => [...prev, newClickLocation]); // add newClickLocation to clickLocations state
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
                const {canvasX, canvasY} = mapPDFToCanvas(loc.x, loc.y, mapping); // convert PDF coordinates back to canvas coordinates (from top left, in CSS px)
                const color = loc.color; // marker color (as associated with category)
                const category_name = loc.category_name;
                // Create HTML element for marker only if within canvas:
                if (canvasX >=0 && canvasX <= canvas.clientWidth && canvasY >= 0 && canvasY <= canvas.clientHeight) {
                    newMarkerLocations.push({ id, canvasX, canvasY, color, category_name });
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