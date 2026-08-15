// GET /.netlify/functions/unsubscribe?token=UUID  → marks a subscriber as unsubscribed.
exports.handler = async function (event) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = (event.queryStringParameters || {}).token;
  if (!SUPABASE_URL || !KEY) return { statusCode: 500, body: "Not configured" };
  if (!token) return { statusCode: 400, body: "Missing token" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/subscribers?unsub_token=eq.${encodeURIComponent(token)}`,
      {
        method: "PATCH",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ unsubscribed: true }),
      }
    );
    const html = res.ok
      ? "<h2>You're unsubscribed.</h2><p>You won't receive any more deadline reminders.</p>"
      : "<h2>Something went wrong.</h2><p>Please try the link again later.</p>";
    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
  } catch (e) {
    return { statusCode: 502, headers: { "Content-Type": "text/html" }, body: "<h2>Error</h2>" };
  }
};
