import { useContext, useState, useEffect } from "react";
import { toast } from 'sonner';
import { Share } from '@capacitor/share';
import { Filesystem } from "@capacitor/filesystem";
import { DbContext, UserContext } from "./main";
import { PlanContext } from "./pages/Plan"; // to access context variables
import { saveFile } from "./pdf-setup";
import { Capacitor } from "@capacitor/core";
import { fullSync } from "./sync";
import { checkConnection } from "./network";


// -- GENERATE REPORT --

export function GenerateReportButton() {

    const {userId, pdfFolder, imageFolder, saveDir} = useContext(UserContext);
    const {db, supabase} = useContext(DbContext);
    const {planId} = useContext(PlanContext);

    async function generateReport() {

        toast.loading('Generating report (this may take a few minutes)...', {id: 'loading'});

        const hasConnection = await checkConnection();
        if (!hasConnection) {
            toast.error('Please connect to the internet to generate a report', {id: 'loading'});
            return;
        }
        
        // First, ensure fully synced with cloud if on mobile (as all reports are generated from cloud data):
        if (Capacitor.getPlatform() !== 'web') {
            fullSync(db, supabase, userId, pdfFolder, imageFolder, saveDir);
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Error: ", error);
        const accessToken = data.session.access_token;
        const refreshToken = data.session.refresh_token;

        //const serverIp = import.meta.env.VITE_SERVER_IP_ADDRESS;
        //const serverPort = import.meta.env.VITE_SERVER_PORT;
        const backendUrl = import.meta.env.VITE_BACKEND_URL;

        const postData = {
            access_token: accessToken,
            refresh_token: refreshToken,
            user_id: userId,
            plan_id: planId,
            priority_limit: 5, // for now, priority limit is not choosable by user
            include_caption: false, // for now, photo captions are not a thing
        }

        try {

            //const response = await fetch(`http://${serverIp}:${serverPort}/generate_report`, {
            const response = await fetch(`${backendUrl}/generate_report`, {
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

                toast.success('Report generated!', {id: 'loading'}); // display success message right before Share sheet, instead of waiting for user to finish interacting with share sheet

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

                toast.success('Report downloaded!', {id: 'loading'});

            }

        } catch (error) {
            toast.error('There was a problem generating the report', {id: 'loading'});
            console.error("Error generating report: ", error);
        }

    }

    return (
        <button type="button" className="accented" onClick={generateReport}>Generate report</button>
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