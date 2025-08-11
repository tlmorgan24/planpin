import { Link } from "react-router-dom";
import MenuBar from "../MenuBar";

export default function Help() {
    return (
        <div className="help-container">
            <MenuBar />
            <p>
            Example PDF plan used with thanks to <a href="https://commons.wikimedia.org/wiki/File:LEVEL_11_FLOOR_PLAN.pdf">Vivianwwj</a>
            , <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>, via Wikimedia Commons.
            </p>

            <Link to="/"><img className="bottom-logo" src="/logo-text-beside.svg" /></Link>
        </div>
    )
}