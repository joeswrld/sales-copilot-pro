/**
 * supabase.ts — Mobile Supabase client
 * Uses SecureStore for token persistence on native.
 */

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const SUPABASE_URL =
  Constants.expoConfig?.extra?.supabaseUrl ||
  "https://dkvtufanmaiclmsnpyae.supabase.co";
const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.supabaseAnonKey || "";

// SecureStore adapter for Supabase auth session persistence
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});