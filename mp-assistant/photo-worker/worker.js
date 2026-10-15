// Cloudflare Worker: proxies inventory photos as downloads.
// Set PHOTO_BASE as a Worker environment variable (Settings → Variables), e.g. https://your-bucket.s3.amazonaws.com/carts/


export default {
  async fetch(request, env) {
    const S3_BASE = (env && env.PHOTO_BASE) || "";
    if (!S3_BASE) return new Response("PHOTO_BASE is not configured", { status: 500 });
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
      }});
    }
    const file = url.searchParams.get("file") || "";
    const dl = (url.searchParams.get("name") || file).replace(/[\/\\:*?"<>|]+/g, "");
    if (!/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(file)) {
      return new Response("bad file", { status: 400 });
    }
    const upstream = await fetch(S3_BASE + file);
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    headers.set("Content-Disposition", `attachment; filename="${dl}"`);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=3600");
    return new Response(upstream.body, { status: 200, headers });
  }
};
