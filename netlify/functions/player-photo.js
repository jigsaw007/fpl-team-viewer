// Same-origin proxy for official Premier League player headshots used in share-card canvas exports.
// Called as: /.netlify/functions/player-photo?code=123456
const ORIGIN = "https://resources.premierleague.com/premierleague/photos/players/110x140";

exports.handler = async function(event) {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { Allow: "GET" }, body: "Method not allowed" };
  }
  const code = (event.queryStringParameters && event.queryStringParameters.code) || "";
  if (!/^\d{1,12}$/.test(code)) {
    return { statusCode: 400, headers: { "Cache-Control": "no-store" }, body: "Invalid player code" };
  }
  try {
    const res = await fetch(`${ORIGIN}/p${code}.png`, {
      headers: { "User-Agent": "FPL-Peek/1.0", Accept: "image/png,image/*;q=0.8" }
    });
    if (!res.ok) return { statusCode: res.status, headers: { "Cache-Control": "public, max-age=300" }, body: "Image unavailable" };
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "Access-Control-Allow-Origin": "*"
      },
      body: buf.toString("base64")
    };
  } catch (e) {
    return { statusCode: 502, headers: { "Cache-Control": "no-store" }, body: "Image proxy error" };
  }
};
