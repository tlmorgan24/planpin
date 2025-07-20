import Modal from "react-modal";

export default function ConfirmModal({ message='This action is irreversible', isOpen, onConfirm, onCancel }) {

    return (
        <Modal className={{base: 'centre-modal', afterOpen: 'after-open', beforeClose: 'before-close'}} closeTimeoutMS={300} isOpen={isOpen} onRequestClose={onCancel}>
            <h2>Are you sure?</h2>
            <p>{message}</p>
            <div className="big-buttons-container">
                <button onClick={onCancel}>Cancel</button>
                <button className="bad" onClick={onConfirm}>Confirm</button>
            </div>
        </Modal>
    );
}