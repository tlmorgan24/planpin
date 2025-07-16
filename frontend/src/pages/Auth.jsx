import { useContext, useState } from "react";
import { Capacitor } from '@capacitor/core';
import { DbContext, UserContext } from "../main";
import { AppContext } from "../App";
import { fullSync } from "../sync";
import Modal from "react-modal";

export default function Auth() {

    const {db, supabase} = useContext(DbContext); // we are confident db (if mobile) or supabase (if web) exist here, as App.jsx only sends user here if they exist (otherwise sends to loading screen)
    const {setUserId} = useContext(UserContext);
    const {setPdfFolder, setImageFolder} = useContext(AppContext);

    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [authType, setAuthType] = useState(null);

    async function signUp() {
        setAuthType('sign-up');
        setModalIsOpen(true);
    }

    async function logIn() {
        setAuthType('log-in');
        setModalIsOpen(true);
    }

    async function continueAsGuest() {
        setUpUser({userId:'guest', email:null, password:null}, setUserId, setPdfFolder, setImageFolder, db, supabase);
    }

    return(
        <div className="auth-container">
            <button onClick={signUp} style={{position: 'relative', top: '100px'}}>Sign up</button>
            <button onClick={logIn} style={{position: 'relative', top: '100px'}}>Log in</button>
            <button onClick={continueAsGuest} style={{position: 'relative', top: '100px'}}>Continue as guest</button>
            <AuthModal authType={authType} modalIsOpen={modalIsOpen} setModalIsOpen={setModalIsOpen} /> {/* will only be shown when modalIsOpen set to true */}
        </div>
    );

}


function AuthModal({ authType, modalIsOpen, setModalIsOpen }) {

    const {db, supabase} = useContext(DbContext); // we are confident db exists here, as App.jsx only sends user here if db exists (otherwise sends to loading screen)
    const {setUserId} = useContext(UserContext);
    const {setPdfFolder, setImageFolder} = useContext(AppContext);

    // Form values:
    const [formValues, setFormValues] = useState({email: '', password: ''}); // initalise to empty string (not null), so React knows this is a controlled component (recommended for form inputs)

    // Message to give error feedback to user (e.g. weak password):
    const [message, setMessage] = useState(null);
    
    // Whenever we close modal, we want to make sure to reset states so that future clicks will start fresh:
    function closeModal() {
        setFormValues({email: '', password: ''});
        setModalIsOpen(false);
    }

    // When user presses submit, carry out authentication and close form:
    async function handleSubmit(e) {
        
        e.preventDefault();

        let data = null;
        let error = null;

        if (authType === "sign-up") {
            ({data, error} = await supabase.auth.signUp(formValues));
        }
        else if (authType === "log-in") {
            ({data, error} = await supabase.auth.signInWithPassword(formValues));
        }
        else {
            console.log("Invalid authentication type");
            throw new Error("Invalid authentication type")
        }
        if (error) {
            console.log("Error: ", error);
            // Sign-up related errors:
            if (error.code === 'weak_password') {
                setMessage("Weak password. Please choose a stronger password.");
                return;
            }
            else if (error.code === 'email_address_invalid') {
                setMessage("Invalid email address. Please try again.");
                return;
            }
            else if (error.code === 'user_already_exists') {
                setMessage("User already exists. Please log in instead of signing up.");
                return;
            }
            // Login-related errors:
            else if (error.code === 'invalid_credentials') {
                setMessage("Invalid credentials. Please try again.");
                return;
            }
            else if (error.code === 'email_not_confirmed') {
                setMessage("Email not confirmed. Please try again."); // I have currently disabled requirement for email verification, so this will never actually happen
                return;
            }
            else {
                throw error;
            }
        }

        /*
        Note the user set-up (including the inserting into database part) is being run no matter whether signing up 
        or loggin in, as the user may be logging in from a new device or lost their data etc, so there is no 
        guarantee a signed-up user already exists in the local database
        */

        setUpUser({userId: data.user.id, ...formValues}, setUserId, setPdfFolder, setImageFolder, db, supabase)

        closeModal();

    }

    function handleFormChange(event) {
        const { name, value } = event.target;
        setFormValues((prevState) => ({ ...prevState, [name]: value }));
    };

    return(
        <Modal className="modal" isOpen={modalIsOpen} onRequestClose={closeModal}>
            
            <form onSubmit={handleSubmit}>

                {/* Email: */}
                <div className="form-item">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" value={formValues.email} onChange={handleFormChange} />
                </div>

                {/* Password: */}
                <div className="form-item">
                    <label htmlFor="password">Password</label>
                    <input id="password" name="password" type="password" value={formValues.password} onChange={handleFormChange} />
                </div>

                <button type="submit">Submit</button>
                <button type="button" onClick={closeModal}>Cancel</button>

            </form>
            <p>{message}</p>

        </Modal>
    );

}

/*
NB: This function is the "single source of truth" for UserContext and AppContext. It is the only piece of code that
sets the values (apart from saveDir, which is a constant defined in AppProvider):
*/
async function setUpUser(object, setUserId, setPdfFolder, setImageFolder, db, supabase) {

    const platform = Capacitor.getPlatform();
    const { userId, email, password } = object;

    // If user doesn't exist (i.e. user id gives no primary key conflict), create record for it (either way, if on mobile, sync to make sure up to date with cloud):
    if (platform !== 'web') {
        await db.run(`
            INSERT INTO users (id, email, password, created_at, updated_at)
            VALUES (?, ?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
            ON CONFLICT(id) DO NOTHING
        `, [userId, email, password]);
        fullSync(); // note, because we sync here, user's profile will IMMEDIATELY exist in the cloud if the profile has been created on mobile - so below, we won't be creating an updated record due to lack of sync
    }
    else {
        const {error} = await supabase
            .from('users')
            .upsert({
                    id: userId,
                    email,
                    password,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: 'id',
                    ignoreDuplicates: true,
                } // ^ equivalent to ON CONFLICT(id) DO NOTHING (i.e. will NOT update if already exists)
            );
        if (error) console.log("Error: ", error);
        // note, we do not 'sync' if we are already on the web (using the cloud), as the cloud is itself the source of truth. It is up to the mobile to sync with cloud when necessary
    }

    const pdfFolder = `${userId}/pdf`;
    const imageFolder = `${userId}/img`;

    setUserId(userId);
    setPdfFolder(pdfFolder);
    setImageFolder(imageFolder);

}
