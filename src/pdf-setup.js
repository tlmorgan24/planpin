import { Filesystem } from '@capacitor/filesystem';

// Import pdf.js:
import * as pdfjsLib from "pdfjs-dist";
// Then need to set the worker for pdf.js. Should do below, but couldn't get it to work:
//import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
//pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
// Alternative, which at least allows app to run without error, but gives "setting up fake worker" warning: 
import 'pdfjs-dist/build/pdf.worker';


// ---- GET PDF OBJECTS ----

// Return all PDFs in folder of saveDir as object, with file names as keys and pdf.js pdf objects as values:
export async function getAllPDFObjects(folder, saveDir) {

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
        if (readdirObject.name.endsWith('.pdf')) { // ignore non-PDF files
            fileNames.push(readdirObject.name);
        } 
    }

    // Get pdf.js pdf objects from file names, and add former keyed by latter to the object to be returned:
    const pdfObjects = {};
    for (let fileName of fileNames) {
        const pdfData = await readPDF(fileName, folder, saveDir); // pdfData is data as Uint8Array
        const pdf = await loadPDF(pdfData); // pdf is pdf.js pdf object
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

// Return PDF data as UInt8Array, given file path (as name, folder path and directory):
// (Note Uint8Array is data type required by pdf.js, hence our desire to convert)
export async function readPDF(fileName, folder, saveDir) {
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

// Take PDF data as Uint8Array and return pdf.js pdf object:
export async function loadPDF(fileData) {
    const loadingTask = pdfjsLib.getDocument(fileData); // getDocument takes Uint8Array
    const pdf = await loadingTask.promise;
    return pdf;
}


// ---- SAVE PDF FILE ----

// Save input file (obtained from pdf submitted to HTML form) to desired folder in saveDir as base64 data:
export async function saveFile(file, folder, saveDir) {

    // Create folder if doesn't yet exist:
    await ensureFolderExists(folder, saveDir);
    
    // Read the file as base64 (Capacitor requires base64 or UTF8 for Filesystem writeFile):
    const base64Data = await convertToBase64(file);

    // Ensure name does not match name of any previously saved pdf (if so, alter name to prevent overwriting):
    let newName = file.name
    const baseName = newName.slice(0, -4); // without .pdf extension
    let counter = 1;
    while (await fileExists(newName, folder, saveDir)) {
        newName = `${baseName}(${counter}).pdf`;
        counter++;
    }
    if (newName !== file.name) {
        console.log(`Filename ${file.name} already exists. Name changed to ${newName}.`)
    }

    // Save to Capacitor Filesystem:
    await Filesystem.writeFile({
        path: `${folder}/${newName}`,
        data: base64Data,
        directory: saveDir,
    });
}

// Convert file obtained from pdf submitted to HTML form to base64 data:
export async function convertToBase64(file) {
    // FileReader is async but does not return a promise (unlike async function or Promise); it works with callbacks (e.g. onload allows you to execute code on load).
    // So, need to "promisify" to return what we want from the callback:
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // remove "data:application/pdf;base64,"
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