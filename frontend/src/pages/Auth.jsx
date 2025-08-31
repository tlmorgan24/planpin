import { useContext, useState } from "react";
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { Link } from "react-router-dom";
import { DbContext, UserContext, ProgressContext } from "../main";
import { syncAndRefresh, wipeAll } from "../sync";
import { initPurchases } from "./Pricing";
import Loading from "./Loading";
import Modal from "react-modal";
import { checkConnection } from "../network";
import ExternalLink from "../ExternalLink";

export default function Auth() {

    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [loading, setLoading] = useState(false); // to show loading spinner when waiting for sync etc to complete on log-in
    const [authType, setAuthType] = useState(null);

    async function signUp() {
        setAuthType('sign-up');
        setModalIsOpen(true);
    }

    async function logIn() {
        setAuthType('log-in');
        setModalIsOpen(true);
    }

    // Note, I have removed "continue as guest" option for now. It would require something like this, with the relevant inputs taken from DbContext and UserContext:
    /*
    async function continueAsGuest() {
        setUpUser(<inputs>);
    }
    */

    return(
        loading ? <Loading message="Setting up..." /> :
        <div className="auth-container">
            <h1>Welcome to PlanPin</h1>
            <div className='big-buttons-container'>
                <button onClick={signUp}>Sign up</button>
                <button onClick={logIn}>Log in</button>
                {/* I am removing the "continue as guest" option for now:
                {Capacitor.getPlatform() !== 'web' ? 
                    <>
                    <button className="big-button" onClick={continueAsGuest}>Continue as guest</button>
                    <p>If you continue as guest, you will not be able to sync to cloud or generate reports</p>
                    </>
                : null}
                */}
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: '12px' }}>
                <li style={{ marginBottom: "6px" }}>
                    <Link to="/help">How to use PlanPin</Link>
                </li>
                <li>
                    <Link to="/pricing">Subscription plans</Link>
                </li>
                <li style={{ marginBottom: "6px" }}>
                    <Link to="/contact">Contact</Link>
                </li>
                <li>
                    <Link to="/privacy-policy">Privacy policy</Link>
                </li>
                <li>
                    <ExternalLink url="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">
                        Terms of use
                    </ExternalLink>
                </li>
            </ul>

            <img className="bottom-logo" src="/logo-text-beside.svg" />
            <AuthModal authType={authType} modalIsOpen={modalIsOpen} setModalIsOpen={setModalIsOpen} setLoading={setLoading} /> {/* will only be shown when modalIsOpen set to true */}
        </div>
    );

}


