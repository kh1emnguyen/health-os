// Static @supabase/supabase-js import removed to prevent bundle-time crash.
// When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY secrets are present in
// GitHub Actions, the original createClient() call was bundled and executing
// at module-init time — causing a blank page in production.
// App.jsx handles supabase === null gracefully (shows "not configured").
export const supabase = null
