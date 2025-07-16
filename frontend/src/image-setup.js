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
    });

    if (!(image.format == 'jpeg' || image.format == 'png')) {
        throw new Error('Unsupported image format: ' + image.format);
    }

    return image;

}

export async function saveImage(image, folder, saveDir, supabase=null) { // image is as saved from Camera.getPhoto with resultType: CameraResultType.Uri.

    const extension = image.format == 'jpeg' ? 'jpg' : image.format; // use 'jpg' extension for jpeg format, otherwise use the format as is (e.g. png)
    const desiredName = crypto.randomUUID() + '.' + extension; // unique filename, e.g. '7741B70A-570B-4253-841C-96FC3CF19AC3.jpg';
    
    const response = await fetch(image.webPath);
    const blob = await response.blob();

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
    if (error) console.log('Error getting signed URL: ', error);
    return data.signedUrl;
}
