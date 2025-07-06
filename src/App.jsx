import { createContext, useState, useContext, useEffect } from 'react';
import { Directory } from '@capacitor/filesystem';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UserContext, DbContext } from './main';
import Home from './pages/home';
import Plan from './pages/plan';
import LoginScreen from './pages/login';
import LoadingScreen from './pages/loading';

// -- CONTEXT VARIABLES --

// Define context object:
export const AppContext = createContext();

// Define context provider:
function AppProvider({children}) {

    const {userId} = useContext(UserContext);

  	const [saveDir, setSaveDir] = useState(Directory.Documents); // root directory to save/load PDFs and images to/from
    const [pdfFolder, setPDFFolder] = useState(undefined); // path from saveDir to folder in/from which to save/load PDFs
    const [imageFolder, setImageFolder] = useState(undefined); // path from saveDir to folder in/from which to save/load images

    // Each user will have their own folder, with one subfolder for PDFs and another for images:
    // If no user is signed in (chooses to continue as guest), the PDF and image folders be nested in a "guest" folder (because userId is set to "guest")
    useEffect(() => {
        if (userId === undefined) return;
        setPDFFolder(`${userId}/pdf`);
        setImageFolder(`${userId}/img`);
    }, [userId]);
  	
	return (
    	<AppContext.Provider value={{
      		saveDir, setSaveDir,
            pdfFolder, setPDFFolder,
            imageFolder, setImageFolder,
    	}}>
      	{children}
    	</AppContext.Provider>
  	);
}


// -- APP --

export default function App() {

    const {db} = useContext(DbContext);
    const {userId, setUserId} = useContext(UserContext);

    if (!db) return <LoadingScreen />;
    if (userId === undefined) return <LoginScreen db={db} setUserId={setUserId} />; // don't show app itself, only login screen, if user not logged in
    // within LoginScreen component, I will update state of userId (using setUserId) once user logs in
    // if user chooses to continue as guest, will set userId to "guest"
    // I will also add record of user to "users" table of database, if doesn't already exist

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