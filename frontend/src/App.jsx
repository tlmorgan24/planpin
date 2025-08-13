import { useState, useContext, useEffect, createContext } from 'react';
import { Capacitor } from '@capacitor/core';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { UserContext, DbContext } from './main';
import { setUpUser } from './pages/Auth';
import Home from './pages/Home';
import Plan from './pages/Plan';
import Auth from './pages/Auth';
import Loading from './pages/Loading';
import Contact from './pages/Contact';
import Help from './pages/Help';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Pricing from './pages/Pricing';
import SettingsModal from './SettingsModal';
import { CategoriesModal } from './categories';


// -- CONTEXT VARIABLES --

// Define context object:
export const AppContext = createContext();

// Define context provider:
function AppProvider({children}) {

    const [settingsOpen, setSettingsOpen] = useState(false); // to allow "settings" modal to pop out when desired
    const [categoriesOpen, setCategoriesOpen] = useState(false); // to allow "manage categories" modal to pop out when desired
    const [categoryOptionsData, setCategoryOptionsData] = useState([]); // options for category data to assign to marker (populated based off categories table of database for this user). Array of objects, each with an id, category_name and color property

    return (
        <AppContext.Provider value={{
            settingsOpen, setSettingsOpen,
            categoriesOpen, setCategoriesOpen,
            categoryOptionsData, setCategoryOptionsData,
        }}>
        {children}
        </AppContext.Provider>
    );
}


// -- APP --

export default function App() {

    const {db, supabase} = useContext(DbContext);
    const {userId, setUserId, setPdfFolder, setImageFolder, saveDir, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle} = useContext(UserContext);
    const [checkedSession, setCheckedSession] = useState(false); // so that nothing will be rendered until we have checked for any previously saved session

    // Check for previously saved session:
    useEffect(() => {
        async function func() {
            if (!supabase) return;
            if (userId) {
                setCheckedSession(true);
                return;
                // ^ marking session as "checked" and returning if userId already defined prevents setUpUser running every time user e.g. goes from Home screen to Contact screen
            }
            const {data, error} = await supabase.auth.getSession(); // note session has already been set if previously saved (in supabase.js for native mobile using Capacitor storage, and automatically on web using IndexedDB)
            if (error) console.error("Error: ", error);
            if (data && data.session) { // previously saved session exists and is still valid (i.e. not expired token or deleted user etc), so can set up user directly from this, and then continue to usual Home screen (below)
                await setUpUser(true, 'log-in', {userId: data.session.user.id, email: data.session.user.email}, setUserId, setPdfFolder, setImageFolder, saveDir, db, supabase, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle); 
                // ^ passing "true" for "fromCache" variable, meaning we can forego database updates and therefore do not require internet connection
                // ^ not passing "setLoading", as loading screen already being handled here
            }
            // Else, no previously saved session, so do nothing and leave userId as-is (undefined); will end up taking user to authentication screen
            setCheckedSession(true);
        }
        func();
    }, [supabase])
    
    /* 
    Within Auth component, I will update state of userId (using setUserId) once user logs in.
    If user chooses to continue as guest, will set userId to "guest". I will also add record of user to "users" 
    table of database, if doesn't already exist. Finally, I will clean up old deleted files (which have been marked 
    as deleted for more than 14 days AND SYNCED WITH CLOUD DATABASE OR WHERE USER IS GUEST, so can be fully hard deleted).
    */

    return (
        <>
            {/* Show loading screen while waiting for SQLite or Supabase database clients to initialise (both required for mobile app; only Supabase required for web): */}
            {(!checkedSession || !supabase || (Capacitor.getPlatform() !== 'web' && !db)) ?
                <Loading message="Setting up..." />
            : (
                <AppProvider>
                    <BrowserRouter>
                        <ScrollToTop /> {/* scroll reset on route change */}
                        <Routes>
                            {/* if user not signed in or guest, Home and Plan pages are inaccessible, and Auth page is shown instead: */}
                            {/* note "*" path means all paths NOT in route (i.e. all paths except contact, privacy-policy and pricing) will go to auth screen */}
                            {userId === undefined ? 
                                <Route path="*" element={<Auth />} />
                                : 
                                <>
                                    <Route path="/" element={<Home />} />
                                    <Route path="/plan" element={<Plan />} />
                                </>
                            }
                            {/* Help, Contact, Privacy Policy and Pricing pages accessible regardless: */}
                            <Route path="/help" element={<Help />} />
                            <Route path="/contact" element={<Contact />} />
                            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                            <Route path="/pricing" element={<Pricing />} />
                        </Routes>
                        {/* Modals and Toaster within router so can contain links to other pages etc: */}
                        {userId === undefined ? 
                            null
                            :
                            <>
                                <SettingsModal />
                                <CategoriesModal />
                            </>
                        }
                        <Toaster position="bottom-center" richColors /> {/* for easy pop-ups for loading, confirmation, etc (same toaster for both loading screen and main app) */}
                    </BrowserRouter>
                </AppProvider>
            )}
        </>
    );
}

function ScrollToTop() {
    const { pathname } = useLocation();
    // On change of pathname (i.e. navigating to different page):
    useEffect(() => {
        window.scrollTo(0, 0); // scroll to top of window
        // note, there is no way to reset zoom (without full refresh) if user has manually zoomed in on browser, but at least this won't be an issue on mobile app, as user can't zoom
    }, [pathname]);
    return null;
}