import { useContext } from "react";
import { PlanContext } from "./pages/plan"; // to access context variables
import { useNavigate } from "react-router-dom";


// -- BACK TO HOME --

export function HomeButton() {
    const navigate = useNavigate()
    const handleClick = () => {
        navigate('/'); // Route to Home page as defined in App.jsx
    };
    return(
        <button type="button" onClick={handleClick}>Home</button>
    );
}

// -- PAGE FLICKING --

export function NextPageButton() {
    const {pageNum, setPageNum, numPages} = useContext(PlanContext);
    const handleClick = () => {
        if (pageNum < numPages) {
            setPageNum(pageNum + 1);
        }
    };
    return(
        <button type="button" onClick={handleClick}>Next page</button>
    );
}

export function PreviousPageButton() {
    const {pageNum, setPageNum} = useContext(PlanContext);
    const handleClick = () => {
        if (pageNum > 1) {
            setPageNum(pageNum - 1);
        }
    };
    return(
        <button type="button" onClick={handleClick}>Previous page</button>
    );
}

// -- RESET ZOOM/SCROLL --

export function ResetViewButton() {
    const {setZoom, setScrollX, setScrollY} = useContext(PlanContext);
    const handleClick = () => {
        setZoom(1);
        setScrollX(0);
        setScrollY(0);
    };
    return(
        <button type="button" onClick={handleClick}>Reset view</button>
    );
}