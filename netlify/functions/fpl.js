// Small allow-listed proxy for the public Fantasy Premier League API.
// Called as: /.netlify/functions/fpl?path=/entry/701419/
const FPL_ORIGIN = "https://fantasy.premierleague.com/api";

const ALLOWED = [
  /^\/bootstrap-static\/$/,
  /^\/fixtures\/(?:\?event=\d+)?$/,
  /^\/element-summary\/\d+\/$/,
  /^\/entry\/\d+\/$/,
  /^\/entry\/\d+\/history\/$/,
  /^\/entry\/\d+\/event\/\d+\/picks\/$/,
  /^\/event\/\d+\/live\/$/,
  /^\/leagues-(?:classic|h2h)\/\d+\/standings\/\?page_standings=\d+$/,
];

function cacheFor(path) {
  if (path === "/bootstrap-static/") return "public, max-age=120, s-maxage=300";
  if (path.startsWith("/event/") && path.endsWith("/live/")) return "public, max-age=10, s-maxage=15";
  if (path.startsWith("/fixtures/")) return "public, max-age=5, s-maxage=10";
  return "public, max-age=30, s-maxage=60";
}

exports.handler = async function (event) {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { Allow: "GET" }, body: "Method not allowed" };
  }

  const path = (event.queryStringParameters && event.queryStringParameters.path) || "/bootstrap-static/";
  if (typeof path !== "string" || path.length > 240 || !ALLOWED.some((re) => re.test(path))) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Unsupported FPL API path" }),
    };
  }

  try {
    const res = await fetch(FPL_ORIGIN + path, {
      headers: {
        "User-Agent": "FPL-Peek/1.0",
        Accept: "application/json",
      },
    });
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": cacheFor(path),
      },
      body,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
