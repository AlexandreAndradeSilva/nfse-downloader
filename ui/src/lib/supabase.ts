import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tneziinemoynndtngtur.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZXppaW5lbW95bm5kdG5ndHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Njc3MDUsImV4cCI6MjA5NjQ0MzcwNX0.5oGqh-PBXzVBQVPzr_6ylFwP19EYp0nXnslcxriJb3c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
