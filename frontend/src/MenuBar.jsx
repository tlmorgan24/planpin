import { useContext } from "react";
import { useNavigate } from "react-router-dom";
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

function HelpButton() {
    const navigate = useNavigate()
    function handleClick() {
        navigate('/help'); // Route to Help page as defined in App.jsx
    }
    return(
        <button type="button" onClick={handleClick}>Help</button>
    );
}

export function HomeButton() {
    const navigate = useNavigate()
    function handleClick() {
        navigate('/'); // Route to Home page as defined in App.jsx (will route to Auth page is userId not defined, as "/" will not be found as a route and will default to "*", which is assigned to Auth)
    }
    return(
        <button type="button" onClick={handleClick}>Home</button>
    );
}

function SettingsButton() {
    const {setSettingsOpen} = useContext(AppContext);
    function handleClick() {
        setSettingsOpen(true);
    }
    return(
        <button type="button" onClick={handleClick}>Settings</button>
    );
}