export default function Loading({ message = "Loading..." }) {

    return(
        <div className="loading-container">
            <p>{message}</p>
        </div>
    );

}