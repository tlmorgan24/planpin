import { Capacitor } from '@capacitor/core'; 
import { Browser } from '@capacitor/browser';

// Hyperlink to open new browser window with requested page (if used href directly, it may try to open in the app webview itself instead of new Safari tab):
export default function ExternalLink({children, url, color=undefined}) {

    function handleClick(e) {
        e.preventDefault(); // prevent default behaviour (would navigate to "#", meaning top of page)
        if (Capacitor.isNativePlatform()) { // on native mobile
            Browser.open({ url });
        } 
        else { // on web
            window.open(url, "_blank", "noopener,noreferrer");
        }
    }

    return (
        <a
        href="#"
        style={{color: color}}
        onClick={handleClick}
        >
            {children}
        </a>
    )

}