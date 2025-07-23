export default function Loading({ message = "Loading..." }) {

    return(
        <div className="loading-container">
            <div className="spinner" />
            {message ? <p>{message}</p> : null}
        </div>
    );

}