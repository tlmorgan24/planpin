import { StrictMode, createContext, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { initDb } from './database.js';


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

    const [db, setDb] = useState(null); // database

    useEffect(() => {
        async function func() {
            const database = await initDb();
            setDb(database);
        }
        func();
    }, []); // no deps: run only once on start up
    
    return (
        <DbContext.Provider value={{
            db
        }}>
        {children}
        </DbContext.Provider>
    );
}


// -- APP --

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <UserProvider>
            <DbProvider>
                <App />
            </DbProvider>
        </UserProvider>
    </StrictMode>,
);
