import { createContext, useState, useEffect } from 'react'
import Home from './pages/home'
import Plan from './pages/plan'
import { Directory } from '@capacitor/filesystem';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// -- CONTEXT VARIABLES --

// Define context object:
export const AppContext = createContext();

// Define context provider:
function AppProvider({children}) {

  	const [saveDir, setSaveDir] = useState(Directory.Documents); // root directory to save/load PDFs and images to/from
    const [pdfFolder, setPDFFolder] = useState("pdf"); // path from saveDir to folder in/from which to save/load PDFs
    const [imageFolder, setImageFolder] = useState("img"); // path from saveDir to folder in/from which to save/load images
  	
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