import { useContext, useState, useEffect } from "react";
import { Share } from '@capacitor/share';
import { Filesystem } from "@capacitor/filesystem";
import { DbContext, UserContext } from "./main";
import { PlanContext } from "./pages/Plan"; // to access context variables
import { useNavigate } from "react-router-dom";
import { saveFile } from "./pdf-setup";
import { AppContext } from "./App";
import { Capacitor } from "@capacitor/core";
import Loading from "./pages/Loading";


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

// -- GENERATE REPORT --

export function GenerateReportButton() {

    const {userId} = useContext(UserContext);
    const {supabase} = useContext(DbContext);
    const {saveDir} = useContext(AppContext);
    const {planId} = useContext(PlanContext);
    const [loading, setLoading] = useState(false);

    async function generateReport() {

        setLoading(true);

        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Error: ", error);
        const accessToken = data.session.access_token;
        const refreshToken = data.session.refresh_token;

        const serverIp = import.meta.env.VITE_SERVER_IP_ADDRESS;
        const serverPort = import.meta.env.VITE_SERVER_PORT;

        const postData = {
            access_token: accessToken,
            refresh_token: refreshToken,
            user_id: userId,
            plan_id: planId,
            priority_limit: 5, // for now, priority limit is not choosable by user
            include_caption: false, // for now, photo captions are not a thing
        }

        try {

            const response = await fetch(`http://${serverIp}:${serverPort}/generate_report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(postData),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob(); // the response is a Word document, so can read it as a blob
            const fileName = 'generated_report.docx'

            if (Capacitor.getPlatform() !== 'web') { // on mobile

                // To share the .docx file on mobile app, need to first save to Filesystem, then get URI, then finally share:
                
                const folder = 'tmp' // save to a "tmp" (temporary) folder of filesystem (not in user-specific folder)
                await saveFile(blob, folder, saveDir, fileName, true); // allow overwriting (we don't want/need to preserve a file once shared)
                
                const uriResult = await Filesystem.getUri({
                    directory: saveDir,
                    path: `${folder}/${fileName}`,
                });

                await Share.share({
                    title: 'Generated Report',
                    url: uriResult.uri,
                    dialogTitle: 'Share Report',
                });
            
            }

            else { // on web

                const url = URL.createObjectURL(blob);

                // Temporarily (and invisibly) create download link, simulate clicking it, then remove link:
                const a = document.createElement('a'); // <a> element (for clickable link)
                a.href = url;
                a.download = fileName; // suggested filename when user downloads
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                URL.revokeObjectURL(url); // remove from memory

            }

        } catch (error) {
            console.error("Error generating report: ", error);
        }

        setLoading(false);

    }

    return (
        <button type="button" onClick={generateReport}>
            {loading ? <Loading /> : 'Generate report'}
        </button>
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