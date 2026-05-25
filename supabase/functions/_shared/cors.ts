// CORS headers shared across Edge Functions. The browser admin UI calls these
// functions directly, so they need permissive CORS for the deployed origin.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
