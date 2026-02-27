import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://nxihfyokltovifwesbzn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-0ACEKlDdpCio__oJmks8g_J4HVmrlg";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