function AuthModal({ authType, modalIsOpen, setModalIsOpen, setLoading }) {

    const {db, supabase} = useContext(DbContext); // we are confident db exists here, as App.jsx only sends user here if db exists (otherwise sends to loading screen)
    const {setUserId, setPdfFolder, setImageFolder, saveDir, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle} = useContext(UserContext);
    const {setStage, setProgress} = useContext(ProgressContext);

    // Initalise form inputs to empty string (not null), so React knows this is a controlled component (recommended for form inputs):
    const emptyFormValues = {email: '', password: '', company: ''}; // note, company is a relic from when I thought it would be good to know; no longer included in form
    const [formValues, setFormValues] = useState(emptyFormValues);
    
    // Whenever we close modal, we want to make sure to reset states so that future clicks will start fresh:
    function closeModal() {
        setFormValues(emptyFormValues);
        setModalIsOpen(false);
    }

    // When user presses submit, carry out authentication and close form:
    async function handleSubmit(e) {
        
        e.preventDefault();

        const hasConnection = await checkConnection();
        if (!hasConnection) {
            toast.error('Please connect to the internet to sign up/in. Once signed in, you can use certain features offline.');
            return;
        }

        const { company, ...rest } = formValues; // remove company property if exists, as not relevant to supabase.auth methods
        let data = null;
        let error = null;

        if (authType === "sign-up") {
            ({data, error} = await supabase.auth.signUp(rest));
        }
        else if (authType === "log-in") {
            ({data, error} = await supabase.auth.signInWithPassword(rest));
        }
        else {
            console.error("Invalid authentication type");
        }
        if (error) {
            console.error("Error: ", error);
            // Sign-up related errors:
            if (error.code === 'weak_password') {
                toast.info("Weak password. Please choose a stronger password.");
                return;
            }
            else if (error.code === 'email_address_invalid') {
                toast.info("Invalid email address. Please try again.");
                return;
            }
            else if (error.code === 'user_already_exists') {
                toast.info("User already exists. If you have signed up before, please go back and select \"Log in\" instead of \"Sign up\".");
                return;
            }
            // Login-related errors:
            else if (error.code === 'invalid_credentials') {
                toast.error("Invalid credentials. Please try again, or if you are new, go back and select \"Sign up\" instead of \"Log in\".");
                return;
            }
            else if (error.code === 'email_not_confirmed') {
                toast.info("Email not confirmed. Please try again."); // I have currently disabled requirement for email verification, so this will never actually happen
                return;
            }
            else {
                toast.error("Something went wrong");
                throw error;
            }
        }

        /*
        Note the user set-up (including the inserting into database part) is being run no matter whether signing up 
        or logging in, as the user may be logging in from a new device or lost their data etc, so there is no 
        guarantee a signed-up user already exists in the local database
        */

        setUpUser(false, authType, {userId: data.user.id, ...formValues}, setUserId, setPdfFolder, setImageFolder, saveDir, db, supabase, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle, setLoading, setStage, setProgress)
        // ^ passing "false" for "fromCache" variable, meaning we cannot confidently forego database updates, and therefore still require internet connection

        closeModal();

    }

    function handleFormChange(event) {
        const { name, value } = event.target;
        setFormValues((prevState) => ({ ...prevState, [name]: value }));
    };

    return(
        <Modal 
            className={{base: 'centre-modal', afterOpen: 'after-open', beforeClose: 'before-close'}} 
            closeTimeoutMS={300} 
            isOpen={modalIsOpen} 
            onRequestClose={closeModal}
            style={{
                overlay: { zIndex: 1000 },
                content: { zIndex: 1001 }
            }}
        >
            
            <form onSubmit={handleSubmit}>

                {/* Email: */}
                <div className="form-item">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" required placeholder="Required" value={formValues.email} onChange={handleFormChange} />
                </div>

                {/* Password: */}
                <div className="form-item">
                    <label htmlFor="password">Password</label>
                    <input id="password" name="password" type="password" required placeholder={authType === 'sign-up' ? "8+ characters" : "Required"} value={formValues.password} onChange={handleFormChange} />
                </div>

                {/* Company (if signing up) (RELIC, NOW COMMENTED OUT AS NOT COLLECTING THIS INFO): 
                { authType === 'sign-up' ?
                    <div className="form-item">
                        <label htmlFor="company">Company</label>
                        <input id="company" name="company" type="company" value={formValues.company} onChange={handleFormChange} />
                    </div>
                    : null
                }
                */}

                {authType === 'sign-up' ?
                <p>Please take note of your password, as you will not be able to reset it.</p>
                : null}

                <div className="big-buttons-container">
                    <button type="submit" className="accented">Submit</button>
                    <button type="button" onClick={closeModal}>Cancel</button>
                </div>

            </form>

        </Modal>
    );

}

