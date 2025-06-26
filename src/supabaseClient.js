// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Créer un mock pour le mode démo
const mockSupabase = {
  from: () => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: null, error: null }),
    update: () => Promise.resolve({ data: null, error: null }),
    delete: () => Promise.resolve({ data: null, error: null }),
    eq: () => ({ 
      data: [], 
      error: null,
      order: () => Promise.resolve({ data: [], error: null })
    }),
    order: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve({ data: null, error: null })
  })
}

// Exporter soit le vrai client Supabase, soit le mock
export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : mockSupabase

// Afficher un warning si on utilise le mode démo
if (!supabaseUrl || !supabaseKey) {
  console.warn('Variables d\'environnement Supabase manquantes. Utilisation du mode démo.')
}