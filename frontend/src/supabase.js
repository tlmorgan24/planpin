import { createClient } from "@supabase/supabase-js";
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export async function initSupabase() {

    // Note schema is already set up in Supabase, so no need to create tables etc here

    const key = import.meta.env.VITE_SUPABASE_API_KEY;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const supabase = createClient(url, key);

    // Allow saving of authenticated session on mobile, so user doesn't have to log in every time they re-open app:
    if (Capacitor.getPlatform() !== 'web') {

        const SESSION_KEY = 'supabase.session'; // arbitrary key to save session under in Capacitor preferences
        await loadSession(supabase, SESSION_KEY); // does nothing if no previously saved session

        // Listen to auth state changes to save session whenever it changes:
        supabase.auth.onAuthStateChange((_event, session) => {
            saveSession(session, SESSION_KEY); // no need to bother awaiting this even though async, as doesn't affect app logic
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
    } else {
        await Preferences.remove({ key: SESSION_KEY });
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