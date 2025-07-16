import { Filesystem } from '@capacitor/filesystem';

// Import pdf.js:
import * as pdfjsLib from "pdfjs-dist";
// Then need to set the worker for pdf.js. Should do below, but couldn't get it to work:
//import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
//pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
// Alternative, which at least allows app to run without error, but gives "setting up fake worker" warning: 
import 'pdfjs-dist/build/pdf.worker';


// ---- GET PDF OBJECTS ----

// Return all PDF filenames in folder of saveDir as array:
// fileNamesFilter, if defined, means only the PDFs in the folder that match a name in fileNamesFilter are returned
export async function getFilenames(folder, saveDir, fileNamesFilter=undefined, extension=undefined) {

    // Get the list of files in the Documents directory:
    ensureFolderExists(folder, saveDir); // create folder if doesn't yet exist (created folder will be empty, so function we are in will ultimately just return an empty object without throwing error)
    const result = await Filesystem.readdir({
        path: folder,
        directory: saveDir
    });
    // ^ Capacitor docs indicate result is an array of strings, but it's actually a more complex object, containing subobjects which I will call readdir file objects.

    // Get file names from result:
    let fileNames = [];
    for (const readdirObject of result.files) { // each of these is a readdir file object with its own properties such as name.
        const fileName = readdirObject.name;
        if ((extension === undefined || fileName.endsWith(extension)) && (fileNamesFilter === undefined || fileNamesFilter.includes(fileName))) { // ignore files not matching the extension or outside the fileNamesFilter (if specified)
            fileNames.push(fileName);
        } 
    }

    return fileNames

}

// Return all PDFs in folder of saveDir as object, with file names as keys and pdf.js pdf objects as values:
// fileNamesFilter, if defined, means only the PDFs in the folder that match a name in fileNamesFilter are returned
// if saveDir is defined, PDFs are obtained from local SQLite storage, otherwise from Supabase storage
export async function getPdfObjects(folder, saveDir, fileNamesFilter=undefined, supabase=null) {

    let fileNames = [];
    if (saveDir) {
        fileNames = await getFilenames(folder, saveDir, fileNamesFilter, '.pdf');
    }
    else {
        fileNames = fileNamesFilter; // if getting from Supabase storage, we assume the fileNamesFilter passed specifies only & all the file names to retrieve
    }

    // Get pdf.js pdf objects from file names, and add former keyed by latter to the object to be returned:
    const pdfObjects = {};
    for (let fileName of fileNames) {
        let pdfData = null; // pdfData will be data as Uint8Array
        if (saveDir) { // get PDF from SQLite local storage
            pdfData = await readPdf(fileName, folder, saveDir); 
        } 
        else { // get PDF from Supabase cloud storage
            if (!supabase) return;
            pdfData = await readPdfFromSupabase(supabase, fileName, folder);
        }
        const pdf = await loadPdf(pdfData); // pdf is pdf.js pdf object
        pdfObjects[fileName] = pdf;
    }

    return pdfObjects;

}

export async function ensureFolderExists(folder, saveDir) {
    try {
        await Filesystem.mkdir({
            path: folder,
            directory: saveDir,
            recursive: true, // if folder path comprises intermediate folders (e.g. "folder/subfolder"), ANY which don't exist are created.
        });
    }
    // mkdir will throw error if folder already exists; in which case we want to ignore the error (we are satisfied the folder already exists):
    catch (err) {
        if (!err.message.includes("exist")) {
            throw err; // only throw the error if it does NOT relate to "already exists", i.e. the message doesn't mention the term "exist".
        }
    }
}
  

// ---- LOAD PDF FILE ----

// Return PDF data as UInt8Array, given Filesystem file path (as name, folder path and directory):
// (Note Uint8Array is data type required by pdf.js, hence our desire to convert)
export async function readPdf(fileName, folder, saveDir) {
    const file = await Filesystem.readFile({ // base64 data by default
        path: `${folder}/${fileName}`,
        directory: saveDir, // read from directory where plans get saved
    });
    const base64Data = file.data;
    return base64ToUint8Array(base64Data);
}

