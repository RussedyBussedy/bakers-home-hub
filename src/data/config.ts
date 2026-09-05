// Default backend for the Bakers' hub. The anon key is designed to be public
// (it ships in the browser bundle); all data access is enforced by row-level
// security in Postgres. Override with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// in a .env.local file if you ever point the app at a different project.
export const DEFAULT_SUPABASE_URL = 'https://rxpnlzzjpdkvtimotrbk.supabase.co'
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4cG5senpqcGRrdnRpbW90cmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NjY1MDUsImV4cCI6MjEwNDE0MjUwNX0.QZ8G-zwMAEoItShzlELnqpS3ZPhfWKBlWZFsbYorCCs'
