import { createContext, useState, useContext } from 'react';
import { Directory } from '@capacitor/filesystem';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UserContext, DbContext } from './main';
import Home from './pages/Home';
import Plan from './pages/Plan';
import Auth from './pages/Auth';
import Loading from './pages/Loading';

// -- CONTEXT VARIABLES --

// Define context object:
export const AppContext = createContext();

// Define context provider:
function AppProvider({children}) {

  	const [saveDir, setSaveDir] = useState(Directory.Documents); // root directory to save/load PDFs and images to/from
    const [pdfFolder, setPdfFolder] = useState(undefined); // path from saveDir to folder in/from which to save/load PDFs
    const [imageFolder, setImageFolder] = useState(undefined); // path from saveDir to folder in/from which to save/load images

    /* 
    Each user will have their own folder, with one subfolder for PDFs and another for images. If no user is 
    signed in (chooses to continue as guest), the PDF and image folders be nested in a "guest" folder 
    (because userId is set to "guest").
    */

    // Values will be set on login within Auth.jsx (Auth.jsx is single source of truth for userId, pdfFolder and imageFolder).
  	
	return (
    	<AppContext.Provider value={{
      		saveDir, setSaveDir,
            pdfFolder, setPdfFolder,
            imageFolder, setImageFolder,
    	}}>
      	{children}
    	</AppContext.Provider>
  	);
}


// -- APP --

export default function App() {

    const {db} = useContext(DbContext);
    const {userId} = useContext(UserContext);

    if (!db) return <Loading />;
    if (userId === undefined) { // user has neither signed in, nor chosen to continue as guest yet. Must take them to login screen.
        return(
            <AppProvider>
                <Auth /> {/* still wrap in AppProvider, as Auth screen requires AppContext to set pdfFolder etc. based off obtained userId */}
            </AppProvider>
        );
    } 
    /* 
    Within Auth component, I will update state of userId (using setUserId) once user logs in.
    If user chooses to continue as guest, will set userId to "guest". I will also add record of user to "users" 
    table of database, if doesn't already exist. Finally, I will clean up old deleted files (which have been marked 
    as deleted for more than 14 days AND SYNCED WITH CLOUD DATABASE OR WHERE USER IS GUEST, so can be fully hard deleted).
    */

	return (
        <AppProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/plan" element={<Plan />} />
                </Routes>
            </BrowserRouter>
        </AppProvider>
	);
}