// Convert from base64 to UInt8Array:
function base64ToUint8Array(base64Data) {
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Return PDF data as UInt8Array from Supabase storage:
export async function readPdfFromSupabase(supabase, fileName, folder) {
    const { data, error } = await supabase
        .storage
        .from('user-files')
        .download(`${folder}/${fileName}`);
    if (error) console.log('Download error: ', error);
    const arrayBuffer = await data.arrayBuffer(); // data is blob, need to convert to UInt8Array
    const uint8Array = new Uint8Array(arrayBuffer);
    return uint8Array;
}

// Take PDF data as Uint8Array and return pdf.js pdf object:
export async function loadPdf(fileData) {
    const loadingTask = pdfjsLib.getDocument(fileData); // getDocument takes Uint8Array
    const pdf = await loadingTask.promise;
    return pdf;
}


// ---- SAVE FILE ----

// Save input file to desired folder in saveDir as base64 data:
// Works for both file object (from submission to HTML form) and Blob object.
// If overwrite is true, will overwrite file if it already exists; otherwise, will alter name to prevent overwriting.
export async function saveFile(file, folder, saveDir, desiredName=undefined, overwrite=false) {

    if (desiredName === undefined) {
        desiredName = file.name; // it is assumed, if desiredName not provided, that a file object is being passes as the first argument, which has an existing name property
    }

    // Create folder if doesn't yet exist:
    await ensureFolderExists(folder, saveDir);
    
    // Read the file as base64 (Capacitor requires base64 or UTF8 for Filesystem writeFile):
    const base64Data = await convertToBase64(file);

    if (overwrite) {
        // Immediately save to Capacitor Filesystem (will automatically overwrite if file already exists):
        await Filesystem.writeFile({
            path: `${folder}/${desiredName}`,
            data: base64Data,
            directory: saveDir,
        });
        return desiredName;
    }

    // Ensure name does not match name of any previously saved file (if so, alter name to prevent overwriting):
    let newName = desiredName
    const extension = newName.includes('.') ? newName.slice(newName.lastIndexOf('.')) : '';
    const baseName = newName.slice(0, newName.lastIndexOf('.'));
    let counter = 1;
    while (await fileExists(newName, folder, saveDir)) {
        newName = `${baseName}(${counter})${extension}`;
        counter++;
    }
    if (newName !== desiredName) {
        console.log(`Filename ${desiredName} already exists. Name changed to ${newName}.`)
    }

    // Save to Capacitor Filesystem under non-clashing filename:
    await Filesystem.writeFile({
        path: `${folder}/${newName}`,
        data: base64Data,
        directory: saveDir,
    });

    return newName;

}

// Convert file obtained from pdf submitted to HTML form to base64 data:
// Works for both file object (from submission to HTML form) and Blob object.
export async function convertToBase64(file) {
    // FileReader is async but does not return a promise (unlike async function or Promise); it works with callbacks (e.g. onload allows you to execute code on load).
    // So, need to "promisify" to return what we want from the callback:
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // remove e.g. "data:application/pdf;base64,"
            resolve(base64);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

async function fileExists(fileName, folder, saveDir) {
    try {
        await Filesystem.stat({
            path: `${folder}/${fileName}`,
            directory: saveDir,
        });
        return true;  // file already exists (will need to rename to prevent overwriting)
    } catch {
        return false; // file doesn't yet exist (can save immediately)
    }
}


// ---- DELETE FILE ----

// Delete saved file from Capacitor Filesystem:
export async function removeFile(fileName, folder, saveDir) {

    await Filesystem.deleteFile({
        path: `${folder}/${fileName}`,
        directory: saveDir,
    });

}


// ---- EXPORT FILE ----

// Return data as blob, given file path (as name, folder path and directory):
// (Note blob is data type required by supabase, hence our desire to convert)
// mimeType input should be 'application/pdf' for PDFs and 'image/jpeg' for images
export async function readAsBlob(fileName, folder, saveDir, mimeType) {
    
    const file = await Filesystem.readFile({ // base64 data by default
        path: `${folder}/${fileName}`,
        directory: saveDir, // read from directory where plans get saved
    });
    const base64Data = file.data;

    const byteCharacters = atob(base64Data); // file.data is base64 string
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);

        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: mimeType });

}