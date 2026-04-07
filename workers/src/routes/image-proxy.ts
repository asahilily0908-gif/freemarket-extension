import type { Env } from "../index";

const ALLOWED_HOSTS = ["static.mercdn.net", "static.mercdn.com"];

export async function handleImageProxy(
  request: Request,
  _env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get("url");

  if (!imageUrl) {
    return new Response(
      JSON.stringify({ error: "url parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid URL" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!ALLOWED_HOSTS.some((host) => parsedUrl.hostname.endsWith(host))) {
    return new Response(
      JSON.stringify({ error: "Host not allowed" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Image fetch failed: ${imageResponse.status}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const contentType = imageResponse.headers.get("Content-Type") || "image/jpeg";
    const imageData = await imageResponse.arrayBuffer();

    return new Response(imageData, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch image" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
