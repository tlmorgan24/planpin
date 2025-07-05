import { StrictMode, createContext, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initDb } from './database.js';


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
        <DbProvider>
            <App />
        </DbProvider>
    </StrictMode>,
);
