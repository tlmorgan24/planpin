import { useState, useContext, useEffect, createContext } from 'react';
import { Capacitor } from '@capacitor/core';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UserContext, DbContext } from './main';
import { setUpUser } from './pages/Auth';
import Home from './pages/Home';
import Plan from './pages/Plan';
import Auth from './pages/Auth';
import Loading from './pages/Loading';
import Contact from './pages/Contact';
import PrivacyPolicy from './pages/PrivacyPolicy';
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
    const {userId, setUserId, setPdfFolder, setImageFolder, saveDir} = useContext(UserContext);
    const [checkedSession, setCheckedSession] = useState(false); // so that nothing will be rendered until we have checked for any previously saved session

    // Check for previously saved session:
    useEffect(() => {
        async function func() {
            if (!supabase) return;
            const {data, error} = await supabase.auth.getSession(); // note session has already been set if previously saved (in supabase.js for native mobile using Capacitor storage, and automatically on web using IndexedDB)
            if (error) console.error("Error: ", error);
            if (data && data.session) { // previously saved session exists and is still valid (i.e. not expired token or deleted user etc), so can set up user directly from this, and then continue to usual Home screen (below)
                await setUpUser('log-in', {userId: data.session.user.id}, setUserId, setPdfFolder, setImageFolder, saveDir, db, supabase);
                // ^ as part of this, user ID will be set to saved defined value, so will bypass authentication screen
            }
            // Else, no previously saved session, so do nothing and leave userId as-is (undefined); will end up taking user to authentication screen
            setCheckedSession(true);
        }
        func();
    }, [supabase])

    let content = <Loading />;

    // Make sure we wait for SQLite or Supabase database clients to initialise (both required for mobile app; only Supabase required for web):
    if (!checkedSession || !supabase || (Capacitor.getPlatform() !== 'web' && !db)) {
        return <Loading />;
    }
        if (userId === undefined) { // user has neither signed in, nor chosen to continue as guest yet. We have already checked to see if there is previously saved session (there isn't one), so take user to login screen.
            content = (
                <Auth />
            );
        }
    /* 
    Within Auth component, I will update state of userId (using setUserId) once user logs in.
    If user chooses to continue as guest, will set userId to "guest". I will also add record of user to "users" 
    table of database, if doesn't already exist. Finally, I will clean up old deleted files (which have been marked 
    as deleted for more than 14 days AND SYNCED WITH CLOUD DATABASE OR WHERE USER IS GUEST, so can be fully hard deleted).
    */

    return (
        <>
            <AppProvider>
                <BrowserRouter>
                    <Routes>
                        {/* if user not signed in or guest, Home and Plan pages are inaccessible, and Auth page is shown instead: */}
                        {userId === undefined ? 
                            <Route path="*" element={<Auth />} />
                            : 
                            <>
                                <Route path="/" element={<Home />} />
                                <Route path="/plan" element={<Plan />} />
                            </>
                        }
                        {/* Contact and Privacy Policy pages accessible regardless: */}
                        <Route path="/contact" element={<Contact />} />
                        <Route path="/privacy-policy" element={<PrivacyPolicy />} /> 
                    </Routes>
                    {userId === undefined ? 
                        null
                        :
                        <>
                            <SettingsModal />
                            <CategoriesModal />
                        </>
                    }
                </BrowserRouter>
            </AppProvider>
            <Toaster position="bottom-center" richColors /> {/* for easy pop-ups for loading, confirmation, etc */}
        </>
    );
}