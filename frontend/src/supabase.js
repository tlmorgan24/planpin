import { createClient } from "@supabase/supabase-js";
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { checkConnection } from "./network";

export async function initSupabase(setSupabase) {

    // Note schema is already set up in Supabase, so no need to create tables etc here

    const key = import.meta.env.VITE_SUPABASE_API_KEY;
    const url = import.meta.env.VITE_SUPABASE_URL;
    let supabase = null; // we want to make sure we only create the supabase client when we are sure we have internet connection, to prevent failed refreshes
    
    // Allow saving of authenticated session on mobile, so user doesn't have to log in every time they re-open app:
    if (Capacitor.getPlatform() !== 'web') {

        const SESSION_KEY = 'supabase.session'; // arbitrary (but constant) key to save session under in Capacitor preferences

        // We will set supabase session to cached session if connected to the internet (if not connected to the internet, setSession would keep trying to connect every few seconds, so we'd rather just listen for when network comes back, as below)
        const hasConnection = await checkConnection();        
        if (hasConnection) { // have internet connection, can create supabase client immediately
            supabase = createClient(url, key);
            // Listen to auth state changes to manually save session to local cache whenever it changes:
            supabase.auth.onAuthStateChange((_event, session) => {
                saveSession(session, SESSION_KEY);
            });
            await loadSession(supabase, SESSION_KEY); // does nothing if no previously saved session
        }

        else { // no internet connection - instead of creating client, add listener to only create client once network is connected
            // Listen to network connection to create client and load session if not already done (would not have been previously done if started the app offline):
            Network.addListener('networkStatusChange', async () => {
                const hasConnection = await checkConnection();   
                if (hasConnection) {
                    if (!supabase) { // can now create supabase client, if haven't created previously
                        supabase = createClient(url, key);
                        console.log("Client created");
                        // Listen to auth state changes to manually save session to local cache whenever it changes:
                        supabase.auth.onAuthStateChange((_event, session) => {
                            saveSession(session, SESSION_KEY);
                        });
                        await loadSession(supabase, SESSION_KEY); // turn cached session into authenticated session (if there is a cached one)
                        setSupabase(supabase);
                    }
                    else {
                        await loadSession(supabase, SESSION_KEY); // turn cached session into authenticated session (if there is a cached one)
                    }
                }
            });

        }

    }

    else { // on web, we assume internet connection and are safe to create client immediately
        supabase = createClient(url, key);
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
    const { value } = await Preferences.get({ key: 'supabase.session' }); // WARNING: HARD-CODED, MUST NOT CHANGE SESSION KEY IN INITSUPABASE() FUNCTION
    if (value) {
        const session = JSON.parse(value);
        return session;
    }
    return null;
}