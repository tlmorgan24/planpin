import { useEffect, useContext, useState, forwardRef } from "react";
import { PlanContext } from "./pages/plan";
import { mapEventToCanvas, mapCanvasToPDF } from "./markers";
import { useWheel, useCtrlWheel, useTouchDrag, useTouchPinch } from "./custom-listeners";


// ********** NOTE: IT IS NOT A GREAT IDEA THAT SCROLL IS RELATED TO ABSOLUTE TRUE-SIZE PDF RATHER THAN PROPORTION OF ITS (WIDTH + HEIGHT)/2
// Because currently, with a tiny PDF, the slightest scroll could go beyond the PDF's bounds.


// Canvas of desired CSS class (defining size etc.) onto which desired page of PDF is drawn with desired zoom/scroll:
// page is page number to draw (1 to draw first page of PDF, etc.)
// zoom is such that zoom=1 means at least one dimension of the PDF is shown entirely on canvas (initialised to 1)
// scollX = rightwards scroll in true-size PDF pt, where 0 means left-aligned (initialised to 0)
// scrollY = downwards scroll in true-size PDF pt, where 0 means top-aligned (initialised to 0)
// callback is optional callback function, which parent may define to take up-to-date canvas, mapping, and drawnWindow as calculated in this component's useEffect.
// Defined as forwardRef as it must be referenced in InteractivePage component.
export const PageCanvas = forwardRef(({ page, zoom, scrollX, scrollY, className, callback }, canvasRef) => { // page is pdf.js page object

    useEffect(() => {

        async function func() { // need to wrap everything in async function, as "await" is used

            const context = canvasRef.current.getContext('2d');

            // Set canvas resolution:
            // canvas.width & canvas.height are the resolution of the canvas in device pixels.
            // canvas.clientWidth & canvas.clientHeight are display size of canvas (as defined in CSS), in CSS px (regardless of physical device pixels).
            // Maximum resolution available for the canvas = display size * pixel ratio.
            canvasRef.current.width = canvasRef.current.clientWidth * devicePixelRatio;
            canvasRef.current.height = canvasRef.current.clientHeight * devicePixelRatio;

            // -- Create offscreen canvas with same aspect ratio as PDF --

            /*
            Note page.getViewport({scale: scaleValue}) returns PDF viewport such that 1 true-size pt -> 
            scaleValue number of rendered pixels. If scaleValue = 1 (trueSizeViewport), then can do
            trueSizeViewport.width (or height) to get width (or height) of render viewport in rendered pixels 
            = true-size pdf in pt.

            When rendering PDF onto canvas, that canvas should be same aspect ratio as the PDF to prevent distortion.
            Our desired canvas may not have same aspect ratio, so we will first create an offscreen canvas with PDF's aspect
            ratio (but with at least one dimension equal to the desired visible canvas' dimension). We will render PDF onto 
            this offscreen canvas, and then draw a "window" (of visible canvas' size) of this onto the visible canvas.
            */

            // Set offscreen canvas resolution:
            const offScreenCanvas = document.createElement('canvas');
            const trueSizeViewport = page.getViewport({ scale: 1 });
            const pdfWidth = trueSizeViewport.width // in true-size pt
            const pdfHeight = trueSizeViewport.height // in true-size pt
            const pdfHeightOverWidth = pdfHeight / pdfWidth // such that height = width * pdfHeightOverWidth
            const canvasHeightOverWidth = canvasRef.current.height / canvasRef.current.width // such that height = width * canvasHeightOverWidth
            const ratio = pdfHeightOverWidth / canvasHeightOverWidth; 
            // ^ If ratio > 1, pdf is tall and skinny compared to onscreen canvas which is short and fat. We will want to keep offscreen canvas WIDTH same as onscreen canvas, but scale up the HEIGHT.
            // ^ If ratio < 1, pdf is short and fat compared to onscreen canvas which is tall and skinny. We will want to keep offscreen canvas HEIGHT same as onscreen canvas, but scale up the WIDTH.
            const widthScaleUp = Math.max(1/ratio, 1);
            const heightScaleUp = Math.max(ratio, 1);
            offScreenCanvas.width = canvasRef.current.width * widthScaleUp;
            offScreenCanvas.height = canvasRef.current.height * heightScaleUp;

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
            // To prevent lag, we will only render the part of PDF which will actually be shown. Otherwise, rendering at high zoom would mean rendering whole PDF in detail (resource intensive).
            // Using the transform property with our desired zoom/scroll kills two birds with one stone: 
            // 1. The PDF rendered on offscreen canvas will be zoomed/scrolled in as appropriate
            // 2. The part of the transformed PDF overflowing the offscreen canvas will not be rendered (saving resources). Also note, the part of the offscreen canvas the transformed PDF doesn't reach is left as empty space (PDF won't try and fill it up through distortion, which is good)
            const translateX = -scrollX*pdfToOffScreenScale*zoom; // desired x translation of PDF in offscreen canvas device pixels
            const translateY = -scrollY*pdfToOffScreenScale*zoom; // desired y translation of PDF in offscreen canvas device pixels
            const transform = [zoom, 0, 0, zoom, translateX, translateY]; // scale X, skew Y, skew X, scale Y, translate X, translate Y (translation applied after zooming)
            const offScreenRenderContext = {
                canvasContext: offScreenContext,
                transform: transform,
                viewport: offScreenViewport
            };

            // -- Render onto offscreen (source) canvas (which has same aspect ratio as PDF to prevent distortion), then take "window" of visible (destination) canvas' size from this --
            // NOTE: here we use widths and heights in device pixels (not CSS pixels) throughout, as this is what drawImage uses.

            await page.render(offScreenRenderContext).promise; 

            // Coordinates of desired window over offscreen canvas (this window is same size as destination canvas):
            let windowLeftX = 0;
            let windowRightX = canvasRef.current.width;
            let windowTopY = 0;
            let windowBottomY = canvasRef.current.height;

            const windowWidth = windowRightX - windowLeftX;
            const windowHeight = windowBottomY - windowTopY;

            // Draw onto canvas (note drawImage uses device pixels, not CSS pixels):
            context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); // clear the canvas before drawing
            context.drawImage(
                offScreenCanvas, // source image
                windowLeftX, windowTopY, // top left corner of source image from which to start taking portion
                windowWidth, windowHeight, // width and height from source corner of source image along which to take portion
                windowLeftX, windowTopY, // top left corner of destination canvas to which to draw the taken image
                windowWidth, windowHeight // width and height from destination corner of destination canvas on which to draw the taken image
            );

            if (typeof callback === "function") { // only if callback is provided and is a function

                // Define mapping from visible canvas px -> true-size pdf pt (so clicks on canvas can map to appropriate location):
                // visible canvas px * pixel ratio -> visible canvas device pixels = offscreen canvas device pixels; / pdfToOffScreenViewportScale -> true-size pdf pt.
                // ^ Then adjust for zoom applied in offscreen canvas pdf render trasform: greater zoom means not as much scale-up is needed to get to true-size PDF (i.e., divide by zoom here).
                const mappingScale = devicePixelRatio / pdfToOffScreenScale / zoom; // such that dx (or dy) in true-size pt = dx (or dy) in canvas px * mappingScale
                const mappingXOffset = scrollX;
                const mappingYOffset = scrollY;
                const mapping = {scale: mappingScale, xOffset: mappingXOffset, yOffset: mappingYOffset};
                // true-size x in pt = xOffset + (canvas x in px * scale) (all from LEFT RIGHTWARDS).
                // true-size y in pt = yOffset + (canvas y in px * scale) (all from TOP DOWNWARDS).

                // Define drawn window (i.e., the part of the canvas which actually has PDF content; not empty space):
                // Full size of PDF after transform:
                const pdfWidth = trueSizeViewport.width * pdfToOffScreenScale * zoom;
                const pdfHeight = trueSizeViewport.height * pdfToOffScreenScale * zoom;
                const contentLeftX = translateX;
                const contentTopY = translateY;
                const contentRightX = translateX + pdfWidth;
                const contentBottomY = translateY + pdfHeight;
                // After clipping to canvas bounds:
                const drawnLeftX = Math.max(0, contentLeftX);
                const drawnTopY = Math.max(0, contentTopY);
                const drawnRightX = Math.min(canvasRef.current.width, contentRightX);
                const drawnBottomY = Math.min(canvasRef.current.height, contentBottomY);
                // Drawn window expected by other components is in CSS px (NOT device pixels), hence divide destination coordinates by pixel ratio:
                const drawnWindow = {
                    leftX:drawnLeftX/devicePixelRatio, rightX:drawnRightX/devicePixelRatio, 
                    topY:drawnTopY/devicePixelRatio, bottomY:drawnBottomY/devicePixelRatio,
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

    const {interactionState, setInteractionState, zoomIncrement, scrollIncrement} = useContext(PlanContext);
    const zoom = interactionState.zoom;
    const scrollX = interactionState.scrollX;
    const scrollY = interactionState.scrollY;
    
    const [canvas, setCanvas] = useState(null);
    const [mapping, setMapping] = useState(null);
    const [drawnWindow, setDrawnWindow] = useState(null);

    // -- HANDLE ZOOMING AND SCROLLING EVENTS --

    // Here we utilise functional updates to interactionState (because updates to interactionState depend on the current batch of values, which we want to ensure are up to date)

    // Conditions that must be satisfied before updating interactionState to desired combination of zoom/scrollX/scrollY (aiming to prevent unreasonable zoom/scroll):
    function interactionConditions(zoom, scrollX, scrollY) {
        
        if (!canvas) return;
        
        // Mainly same code snippet as used in PageCanvas:
        const trueSizeViewport = page.getViewport({ scale: 1 });
        const pdfWidth = trueSizeViewport.width // in true-size pt
        const pdfHeight = trueSizeViewport.height // in true-size pt
        const pdfHeightOverWidth = pdfHeight / pdfWidth // such that height = width * pdfHeightOverWidth
        const canvasHeightOverWidth = canvas.height / canvas.width // such that height = width * canvasHeightOverWidth
        const ratio = pdfHeightOverWidth / canvasHeightOverWidth; // if ratio > 1, pdf is tall and skinny compared to canvas which is short and fat; and vice versa for ratio < 1.
        const widthScaleUp = Math.max(1/ratio, 1);
        const heightScaleUp = Math.max(ratio, 1);
        const absoluteRatio = Math.max(1/ratio, ratio);

        const zoomCondition = zoom > 0.25/absoluteRatio && zoom < 4; // dividing by absoluteRatio allows more flexibility to zoom out if the canvas has different aspect ratio to PDF
        const scrollXCondition = scrollX > -0.5*pdfWidth/zoom/widthScaleUp && scrollX < pdfWidth - 0.5*pdfWidth/zoom/widthScaleUp;
        const scrollYCondition = scrollY > -0.5*pdfHeight/zoom/heightScaleUp && scrollY < pdfHeight - 0.5*pdfHeight/zoom/heightScaleUp;

        return zoomCondition && scrollXCondition && scrollYCondition;

    }

    // Function to execute when user zooms in (will set increased zoom and also adjust scrollX and scrollY according to zoom centre):
    // center is in web viewport coordinates (i.e. from top left of visible viewport, in CSS px)
    function zoomIn(center, target) {
        setInteractionState(prevInteractionState => {
            const prevZoom = prevInteractionState.zoom;
            const prevScrollX = prevInteractionState.scrollX;
            const prevScrollY = prevInteractionState.scrollY;
            const newZoom = prevZoom*zoomIncrement;
            const {canvasX, canvasY} = mapEventToCanvas(target, center.x, center.y); // from top left of canvas in CSS px
            const {pdfX, pdfY} = mapCanvasToPDF(canvasX, canvasY, mapping); // from top left of PDF in true-size pt
            const {newScrollX, newScrollY} = adjustScrollAboutPoint(pdfX, pdfY, prevZoom, newZoom, prevScrollX, prevScrollY);
            if (!interactionConditions(newZoom, newScrollX, newScrollY)) return prevInteractionState; // no change to interactionState; no re-render triggered
            return {zoom: newZoom, scrollX: newScrollX, scrollY: newScrollY}; // set interactionState to new object, hence trigger re-render
        });
    }

    // Function to execute when user zooms out (will set decreased zoom and also adjust scrollX and scrollY according to zoom centre):
    // center is in web viewport coordinates (i.e. from top left of visible viewport, in CSS px)
    function zoomOut(center, target) {
        setInteractionState(prevInteractionState => {
            const prevZoom = prevInteractionState.zoom;
            const prevScrollX = prevInteractionState.scrollX;
            const prevScrollY = prevInteractionState.scrollY;
            const newZoom = prevZoom/zoomIncrement;
            const {canvasX, canvasY} = mapEventToCanvas(target, center.x, center.y); // from top left of canvas in CSS px
            const {pdfX, pdfY} = mapCanvasToPDF(canvasX, canvasY, mapping); // from top left of PDF in true-size pt
            const {newScrollX, newScrollY} = adjustScrollAboutPoint(pdfX, pdfY, prevZoom, newZoom, prevScrollX, prevScrollY);
            if (!interactionConditions(newZoom, newScrollX, newScrollY)) return prevInteractionState; // no change to interactionState; no re-render triggered
            return {zoom: newZoom, scrollX: newScrollX, scrollY: newScrollY}; // set interactionState to new object, hence trigger re-render
        });
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
        setInteractionState(prevInteractionState => {
            const zoom = prevInteractionState.zoom;
            const prevScrollX = prevInteractionState.scrollX;
            const scrollY = prevInteractionState.scrollY;
            const newScrollX = prevScrollX - (scrollIncrement/zoom);
            if (!interactionConditions(zoom, newScrollX, scrollY)) return prevInteractionState; // no change to interactionState; no re-render triggered
            return {zoom, scrollX: newScrollX, scrollY}; // set interactionState to new object, hence trigger re-render
        });
    }
    function scrollRight() {
        setInteractionState(prevInteractionState => {
            const zoom = prevInteractionState.zoom;
            const prevScrollX = prevInteractionState.scrollX;
            const scrollY = prevInteractionState.scrollY;
            const newScrollX = prevScrollX + (scrollIncrement/zoom);
            if (!interactionConditions(zoom, newScrollX, scrollY)) return prevInteractionState; // no change to interactionState; no re-render triggered
            return {zoom, scrollX: newScrollX, scrollY}; // set interactionState to new object, hence trigger re-render
        });
    }
    function scrollUp() {
        setInteractionState(prevInteractionState => {
            const zoom = prevInteractionState.zoom;
            const scrollX = prevInteractionState.scrollX;
            const prevScrollY = prevInteractionState.scrollY;
            const newScrollY = prevScrollY - (scrollIncrement/zoom);
            if (!interactionConditions(zoom, scrollX, newScrollY)) return prevInteractionState; // no change to interactionState; no re-render triggered
            return {zoom, scrollX, scrollY: newScrollY}; // set interactionState to new object, hence trigger re-render
        });
    }
    function scrollDown() {
        setInteractionState(prevInteractionState => {
            const zoom = prevInteractionState.zoom;
            const scrollX = prevInteractionState.scrollX;
            const prevScrollY = prevInteractionState.scrollY;
            const newScrollY = prevScrollY + (scrollIncrement/zoom);
            if (!interactionConditions(zoom, scrollX, newScrollY)) return prevInteractionState; // no change to interactionState; no re-render triggered
            return {zoom, scrollX, scrollY: newScrollY}; // set interactionState to new object, hence trigger re-render
        });
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
        <PageCanvas ref={interactivePageRef} page={page} zoom={zoom} scrollX={scrollX} scrollY={scrollY} className="pageCanvas" callback={setStates}/>
    );

});
