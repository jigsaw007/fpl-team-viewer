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
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",
        "Referer": "https://www.premierleague.com/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });
    if (!res.ok) {
      // Do not surface an upstream CDN 403 in the app console. Return a tiny transparent
      // image so existing <img> fallbacks can continue without a failed network request.
      const transparentPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLx0QAAAABJRU5ErkJggg==";
      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
          "Access-Control-Allow-Origin": "*",
          "X-FPL-Peek-Photo-Fallback": String(res.status)
        },
        body: transparentPng
      };
    }
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
