import Modal from "react-modal";

export default function ConfirmModal({ message='This action is irreversible', isOpen, onConfirm, onCancel }) {

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onRequestClose={onCancel}>
            <div className="centre-modal">
                <h2>Are you sure?</h2>
                <p>{message}</p>
                <div className="big-buttons-container">
                    <button onClick={onCancel}>Cancel</button>
                    <button className="bad" onClick={onConfirm}>Confirm</button>
                </div>
            </div>
        </Modal>
    );
}