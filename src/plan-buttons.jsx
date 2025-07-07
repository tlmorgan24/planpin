import { useContext, useState, useEffect } from "react";
import { PlanContext } from "./pages/Plan"; // to access context variables
import { useNavigate } from "react-router-dom";


// -- BACK TO HOME --

export function HomeButton() {
    const navigate = useNavigate()
    function handleClick() {
        navigate('/'); // Route to Home page as defined in App.jsx
    }
    return(
        <button type="button" onClick={handleClick}>Home</button>
    );
}

// -- PAGE FLICKING --

export function NextPageButton() {
    const {pageNum, setPageNum, numPages} = useContext(PlanContext);
    const [visibility, setVisibility] = useState("hidden"); // if not on last page, will set this to true to make the button visible

    useEffect(() => {
        if (!pageNum || !numPages) return;
        if (pageNum < numPages) {
            setVisibility("visible");
        }
        else {
            setVisibility("hidden");
        }
    }, [pageNum, numPages]);

    function handleClick() {
        if (!pageNum || !numPages) return;
        if (pageNum < numPages) {
            setPageNum(pageNum + 1);
        }
    }

    return(
        <button type="button" id="next-page-button" onClick={handleClick} style={{visibility: visibility}}>Next page</button>
    );
}

export function PreviousPageButton() {
    const {pageNum, setPageNum} = useContext(PlanContext);
    const [visibility, setVisibility] = useState("hidden"); // if not on last page, will set this to true to make the button visible

    useEffect(() => {
        if (!pageNum) return;
        if (pageNum > 1) {
            setVisibility("visible");
        }
        else {
            setVisibility("hidden");
        }
    }, [pageNum]);

    function handleClick() {
        if (!pageNum) return;
        if (pageNum > 1) {
            setPageNum(pageNum - 1);
        }
    }

    return(
        <button type="button" id="previous-page-button" onClick={handleClick} style={{visibility: visibility}}>Previous page</button>
    );
}

// -- RESET ZOOM/SCROLL --

export function ResetViewButton() {
    const {setInteractionState} = useContext(PlanContext);
    function handleClick() {
        setInteractionState({zoom: 1, scrollX: 0, scrollY: 0})
    }
    return(
        <button type="button" onClick={handleClick}>Reset view</button>
    );
}