import { createClient } from "@supabase/supabase-js";

export async function initSupabase() {

    // Note schema is already set up in Supabase, so no need to create tables etc here

    const key = import.meta.env.VITE_SUPABASE_API_KEY;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const supabase = createClient(url, key);

    return supabase;

}