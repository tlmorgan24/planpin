import Modal from 'react-modal';
import { useContext, useState } from 'react';
import { UserContext, DbContext } from './main';
import { AppContext } from './App';
import { logOut, deleteAccount } from "./pages/Auth";
import ConfirmModal from './ConfirmModal';

export default function SettingsModal() {

    const { userId, setUserId, saveDir } = useContext(UserContext);
    const { db, supabase } = useContext(DbContext);
    const { settingsOpen, setSettingsOpen } = useContext(AppContext);

    const [showConfirm, setShowConfirm] = useState(false); // to allow confirmation modal to be shown before deleting account
    const confirmationMessage = 'If you proceed, your account and all its associated data (including PDFs, images and defect information) will be permanently deleted. This action is immediate and irreversible.'

    function closeSettings() {
        setSettingsOpen(false);
    }
    async function logOutUser() {
        await logOut(supabase, setUserId);
    }
    async function deleteUserAccount() {
        setShowConfirm(false);
        await deleteAccount(supabase, db, userId, setUserId, saveDir);
    }

    function onRequestDelete() {
        setShowConfirm(true); // when user clicks "Delete account" button, show confirmation modal
    }
    function onCancelDelete() {
        setShowConfirm(false);
    }

    return (
        <Modal className={{base: 'side-modal', afterOpen: 'after-open', beforeClose: 'before-close'}} closeTimeoutMS={300} isOpen={settingsOpen} onRequestClose={closeSettings}>
            <div className="big-buttons-container">
                <button type="button" onClick={logOutUser}>Log out</button>
                <button type="button" onClick={closeSettings}>Close</button>
                <button type="button" className="bad" onClick={onRequestDelete}>Delete account</button>
            </div>
            <p>
                <a href="/contact">Contact</a><br/>
                <a href="/privacy-policy">Privacy policy</a>
            </p>

            <p>
                Example PDF plan used with thanks to <a href="https://commons.wikimedia.org/wiki/File:LEVEL_11_FLOOR_PLAN.pdf">Vivianwwj</a>
                , <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>, via Wikimedia Commons.
            </p>

            <img className="bottom-logo" src="/src/assets/logo-text-beside.svg" />

            {/* 
            When user clicks "Delete account" button, we show confirmation modal. 
            If user THEN clicks confirm on the confirmation modal, we proceed to delete the account.
            */}
            <ConfirmModal message={confirmationMessage} isOpen={showConfirm} onConfirm={deleteUserAccount} onCancel={onCancelDelete}/>
        </Modal>
    );
}
