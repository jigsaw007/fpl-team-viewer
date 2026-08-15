// Saves an email + team id to Supabase for deadline reminders.
// Requires two Netlify env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// The service_role key must ONLY live here (server-side), never in index.html.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !KEY) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Reminder service not configured" }) };
  }
  let email, team_id;
  try {
    const b = JSON.parse(event.body || "{}");
    email = (b.email || "").trim().toLowerCase();
    team_id = b.team_id ? String(b.team_id) : null;
  } catch {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Bad request" }) };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid email" }) };
  }
  try {
    // upsert on email
    const res = await fetch(`${SUPABASE_URL}/rest/v1/subscribers?on_conflict=email`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ email, team_id, unsubscribed: false }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: t }) };
    }
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() {
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
}
