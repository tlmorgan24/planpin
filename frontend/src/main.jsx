import { StrictMode, createContext, useState, useEffect } from 'react';
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
    
    return (
        <UserContext.Provider value={{
            userId, setUserId
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
            const supabase = await initSupabase();
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


// -- APP --
Modal.setAppElement('#root'); // so any modals in the app can properly hide non-modal part of app from screen readers when modal open
createRoot(document.getElementById('root')).render(
    <StrictMode>
        <UserProvider>
            <DbProvider>
                <App />
            </DbProvider>
        </UserProvider>
    </StrictMode>,
);
