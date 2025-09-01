import { createClient } from "@supabase/supabase-js";
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network'; // to check internet connection

export async function initSupabase() {

    // Note schema is already set up in Supabase, so no need to create tables etc here

    const key = import.meta.env.VITE_SUPABASE_API_KEY;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const supabase = createClient(url, key);

    // Allow saving of authenticated session on mobile, so user doesn't have to log in every time they re-open app:
    if (Capacitor.getPlatform() !== 'web') {

        const SESSION_KEY = 'supabase.session'; // arbitrary (but constant) key to save session under in Capacitor preferences

        // We will set supabase session to cached session if connected to the internet (if not connected to the internet, setSession would keep trying to connect every few seconds, so we'd rather just listen for when network comes back, as below)
        const status = await Network.getStatus();
        if (status.connected) {
            await loadSession(supabase, SESSION_KEY); // does nothing if no previously saved session
        }

        // Listen to network connection to load session if not already loaded (would not have been previously loaded if started the app offline):
        Network.addListener('networkStatusChange', async () => {
            const status = await Network.getStatus();
                if (status.connected) {
                    const {data, error} = await supabase.auth.getSession(); // existing authenticated session, if there is one
                    if (error) console.error("Error: ", error);
                    if (!(data && data.session)) {
                        await loadSession(supabase, SESSION_KEY); // turn cached session into authenticated session (if there is a cached one)
                    }
                }
        });

        // Listen to auth state changes to save session whenever it changes:
        supabase.auth.onAuthStateChange((_event, session) => {
            saveSession(session, SESSION_KEY);
        });

    }

    /* 
    Now, supabase will be a client already authenticated with a previously saved session (if there is one).
    Will check for this session with supabase.auth.getSession(), and only send user to authentication screen 
    if no session is found.
    */

    return supabase;

}

// Save session info in Capacitor local storage (will do this whenever user signs up or logs in):
export async function saveSession(session, SESSION_KEY) {
    if (session) {
        await Preferences.set({
            key: SESSION_KEY,
            value: JSON.stringify(session),
        });
        console.log("Session saved!");
    }
}

// Load session (saved using above saveSession function) if one exists (otherwise, do nothing):
export async function loadSession(supabase, SESSION_KEY) {
    const { value } = await Preferences.get({ key: SESSION_KEY });
    if (value) {
        const session = JSON.parse(value);
        supabase.auth.setSession(session); // Supabase JS v2 supports setSession()
    }
}

// Manual version of loadSession, to be used when we want to bypass supabase auth when not connected to internet:
export async function getManualSession() {
    console.log("Here 1");
    const { value } = await Preferences.get({ key: 'supabase.session' }); // WARNING: HARD-CODED, MUST NOT CHANGE SESSION KEY IN INITSUPABASE() FUNCTION
    console.log("value: ", value);
    if (value) {
        const session = JSON.parse(value);
        console.log("session: ", session);
        return session;
    }
    return null;
}