import { createClient } from '@supabase/supabase-js';

// Gán trực tiếp URL và Anon Key của bạn tại đây
const supabaseUrl = 'https://tqzwrluftcftqzwkslzb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxendybHVmdGNmdHF6d2tzbHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NDY5OTAsImV4cCI6MjA5MTIyMjk5MH0.NIOkvAH_9g05hYV4XSOJ3IkeOC64RSKsk9AXaphoijs';

const isValidUrl = (url: string) => {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
};

export const supabase = isValidUrl(supabaseUrl) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
