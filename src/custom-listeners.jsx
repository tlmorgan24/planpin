import { useEffect, useRef } from "react";

// Custom hook to add wheel event listener using an effect.
// When ctrl + wheel scrolls are detected, corresponding functions (input to this function) are triggered. This event should generally be associated with ZOOMING.
// The functions take center and target parameters: 
    // center is centrepoint (viewport coordinates, CSS px) between the two finger touches;
    // target is the event target for the two finger touches (touches must have common target, or effect will not run).
// NB pinching outwards/inwards on trackpad automatically equates to ctrl + mouse wheel up/down, so don't have to make separate event for this.
// elementRef is reference to element to attach the listener to.
// deps is custom array of additional dependencies for the effect. If any are null or undefined, the effect will not be run.
export function useCtrlWheel(onWheelUp, onWheelDown, elementRef, deps=[]) {
    useEffect(() => {

        // If deps is non-empty and any value is null or undefined, skip effect (it is assumed the functions triggered by this event will be requiring non-null values):
        if (deps.length > 0 && deps.some(dep => dep == null)) {
            return;
        }

        const handleWheelZoom = (e) => {

            // We will make the PDF zoom in if the user scrolls up with mouse wheel while pressing ctrl, & vice versa.

            if (!e.ctrlKey) return; // only if ctrl key is pressed while turning wheel (or trackpad action is a pinch)
            e.preventDefault();
            const target = e.target;
            const center = {
                x: e.clientX,
                y: e.clientY
            };

            if (e.deltaY < 0) { // wheel is being scrolled UP (or trackpad fingers pinching apart)
                onWheelUp?.(center, target); // call function if provided (defined separately) - recommendation is to make it ZOOM IN
            } else if (e.deltaY > 0) { // wheel is being scrolled DOWN (or trackpad fingers pinching together)
                onWheelDown?.(center, target); // call function if provided (defined separately) - recommendation is to make it ZOOM OUT
            }

        };

        // Note passive:false is necessary if doing preventDefault() with wheel events:
        elementRef.current.addEventListener("wheel", handleWheelZoom, { passive: false });

        // Clean-up function to remove listeners, preventing listeners from stacking on top of each other every run:
        return () => {
            if (!elementRef.current) return; // in case element unmounts before this clean-up is carried out
            elementRef.current.removeEventListener("wheel", handleWheelZoom);
        };

    }, [[onWheelUp, onWheelDown].concat(deps)]);
}

// Custom hook to add wheel event listener using an effect.
// When wheel scrolls are detected, corresponding scroll functions (input to this function) are triggered. This event should generally be associated with SCROLLING.
// NB dragging UP with two fingers (without changing distance between them) on trackpad automatically equates to mouse wheel DOWN (etc. for other directions), so don't have to make separate event for this.
// NB mouse wheel left/right isn't possible with most physical mice, but trackpad can still handle this.
// elementRef is reference to element to attach the listener to.
// deps is custom array of additional dependencies for the effect. If any are null or undefined, the effect will not be run.
export function useWheel(onWheelLeft, onWheelRight, onWheelUp, onWheelDown, elementRef, deps=[]) {
    useEffect(() => {

        // If deps is non-empty and any value is null or undefined, skip effect (it is assumed the functions triggered by this event will be requiring non-null values):
        if (deps.length > 0 && deps.some(dep => dep == null)) {
            return;
        }

        const handleWheelPan = (e) => {

            if (e.ctrlKey) return; // do not do anything if ctrl key is pressed (useCtrlWheel will handle things instead)
            e.preventDefault();

            if (e.deltaX < 0) { // wheel being scrolled LEFT (or trackpad fingers dragging RIGHT)
                onWheelLeft?.(); // call function if provided (defined separately) - recommendation is to make it SCROLL LEFT
            } else if (e.deltaX > 0) { // wheel being scrolled RIGHT (or trackpad fingers dragging LEFT)
                onWheelRight?.(); // call function if provided (defined separately) - recommendation is to make it SCROLL RIGHT
            }
            // use "if" instead of "else if", so that can wheel left-right AND up-down simultaneously (support diagonal wheel movement):
            if (e.deltaY < 0) { // wheel being scrolled UP (or trackpad fingers dragging DOWN)
                onWheelUp?.(); // call function if provided (defined separately) - recommendation is to make it SCROLL UP
            } else if (e.deltaY > 0) { // wheel being scrolled DOWN (or trackpad fingers dragging UP)
                onWheelDown?.(); // call function if provided (defined separately) - recommendation is to make it SCROLL DOWN
            }

        };

        // Note passive:false is necessary if doing preventDefault() with wheel events:
        elementRef.current.addEventListener("wheel", handleWheelPan, { passive: false });

        // Clean-up function to remove listeners, preventing listeners from stacking on top of each other every run:
        return () => {
            if (!elementRef.current) return; // in case element unmounts before this clean-up is carried out
            elementRef.current.removeEventListener("wheel", handleWheelPan);
        };

    }, [[onWheelLeft, onWheelRight, onWheelUp, onWheelDown].concat(deps)]);
}

// Custom hook to add touch event listeners to touchscreen devices using an effect.
// When pinch is detected, corresponding functions (input to this function) are triggered. This event should generally be associated with ZOOMING.
// The functions take center and target parameters: 
    // center is centrepoint (viewport coordinates, CSS px) between the two finger touches;
    // target is the event target for the two finger touches (touches must have common target, or effect will not run).// elementRef is reference to element to attach the listener to.
