// ============================================================
// supabase-config.js — Supabase client configuration
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your values
// from: https://supabase.com/dashboard → Settings → API
// ============================================================

const SUPABASE_URL = 'https://mrkmxjiqxidvgceamoyd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-RzkCMP-gZLZIkOY6MZxyg_mEZCGdc8';
const SUPABASE_STORAGE_BUCKET = 'product-images';

var supabaseClient = null;
var supabaseInitError = '';

(function initSupabase() {
  const hasPlaceholderUrl =
    !SUPABASE_URL ||
    SUPABASE_URL.includes('YOUR_PROJECT_REF') ||
    SUPABASE_URL.includes('YOUR_SUPABASE_URL');
  const hasPlaceholderKey =
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes('YOUR_ANON_PUBLIC_KEY') ||
    SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_KEY');

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    supabaseInitError = 'Supabase library did not load. Check your internet connection and reload the page.';
  } else if (hasPlaceholderUrl || hasPlaceholderKey) {
    supabaseInitError = 'Supabase is not configured yet. Open supabase-config.js and replace the placeholder URL and anon key.';
  } else {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (error) {
      const reason = error && error.message ? error.message : String(error);
      supabaseInitError = `Failed to initialize Supabase: ${reason}`;
    }
  }

  window.supabaseClient = supabaseClient;
  window.supabaseInitError = supabaseInitError;
  window.supabaseStorageBucket = SUPABASE_STORAGE_BUCKET;
  window._supabase = supabaseClient;
})();
