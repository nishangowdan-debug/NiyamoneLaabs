export const environment = {
  production: false,
  // Demo project — seeded with 5 branches, 30 patients, 1,400+ invoices,
  // 90 days of revenue, lab orders, critical results, home collections.
  supabaseUrl: 'https://zgncprvdqjkqbunqwhqc.supabase.co',
  // TODO: paste the publishable (anon) key from
  //       Supabase Dashboard → Project zgncprvdqjkqbunqwhqc → Settings → API → Publishable key
  supabasePublishableKey: 'sb_publishable_x3-MrCtQfp0mQmKao6NDtw_1ukEydyl',
  /**
   * Public base URL that gets embedded in WhatsApp / SMS messages and QR codes.
   * MUST be a publicly reachable URL — patients open this on their phone, not
   * the laptop running `npm start`. Set it to your staging/production domain
   * for the client demo. Leave empty to fall back to window.location.origin.
   */
  publicBaseUrl: '',
};
