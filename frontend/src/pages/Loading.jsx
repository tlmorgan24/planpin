import { useContext } from "react";
import { ProgressContext } from "../main";

export default function Loading({ message="Loading..." }) {

    const {stage, progress} = useContext(ProgressContext);

    return(
        <div className="loading-container">
            <div className="spinner" />
            {message ? <p>{message}</p> : null}
            {stage ? <p>{stage}...{progress ? ` ${ (progress*100).toFixed(0) }% complete` : null}</p> : null}
        </div>
    );

}