const fs = require('fs');

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !publishableKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY environment variables.');
}

const contents = `window.SUPABASE_CONFIG = ${JSON.stringify({ url, publishableKey }, null, 2)};\n`;
fs.writeFileSync('env.js', contents);
