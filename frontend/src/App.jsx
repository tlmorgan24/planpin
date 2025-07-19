import { useState, useContext, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UserContext, DbContext } from './main';
import { setUpUser } from './pages/Auth';
import Home from './pages/Home';
import Plan from './pages/Plan';
import Auth from './pages/Auth';
import Loading from './pages/Loading';

// -- APP --

export default function App() {

    const {db, supabase} = useContext(DbContext);
    const {userId, setUserId, setPdfFolder, setImageFolder, saveDir} = useContext(UserContext);
    const [checkedSession, setCheckedSession] = useState(false); // so that nothing will be rendered until we have checked for any previously saved session

    // Check for previously saved session:
    useEffect(() => {
        async function func() {
            if (!supabase) return;
            const {data, error} = await supabase.auth.getSession();
            if (error) console.error("Error: ", error);
            if (data && data.session) { // previously saved session, so just have to set up user directly from this, and can continue to usual Home screen (below)

                const object = {userId: data.session.user.id, email:data.session.user.email, password:''} // note, email and password don't matter anyway, as we won't be inserting a new record, as we know user already exists
                await setUpUser(object, setUserId, setPdfFolder, setImageFolder, saveDir, db, supabase);
                // ^ as part of this, user ID will be set to saved defined value, so will bypass authentication screen
            }
            // Else, no previously saved session, so leave userId as-is (undefined); will take user to authentication screen
            setCheckedSession(true);
        }
        func();
    }, [supabase])

    let content = <Loading />;

    if (checkedSession && supabase && (Capacitor.getPlatform() === 'web' || db)) { // make sure we wait for SQLite or Supabase database clients to initialise (both required for mobile app; only Supabase required for web).
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
        else {
            content = (
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/plan" element={<Plan />} />
                    </Routes>
                </BrowserRouter>
            );
        }
    }

    return (
        <>
            {content}
            <Toaster position="bottom-center" richColors /> {/* for easy pop-ups for loading, confirmation, etc */}
        </>
    );
}