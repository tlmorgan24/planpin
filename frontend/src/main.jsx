import { StrictMode, createContext, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory } from '@capacitor/filesystem';
import Modal from 'react-modal';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { initDb } from './database.js';
import { initSupabase } from './supabase.js';


// -- USER AUTHENTICATION CONTEXT --

// Define context object:
export const UserContext = createContext();

// Define context provider:
function UserProvider({children}) {

    const [userId, setUserId] = useState(undefined); // will be user's actual ID from Supabase authentication in login screen, called in App.jsx
    // userId is set to undefined if app is still loading; "guest" if loaded but user has decided to continue as guest, and string user ID if user signed in.
    
    let saveDirectory = null;
    if (Capacitor.getPlatform() !== 'web') {
        saveDirectory = Directory.Data;
    }
    const [saveDir, setSaveDir] = useState(saveDirectory); // root directory of local Filesystem to save/load PDFs and images to/from (null if on web; will save/load directly to Supabase user-files bucket)
    const [pdfFolder, setPdfFolder] = useState(undefined); // path from saveDir to folder in/from which to save/load PDFs
    const [imageFolder, setImageFolder] = useState(undefined); // path from saveDir to folder in/from which to save/load images

    /* 
    Each user will have their own folder, with one subfolder for PDFs and another for images. If no user is 
    signed in (chooses to continue as guest), the PDF and image folders be nested in a "guest" folder 
    (because userId is set to "guest").
    */

    // Quotas to be set based on subscription plan:
    const [subscriptionTier, setSubscriptionTier] = useState(undefined);
    const [allowedPlans, setAllowedPlans] = useState(undefined);
    const [allowedMarkers, setAllowedMarkers] = useState(undefined);
    const [allowedImages, setAllowedImages] = useState(undefined);
    const [allowedReportsThisBillingCycle, setAllowedReportsThisBillingCycle] = useState(undefined);

    // All values will be set on login within Auth.jsx (Auth.jsx is single source of truth, except for saveDir which just uses the initial value set here).

    return (
        <UserContext.Provider value={{
            userId, setUserId,
            pdfFolder, setPdfFolder,
            imageFolder, setImageFolder,
            saveDir, setSaveDir,
            subscriptionTier, setSubscriptionTier,
            allowedPlans, setAllowedPlans,
            allowedMarkers, setAllowedMarkers,
            allowedImages, setAllowedImages,
            allowedReportsThisBillingCycle, setAllowedReportsThisBillingCycle,
        }}>
        {children}
        </UserContext.Provider>
    );
}


// -- DATABASE CONTEXT --

// Define context object:
export const DbContext = createContext();

// Define context provider:
function DbProvider({children}) {

    const [db, setDb] = useState(null); // local SQLite database
    const [supabase, setSupabase] = useState(null); // cloud Supabase database

    useEffect(() => {
        async function func() {
            const database = await initDb();
            const supabase = await initSupabase(setSupabase); // we retrieve the initialised supabase object if connected to network, but otherwise pass setSupabase for a network listener to set supabase when back online
            setDb(database);
            setSupabase(supabase);
        }
        func();
    }, []); // no deps: run only once on start up
    
    return (
        <DbContext.Provider value={{
            db,
            supabase,
        }}>
        {children}
        </DbContext.Provider>
    );
}


// -- PROGRESS CONTEXT (progress tracking for long operations, mainly sync) --

// Define context object:
export const ProgressContext = createContext();

// Define context provider:
function ProgressProvider({children}) {

    const [stage, setStage] = useState(null); // current stage the progress relates to (e.g. "Retrieving images"). Null means do not show a stage.
    const [progress, setProgress] = useState(null); // progress of current stage, where 0 means starting and 1 means finished (will be converted to percentage for displaying). Null means do not show progress indicator.
    
    return (
        <ProgressContext.Provider value={{
            stage, setStage,
            progress, setProgress,
        }}>
        {children}
        </ProgressContext.Provider>
    );
}


// -- SAFE AREA (to avoid notch etc.) --

export const SafeAreaContainer = ({ children }) => (
    <div className="safe-area-container">
        {children}
    </div>
);

// -- APP --
Modal.setAppElement('#root'); // so any modals in the app can properly hide non-modal part of app from screen readers when modal open
createRoot(document.getElementById('root')).render(
    <StrictMode>
        <ProgressProvider>
            <UserProvider>
                <DbProvider>
                    <SafeAreaContainer>
                        <App />
                    </SafeAreaContainer>
                </DbProvider>
            </UserProvider>
        </ProgressProvider>
    </StrictMode>,
);
