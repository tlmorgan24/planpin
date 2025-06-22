import { Filesystem } from '@capacitor/filesystem';
import { Camera, CameraResultType } from '@capacitor/camera';
import { ensureFolderExists, convertToBase64 } from './pdf-setup';

export async function captureImage() {
    
    // Capture/select image:
    const image = await Camera.getPhoto({
        resultType: CameraResultType.Uri, // could get Base64 data with .Base64, but leaves out other necessary properties (e.g. path). Will convert to base64 manually later.
        // source: CameraSource.Camera, // this would only use the camera to take a photo; leaving blank means options for both photo and library image
        // quality: 90, // this would set image quality (0-100, higher being better quality). Optional, for now leave it out.
    });

    if (!(image.format == 'jpeg' || image.format == 'png')) {
        throw new Error('Unsupported image format: ' + image.format);
    }

    return image;

}

export async function saveImage(image, folder, saveDir) { // image is as saved from Camera.getPhoto with resultType: CameraResultType.Uri.

    await ensureFolderExists(folder, saveDir);
    
    // convert image to base64 data:
    const response = await fetch(image.webPath);
    const blob = await response.blob();
    const base64Data = await convertToBase64(blob); // same function as used in pdf-setup.jsx
    
    // save:
    const extension = image.format == 'jpeg' ? 'jpg' : image.format; // use 'jpg' for jpeg format, otherwise use the format as is (e.g. png)
    const fileName = crypto.randomUUID() + '.' + extension; // unique filename, e.g. '7741B70A-570B-4253-841C-96FC3CF19AC3.jpg';
    await Filesystem.writeFile({
        path: `${folder}/${fileName}`,
        data: base64Data, // base64 data of the image (writeFile expects base64 data by default)
        directory: saveDir,
    });

    return fileName;

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
