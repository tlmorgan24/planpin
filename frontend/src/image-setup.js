import { Filesystem } from '@capacitor/filesystem';
import { Camera, CameraResultType } from '@capacitor/camera';
import { saveFile } from './pdf-setup';
import { saveBlobToSupabase } from './sync';

export async function captureImage() {
    
    // Capture/select image:
    const image = await Camera.getPhoto({
        resultType: CameraResultType.Uri, // could get Base64 data with .Base64, but leaves out other necessary properties (e.g. path). Will convert to base64 manually later.
        //source: CameraSource.Camera, // this would only use the camera to take a photo; leaving blank means options for both photo and library image
        //quality: 90, // this would set image quality (0-100, higher being better quality). Optional, for now leave it out.
        //allowEditing: true, // this would allow user to make small edits to captured image (only if just-captured photo, not possible if photo from library). But, doesn't work well; best to leave it out.
        webUseInput: true, // use standard HTML file input if on web
    });

    const response = await fetch(image.webPath);
    const blob = await response.blob();
    const resizedBlob = await downsizeBlob(blob, 2048); // scale down so longer dimension is max 2048 pixels

    return resizedBlob;

}

// Reduce image size to save storage:
async function downsizeBlob(blob, maxDim) {
    
    const img = new Image();
    img.src = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });

    let width = img.width;
    let height = img.height;

    if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
    } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
    }
    // Else, image is smaller than maxDim, so maintain original dimensions.

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");    
    ctx.drawImage(img, 0, 0, width, height);

    const resizedBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
            if (!b) return reject("Failed to create resized blob");
            resolve(b);
        }, "image/jpeg", 0.8); // 0.8 for some additional hardly-noticeable compression
    });

    URL.revokeObjectURL(img.src); // have to manually release memory allocated by createObjectURL

    return resizedBlob;

}


export async function saveImage(blob, folder, saveDir, supabase=null) {

    const format = blob.type.split("/")[1]; // e.g. 'jpeg' or 'png'
    const extension = format == 'jpeg' ? 'jpg' : format; // use 'jpg' extension for jpeg format, otherwise use the format as is (e.g. png)
    const desiredName = crypto.randomUUID() + '.' + extension; // unique filename, e.g. '7741B70A-570B-4253-841C-96FC3CF19AC3.jpg';

    let newName;
    if (saveDir) {
        newName = await saveFile(blob, folder, saveDir, desiredName)
    }
    else {
        newName = await saveBlobToSupabase(supabase, blob, desiredName, folder, 'image/jpeg')
    }

    return newName;

}

// img src cannot directly point to Filesystem location. We will want a Uri compatible with img src:
export async function getImageUri(fileName, folder, saveDir) {
    const file = await Filesystem.readFile({ // base64 data by default
        path: `${folder}/${fileName}`,
        directory: saveDir, // read from directory where plans get saved
    });
    const base64Data = file.data;
    let mimeType = 'image/jpeg'; // default
    if (fileName.endsWith('jpg') || fileName.endsWith('jpeg')) {
        mimeType = 'image/jpeg';
    } else if (fileName.endsWith('png')) {
        mimeType = 'image/png';
    }
    return `data:${mimeType};base64,${base64Data}`;
}

// For supabase, createSignedUrl method is already provided, so less conversion needed:
export async function getSupabaseImageUri(supabase, fileName, folder) {
    const { data, error } = await supabase.storage
        .from('user-files')
        .createSignedUrl(`${folder}/${fileName}`, 3600); // valid for 1 hour
    if (error) console.error('Error getting signed URL: ', error);
    return data.signedUrl;
}