/*
NB: This function is the "single source of truth" for UserContext. It is the only piece of code that
sets the values (apart from saveDir, which is a constant defined immediately in UserContext).

Note authType input and getting company from object input are leftovers from when I thought it would be good 
to collect company info. For now, I'm not going to collect this data.
*/
export async function setUpUser(fromCache, authType, object, setUserId, setPdfFolder, setImageFolder, saveDir, db, supabase, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle, setLoading, setStage, setProgress) {
    
    const platform = Capacitor.getPlatform();
    const { userId, email, company } = object;
    const pdfFolder = `${userId}/pdf`;
    const imageFolder = `${userId}/img`;

    if (setLoading) setLoading(true); // show loading spinner while setting up user

    if (!fromCache) { // if not from cache, we cannot be sure user exists in supabase, so we must ensure we are connected to internet to update supabase
        
        const hasConnection = await checkConnection();
        if (!hasConnection) {
            toast.error('Please connect to the internet to sign up/in. Once signed in, you can use certain features offline.');
            if (setLoading) setLoading(false);
            return;
        }

        // If user doesn't exist (i.e. user id gives no primary key conflict), create record for it (either way, if on mobile, sync to make sure up to date with cloud):
        if (platform !== 'web') {
            await db.run(`
                INSERT INTO users (id, email, created_at, updated_at)
                VALUES (?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
                ON CONFLICT(id) DO NOTHING
            `, [userId, email]);
        }
        else {
            const {error} = await supabase
                .from('users')
                .upsert({
                        id: userId,
                        email,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                    {
                        onConflict: 'id',
                        ignoreDuplicates: true,
                    } // ^ equivalent to ON CONFLICT(id) DO NOTHING (i.e. will NOT update if already exists)
                );
            if (error) console.error("Error: ", error);
        }

        if (platform !== 'web') { // sync immediately to ensure supabase is up to date with potential new user
            await syncAndRefresh(db, supabase, userId, pdfFolder, imageFolder, saveDir, null, null, setStage, setProgress); // not passing setModalIsOpen or refreshPdfObjects here, as we are not within Home context and refresh PDF objects should happen automatically once Home.jsx renders
        }

    }

    await initPurchases(userId, db, supabase, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle); // configures RevenueCat Purchases object and updates subscription-related variables of UserContext

    if (setLoading) setLoading(false);

    setUserId(userId);
    setPdfFolder(pdfFolder);
    setImageFolder(imageFolder);

    if (platform !== 'web') {
        toast.success('Signed in! Remember to press "sync" to synchronise changes with the planpin.app website.');
    }
    else {
        toast.success('Signed in! Remember to press "sync" on the PlanPin iOS app for your changes to appear.');
    }

}

export async function logOut(supabase, setUserId, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle) {

    toast.loading('Logging out...', {id: 'log-out'});

    const { error } = await supabase.auth.signOut();
    if (error) console.error('Error signing out: ', error.message);

    setUserId(undefined);
    setSubscriptionTier(undefined);
    setAllowedPlans(undefined);
    setAllowedMarkers(undefined);
    setAllowedImages(undefined);
    setAllowedReportsThisBillingCycle(undefined);

    toast.success('Logged out', {id: 'log-out'});

}

export async function deleteAccount(supabase, sqliteDb, userId, setUserId, saveDir) {

    toast.loading('Deleting account...', {id: 'loading'});

    const hasConnection = await checkConnection();
    if (!hasConnection) {
        toast.error('Please connect to the internet to delete your account', {id: 'loading'});
        return;
    }

    await wipeAll(supabase, sqliteDb, userId, saveDir); // delete all data (database records & files) associated with user
    await deleteUser(userId); // delete user profile itself from Supabase auth (requires service key, hence have to post to server)
    setUserId(undefined);

    async function deleteUser(userId) {

        //const serverIp = import.meta.env.VITE_SERVER_IP_ADDRESS;
        //const serverPort = import.meta.env.VITE_SERVER_PORT;
        const backendUrl = import.meta.env.VITE_BACKEND_URL;
        const data = {
            user_id: userId,
        }

        try {

            //const response = await fetch(`http://${serverIp}:${serverPort}/delete_user`, {
            const response = await fetch(`${backendUrl}/delete_user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });
        
            const result = await response.json();
        
            if (!response.ok) {
                throw new Error(result.detail || 'Failed to delete user');
            }

            toast.success('Account deleted', {id: 'loading'});

        } catch (error) {
            console.error("Error deleting user: ", error);
            toast.error('There was a problem deleting your account', {id: 'loading'});
        }

    }

}