// deps is custom array of additional dependencies for the effect. If any are null or undefined, the effect will not be run.
export function useTouchPinch(onPinchApart, onPinchTogether, elementRef, deps=[]) {
    
    const initialDistanceRef = useRef(null);

    useEffect(() => {

        // If deps is non-empty and any value is null or undefined, skip effect (it is assumed the functions triggered by this event will be requiring non-null values):
        if (deps.length > 0 && deps.some(dep => dep == null)) {
            return;
        }

        const getDistance = (touches) => {
            const [touch1, touch2] = touches;
            const dx = touch1.clientX - touch2.clientX;
            const dy = touch1.clientY - touch2.clientY;
            return Math.sqrt(dx**2 + dy**2);
        };

        // center is in viewport coordinates (irrespective of target, i.e. if click is on canvas, doesn't use canvas coords)
        const getCenter = (touches) => {
            const [touch1, touch2] = touches;
            return {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2,
            };
        };

        const getTarget = (touches) => {
            const [touch1, touch2] = touches;
            if (touch1.target === touch2.target) {
                return touch1.target;
            }
            return null; // if targets of two touches don't match, return null
        };

        const handleTouchStart = (e) => {
            if (e.touches.length === 2) {
                initialDistanceRef.current = getDistance(e.touches);
            }
        };

        const handleTouchMove = (e) => {

            if (e.touches.length !== 2 || initialDistanceRef.current == null) return;
            const target = getTarget(e.touches)
            if (!target) return; // if target is null (targets of two touches don't match), do nothing
            e.preventDefault();
            const currentDistance = getDistance(e.touches);
            const center = getCenter(e.touches);
            if (currentDistance > initialDistanceRef.current) { // user is pinching apart
                onPinchApart?.(center, target); // call function if provided (defined separately) - recommendation is to make it ZOOM IN
            } else if (currentDistance < initialDistanceRef.current) { // user is pinching together
                onPinchTogether?.(center, target); // call function if provided (defined separately) - recommendation is to make it ZOOM OUT
            }
            initialDistanceRef.current = currentDistance; // so that zoom will only continue if fingers CONTINUE to move

        };

        const handleTouchEnd = () => {
            initialDistanceRef.current = null;
        };

        // Note passive:false is necessary if doing preventDefault() with touchstart & touchmove events:
        elementRef.current.addEventListener('touchstart', handleTouchStart, { passive: false });
        elementRef.current.addEventListener('touchmove', handleTouchMove, { passive: false });
        elementRef.current.addEventListener('touchend', handleTouchEnd);

        // Clean-up function to remove listeners, preventing listeners from stacking on top of each other every run:
        return () => {
            if (!elementRef.current) return; // in case element unmounts before this clean-up is carried out
            elementRef.current.removeEventListener('touchstart', handleTouchStart);
            elementRef.current.removeEventListener('touchmove', handleTouchMove);
            elementRef.current.removeEventListener('touchend', handleTouchEnd);
        };

    }, [[onPinchApart, onPinchTogether].concat(deps)]);

}

// Custom hook to add touch event listeners to touchscreen devices using an effect.
// When drag is detected, corresponding functions (input to this function) are triggered. This event should generally be associated with SCROLLING.
// elementRef is reference to element to attach the listener to.
// deps is custom array of additional dependencies for the effect. If any are null or undefined, the effect will not be run.
export function useTouchDrag(onDragLeft, onDragRight, onDragUp, onDragDown, elementRef, deps=[]) {
    
    const lastTouchRef = useRef(null);

    useEffect(() => {

        // If deps is non-empty and any value is null or undefined, skip effect (it is assumed the functions triggered by this event will be requiring non-null values):
        if (deps.length > 0 && deps.some(dep => dep == null)) {
            return;
        }

        const handleTouchStart = (e) => {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
            }
        };

        const handleTouchMove = (e) => {

            if (e.touches.length !== 1 || lastTouchRef.current == null) return;
            e.preventDefault();

            const touch = e.touches[0];
            const deltaX = touch.clientX - lastTouchRef.current.x;
            const deltaY = touch.clientY - lastTouchRef.current.y;

            if (deltaX < 0) { // user is dragging left
                onDragLeft?.(); // call function if provided (defined separately) - recommendation is to make it SCROLL RIGHT
            } else if (deltaX > 0) { // user is dragging right
                onDragRight?.(); // call function if provided (defined separately) - recommendation is to make it SCROLL LEFT
            }
            // use "if" instead of "else if", so that can drag left-right AND up-down simultaneously (support diagonal dragging):
            if (deltaY < 0) { // user is dragging up
                onDragUp?.(); // call function if provided (defined separately) - recommendation is to make it SCROLL DOWN
            } else if (deltaY > 0) { // user is dragging down
                onDragDown?.(); // call function if provided (defined separately) - recommendation is to make it SCROLL UP
            }

            lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
        };

        const handleTouchEnd = () => {
            lastTouchRef.current = null;
        };

        // Note passive:false is necessary if doing preventDefault() with touchstart & touchmove events:
        elementRef.current.addEventListener("touchstart", handleTouchStart, { passive: false });
        elementRef.current.addEventListener("touchmove", handleTouchMove, { passive: false });
        elementRef.current.addEventListener("touchend", handleTouchEnd);

        // Clean-up function to remove listeners, preventing listeners from stacking on top of each other every run:
        return () => {
            if (!elementRef.current) return; // in case element unmounts before this clean-up is carried out
            elementRef.current.removeEventListener("touchstart", handleTouchStart);
            elementRef.current.removeEventListener("touchmove", handleTouchMove);
            elementRef.current.removeEventListener("touchend", handleTouchEnd);
        };

    }, [[onDragLeft, onDragRight, onDragUp, onDragDown].concat(deps)]);
}