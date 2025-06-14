import { useEffect, useContext, useState, forwardRef } from "react";
import { PlanContext } from "./pages/plan";
import { mapEventToCanvas, mapCanvasToPDF } from "./markers";
import { useWheel, useCtrlWheel, useTouchDrag, useTouchPinch } from "./custom-listeners";


// ********** NOTE: RENDERING IS LAGGY AT HIGH ZOOMS, BECAUSE ENTIRE PDF IS RENDERED AT HIGHER RESOLUTION (RESOURCE INTENSIVE)
// IF WANT TO REDUCE LAG, WOULD HAVE TO RENDER ONLY THE PART OF THE PDF AROUND WHERE ZOOM IS.
// BUT I WILL NOT BOTHER FOR NOW, AS THIS IS NOT NECESSARY FOR THE MINIMUM VIABLE PRODUCT.

// ********** NOTE: IT IS NOT A GREAT IDEA THAT SCROLL IS RELATED TO ABSOLUTE TRUE-SIZE PDF RATHER THAN PROPORTION OF ITS (WIDTH + HEIGHT)/2
// Because currently, with a tiny PDF, the slightest scroll could go beyond the PDF's bounds.


// Canvas of desired CSS class (defining size etc.) onto which desired page of PDF is drawn with desired zoom/scroll:
// callback is optional callback function, which parent may define to take up-to-date canvas, mapping, and drawnWindow as calculated in this component's useEffect.
// onError is optional callback function, which parent may define to gracefully handle the errors thrown when zoom/scroll is invalid.
// Invalid zoom/scroll is that which causes less than ~25% of the canvas to be filled, or which causes a size too large for proper performance.
// Defined as forwardRef as it must be referenced in InteractivePage component.
export const PageCanvas = forwardRef(({ page, zoom, scrollX, scrollY, className, callback, onError }, canvasRef) => { // page is pdf.js page object

    useEffect(() => {

        async function func() { // need to wrap everything in async function, as "await" is used

            const context = canvasRef.current.getContext('2d');

            // Set canvas resolution:
            // canvas.width & canvas.height are the resolution of the canvas in device pixels.
            // canvas.clientWidth & canvas.clientHeight are display size of canvas (as defined in CSS), in CSS px (regardless of physical device pixels).
            // Maximum resolution available for the canvas = display size * pixel ratio.
            canvasRef.current.width = canvasRef.current.clientWidth * devicePixelRatio;
            canvasRef.current.height = canvasRef.current.clientHeight * devicePixelRatio;

            // -- Create offscreen canvas with resolution increased according to zoom level --

            /*
            Note page.getViewport({scale: scaleValue}) returns PDF viewport such that 1 true-size pt -> 
            scaleValue number of rendered pixels. If scaleValue = 1 (trueSizeViewport), then can do
            trueSizeViewport.width (or height) to get width (or height) of render viewport in rendered pixels 
            = true-size pdf in pt.

            We ultimately want the offscreen canvas to have resolution equal to (visible canvas resolution * zoom), 
            so that quality is preserved for different zoom levels. But we will be rendering the whole PDF in this 
            approach (not just a window), and so need to account for fact that PDF dimensions won't be similar
            to visible canvas dimensions. This means instead of setting offScreenCanvas.width = canvas.width*zoom, 
            we have to ensure offScreenCanvas is similar to PDF dimensions.
            */

            // Set offscreen canvas resolution:
            const offScreenCanvas = document.createElement('canvas');
            const trueSizeViewport = page.getViewport({ scale: 1 });
            const pdfHeightOverWidth = trueSizeViewport.height / trueSizeViewport.width // such that height = width * pdfHeightOverWidth
            const canvasHeightOverWidth = canvasRef.current.height / canvasRef.current.width // such that height = width * canvasHeightOverWidth
            if (canvasHeightOverWidth <= pdfHeightOverWidth) { // canvas is too short compared to its width
                // Scale up offscreen canvas height such that width is same as visible canvas width, with no distortion:
                offScreenCanvas.width = canvasRef.current.width * zoom;
                offScreenCanvas.height = (canvasRef.current.width * pdfHeightOverWidth) * zoom;
            }
            else { // canvas is too tall compared to its width
                // Scale up offscreen canvas width such that height is same as visible canvas height, with no distortion:
                offScreenCanvas.height = canvasRef.current.height * zoom;
                offScreenCanvas.width = (canvasRef.current.height / pdfHeightOverWidth) * zoom;
            }

            /* 
            Note again that page.getViewport({scale: scaleValue}) means PDF viewport will be such that 1 true-size pt 
            -> rendered pixels. We want to make sure the number of pixels rendered in the viewport is the same as the 
            number of device pixels in the offscreen canvas (i.e. full resolution). I.e. the total number of pt of pdf 
            (trueSizeViewport.width) should map to the total number of device pixels in offscreen canvas 
            (offScreenCanvas.width):
            */
            const pdfToOffScreenScale = offScreenCanvas.width / trueSizeViewport.width; // such that true-size pdf pt * pdfToOffScreenScale = offScreenCanvas device pixels
            // ^ equivalently could use heights instead
            const offScreenViewport = page.getViewport({scale: pdfToOffScreenScale});
            const offScreenContext = offScreenCanvas.getContext('2d');
            const offScreenRenderContext = {
                canvasContext: offScreenContext,
                viewport: offScreenViewport
            };

            // -- Render onto offscreen (source) canvas, then take zoomed-in portion onto visible (destination) canvas --
            // NOTE: here we use widths and heights in device pixels (not CSS pixels), as this is what drawImage uses.

            // Check zoom is not excessively high:
            const offScreenCanvasArea = offScreenCanvas.width * offScreenCanvas.height;
            // Common max. canvas size is 256MB (268435456). I will impose smaller max. canvas size for sake of performance:
            try {
                if (offScreenCanvasArea > 100000000) {
                    throw new Error("Zoom is too high!")
                }
            }
            catch (err) {
                if (typeof onError === "function") {
                    onError(err);
                    return; // stop executing this function
                }
                else {
                    throw err
                }
            }

            await page.render(offScreenRenderContext).promise; 

            // Coordinates of desired window over offscreen canvas (this window is same size as destination canvas):
            let sourceLeftX = scrollX * pdfToOffScreenScale;
            let sourceTopY = scrollY * pdfToOffScreenScale;
            let sourceRightX = sourceLeftX + canvasRef.current.width; // no need to apply zoom, as the visible canvas is already smaller than offscreen canvas by zoom factor
            let sourceBottomY = sourceTopY + canvasRef.current.height; // no need to apply zoom, as the visible canvas is already smaller than offscreen canvas by zoom factor

            // Check if this causes excess, where desired "window" to take from offscreen canvas goes beyond that canvas' bounds:
            const excessLeft = Math.abs(Math.min(0, sourceLeftX)); // if sourceLeftX is negative, there will be non-zero excessLeft
            const excessRight = Math.abs(Math.min(0, offScreenCanvas.width - sourceRightX));
            const excessTop = Math.abs(Math.min(0, sourceTopY)); // if sourceTopY is negative, there will be non-zero excessTop
            const excessBottom = Math.abs(Math.min(0, offScreenCanvas.height - sourceBottomY));

            // Clip window such that it covers same part of offscreen canvas, minus the part beyond its bounds
            if (excessLeft > 0) { sourceLeftX = 0; }
            if (excessRight > 0) { sourceRightX = offScreenCanvas.width; }
            if (excessTop > 0) { sourceTopY = 0; }
            if (excessBottom > 0) { sourceBottomY = offScreenCanvas.height; }

            // This will have changed the proportions of the window, which would cause distortion if mapped to the destination canvas as-is.
            // So, clip destination coordinates to match clipped source size:
            const destinationLeftX = excessLeft;
            const destinationRightX = canvasRef.current.width - excessRight;
            const destinationTopY = excessTop;
            const destinationBottomY = canvasRef.current.height - excessBottom;
            // The parts of the destination canvas not drawn onto (padding area) will remain as white space.

            const clippedWindowWidth = destinationRightX - destinationLeftX; // equivalently, sourceRightX - sourceLeftX;
            const clippedWindowHeight = destinationBottomY - destinationTopY; // equivalently, sourceBottomY - sourceTopY;

            try {
                if (canvasRef.current.width > 2*offScreenCanvas.width && canvasRef.current.height > 2*offScreenCanvas.height) {
                    throw new Error("Zoom is too low!")
                }
                else if (excessLeft > 0.75*canvasRef.current.width && sourceRightX < offScreenCanvas.width*0.99) { // offScreenCanvas.width*0.99 instead of offScreenCanvas.width, in case of floating point error
                    throw new Error("Scroll is too far left!")
                }
                else if (excessRight > 0.75*canvasRef.current.width && sourceLeftX > offScreenCanvas.width*0.01) { // offScreenCanvas.width*0.01 instead of 0, in case of floating point error
                    throw new Error("Scroll is too far right!")
                }
                else if (excessTop > 0.75*canvasRef.current.height && sourceBottomY < offScreenCanvas.height*0.99) { // offScreenCanvas.height*0.99 instead of offScreenCanvas.height, in case of floating point error
                    throw new Error("Scroll is too far up!")
                }
                else if (excessBottom > 0.75*canvasRef.current.height && sourceTopY > offScreenCanvas.height*0.01) { // offScreenCanvas.height*0.01 instead of 0, in case of floating point error
                    throw new Error("Scroll is too far down!")
                }
            }
            catch (err) {
                if (typeof onError === "function") {
                    onError(err);
                    return; // stop executing this function
                }
                else {
                    throw err
                }
            }

            // Draw onto canvas (note drawImage uses device pixels, not CSS pixels):
            context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); // clear the canvas before drawing
            context.drawImage(
                offScreenCanvas, // source image
                sourceLeftX, sourceTopY, // top left corner of source image from which to start taking portion
                clippedWindowWidth, clippedWindowHeight, // width and height from source corner of source image along which to take portion
                destinationLeftX, destinationTopY, // top left corner of destination canvas to which to draw the taken image
                clippedWindowWidth, clippedWindowHeight // width and height from destination corner of destination canvas on which to draw the taken image
            );

            if (typeof callback === "function") { // only if callback is provided and is a function

                // Define mapping from visible canvas px -> true-size pdf pt (so clicks on canvas can map to appropriate location):
                // visible canvas px * pixel ratio -> visible canvas device pixels = offscreen canvas device pixels; / pdfToOffScreenViewportScale -> true-size pdf pt.
                // ^ No need to adjust for zoom, as visible canvas is already smaller than offscreen canvas by zoom factor.
                const mappingScale = devicePixelRatio / pdfToOffScreenScale; // such that dx (or dy) in true-size pt = dx (or dy) in canvas px * mappingScale
                const mappingXOffset = scrollX;
                const mappingYOffset = scrollY;
                const mapping = {scale: mappingScale, xOffset: mappingXOffset, yOffset: mappingYOffset};
                // true-size x in pt = xOffset + (canvas x in px * scale) (all from LEFT RIGHTWARDS).
                // true-size y in pt = yOffset + (canvas y in px * scale) (all from TOP DOWNWARDS).
                
                // drawn window is in CSS px (NOT device pixels), hence divide destination coordinates by pixel ratio
                const drawnWindow = {
                    leftX:destinationLeftX/devicePixelRatio, rightX:destinationRightX/devicePixelRatio, 
                    topY:destinationTopY/devicePixelRatio, bottomY:destinationBottomY/devicePixelRatio,
                };

                callback({canvas:canvasRef.current, mapping:mapping, drawnWindow:drawnWindow});

            }
            
        }
        func();
    }, [page, zoom, scrollX, scrollY]); // if any of these change, run useEffect block

    return(
        <canvas ref={canvasRef} className={className}></canvas>
    );

});


