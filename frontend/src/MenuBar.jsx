import { useContext } from "react";
import { Link } from 'react-router-dom';
import { AppContext } from "./App";
import { UserContext } from "./main";

export default function MenuBar() {
    const {userId} = useContext(UserContext);
    return (
        <div className="menu-bar">
            <HelpButton />
            <HomeButton />
            {userId ? <SettingsButton /> : null} {/* don't show settings button if no user signed in, as Settings only really serves to allow log out and account deletion */}
        </div>
    );
}

// I am making these "buttons" <Link> elements so they are styled as <a> elements (hyperlinks).
// Note we should use <Link> instead of <a> to preserve state and prevent full app reload

function HelpButton() {
    return(
        <Link to='/help'>Help</Link>
    );
}

export function HomeButton() {
    return(
        <Link to='/'>Home</Link>
    );
}

function SettingsButton() {
    const {setSettingsOpen} = useContext(AppContext);
    function handleClick(e) {
        e.preventDefault(); // prevent default behaviour (would navigate to "#", meaning top of page)
        setSettingsOpen(true);
    }
    return(
        <a href="#" onClick={handleClick}>Settings</a>
    );
}