// Canvas displaying PDF page with interactive zoom/scroll capability on both iOS and PC (responding to pinch, mouse wheel etc.):
// Defined as forwardRef as it must be referenced in PDFViewer component.
export const InteractivePage = forwardRef(({ page, callback }, interactivePageRef) => { // page is pdf.js page object

    const {zoom, setZoom, scrollX, setScrollX, scrollY, setScrollY} = useContext(PlanContext);
    const {zoomIncrement, scrollIncrement} = useContext(PlanContext);
    
    const [canvas, setCanvas] = useState(null);
    const [mapping, setMapping] = useState(null);
    const [drawnWindow, setDrawnWindow] = useState(null);

    // -- HANDLE ZOOMING AND SCROLLING EVENTS --

    // Function to execute when user zooms in (will set increased zoom and also adjust scrollX and scrollY according to zoom centre):
    // center is in web viewport coordinates (i.e. from top left of visible viewport, in CSS px)
    function zoomIn(center, target) {
        const newZoom = zoom*zoomIncrement;
        const {canvasX, canvasY} = mapEventToCanvas(target, center.x, center.y); // from top left of canvas in CSS px
        const {pdfX, pdfY} = mapCanvasToPDF(canvasX, canvasY, mapping); // from top left of PDF in true-size pt
        const {newScrollX, newScrollY} = adjustScrollAboutPoint(pdfX, pdfY, zoom, newZoom, scrollX, scrollY);
        setZoom(newZoom);
        setScrollX(newScrollX);
        setScrollY(newScrollY);
    }

    // Function to execute when user zooms out (will set decreased zoom and also adjust scrollX and scrollY according to zoom centre):
    // center is in web viewport coordinates (i.e. from top left of visible viewport, in CSS px)
    function zoomOut(center, target) {
        const newZoom = zoom/zoomIncrement;
        const {canvasX, canvasY} = mapEventToCanvas(target, center.x, center.y); // from top left of canvas in CSS px
        const {pdfX, pdfY} = mapCanvasToPDF(canvasX, canvasY, mapping); // from top left of PDF in true-size pt
        const {newScrollX, newScrollY} = adjustScrollAboutPoint(pdfX, pdfY, zoom, newZoom, scrollX, scrollY);
        setZoom(newZoom);
        setScrollX(newScrollX);
        setScrollY(newScrollY);
    }

    // Returns adjusted scrollX and scrollY so that provided zoom is effectuated about provided centre point:
    // zoomCenter is in true-size PDF pt (like scrollX & scrollY).
    function adjustScrollAboutPoint(zoomCenterX, zoomCenterY, oldZoom, newZoom, oldScrollX, oldScrollY) {
        const offsetX = zoomCenterX - oldScrollX; // distance from left edge of PDF to zoom center (pt)
        const offsetY = zoomCenterY - oldScrollY; // distance from top edge of PDF to zoom center (pt)
        const newScrollX = zoomCenterX - offsetX * (oldZoom / newZoom);
        const newScrollY = zoomCenterY - offsetY * (oldZoom / newZoom);
        return {newScrollX, newScrollY};
    }

    // Functions to execute when user scrolls (will adjust scrollX or scrollY by finer amounts at higher zoom levels):
    function scrollLeft() {
        setScrollX(scrollX - (scrollIncrement/zoom));
    }
    function scrollRight() {
        setScrollX(scrollX + (scrollIncrement/zoom));
    }
    function scrollUp() {
        setScrollY(scrollY - (scrollIncrement/zoom));
    }
    function scrollDown() {
        setScrollY(scrollY + (scrollIncrement/zoom));
    }

    // Set event listener for touchscreen pinches, triggering zoom functions:
    useTouchPinch(
        zoomIn, // reference to zoomIn function, which takes center and target parameters. useTouchPinch provides these and executes the function if user pinches apart.
        zoomOut, // reference to zoomOut function, which takes center and target parameters. useTouchPinch provides these and executes the function if user pinches together.
        interactivePageRef, // component to add event listener to (this component)
        [mapping], // additional dependency to pass to useEffect hook
    );

    // Set event listener for touchscreen drags, triggering scroll functions:
    useTouchDrag(
        scrollRight, // this function will be executed if user drags left
        scrollLeft, // this function will be executed if user drags right
        scrollDown, // this function will be executed if user drags up
        scrollUp, // this function will be executed if user drags down
        interactivePageRef, // component to add event listener to (this component)
    );

    // Set event listener for ctrl + mouse wheel or two-finger trackpad pinches, triggering zoom functions:
    useCtrlWheel(
        zoomIn, // if user mouse wheels up with ctrl pressed (or pinches apart on trackpad)
        zoomOut, // if user mouse wheels down with ctrl pressed (or pinches together on trackpad)
        interactivePageRef, // component to add event listener to (this component)
        [mapping], // additional dependency to pass to useEffect hook
    );

    // Set event listener for mouse wheel or two-finger trackpad drags, triggering scroll functions:
    useWheel(
        scrollLeft, // this function will be executed if user mouse wheels left (or drags RIGHT on trackpad)
        scrollRight, // this function will be executed if user mouse wheels right (or drags LEFT on trackpad)
        scrollUp, // this function will be executed if user mouse wheels up (or drags DOWN on trackpad)
        scrollDown, // this function will be executed if user mouse wheels down (or drags UP on trackpad)
        interactivePageRef, // component to add event listener to (this component)
    );

    // -- CALLBACK TO HANDLE INVALID ZOOM/SCROLL --
    
    /* 
    Define onError callback (to PageCanvas component) such that it will adjusts zoom/scrollX/scrollY 
    by same amount (but reversed) as user would have adjusted them through the zooming/scrolling events.

    But note, it is still possible for the recommended adjustment to not match the reverse of what the user just did.
    E.g., if the user had scrolled right a lot at the start, then zoomed out a bit, their last command may have been to zoom out,
    but the recommendation would be "Scroll is too far right!". The recommendation is valid, because it means it is possible to see
    the pdf at the user's desired zoom level by scrolling left. But, it will cause the pdf to "jump" left.

    I could alternatively simply track what the user pressed, and reverse that specific action.
    This would have the benefit that I could rework things so that page doesn't keep re-rendering if user keeps providing invalid zoom/scroll,
    i.e., the page would cleanly stay put instead of flashing/lagging as it re-renders.
    */ 

    function onError(err) {
        console.log(err.message)
        console.log("Will try to revert to valid parameters...")
        if (err.message == "Zoom is too high!") {
            setZoom(zoom/zoomIncrement)
            console.log("Zoom decreased.")
        }
        else if (err.message == "Zoom is too low!") {
            setZoom(zoom*zoomIncrement)
            console.log("Zoom increased.")
        }
        else if (err.message == "Scroll is too far left!") {
            setScrollX(scrollX+(scrollIncrement/zoom))
            console.log("Scroll shifted right.")
        }
        else if (err.message == "Scroll is too far right!") {
            setScrollX(scrollX-(scrollIncrement/zoom))
            console.log("Scroll shifted left.")
        }
        else if (err.message == "Scroll is too far up!") {
            setScrollY(scrollY+(scrollIncrement/zoom))
            console.log("Scroll shifted down.")
        }
        else if (err.message == "Scroll is too far down!") {
            setScrollY(scrollY-(scrollIncrement/zoom))
            console.log("Scroll shifted up.")
        }
        else {
            console.log("Unable to map error to parameter adjustment.")
            throw err;
        }
    }

    // -- CALLBACK TO UPDATE STATES --

    // Define callback (to PageCanvas component) such that, after PageCanvas paints to browser,
    // it will update this component's canvas, mapping and drawnWindow states:
    function setStates({canvas, mapping, drawnWindow}) {
        setCanvas(canvas);
        setMapping(mapping);
        setDrawnWindow(drawnWindow);
    }

    // Enable callback to this component such that (optionally) canvas, mapping and drawnWindow can be passed up to parent
    useEffect(() => {
        callback?.({canvas, mapping, drawnWindow});
    }, [canvas, mapping, drawnWindow])

    // -- RETURN --

    // Note using ref attribute on React component (PageCanvas) rather than traditional HTML element is allowed here thanks to the fact that PageCanvas was defined as a forwardRef.
    return(
        <PageCanvas ref={interactivePageRef} page={page} zoom={zoom} scrollX={scrollX} scrollY={scrollY} className="pageCanvas" callback={setStates} onError={onError}/>
    );

});
