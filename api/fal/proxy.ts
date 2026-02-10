/**
 * Vercel Serverless Function — fal.ai proxy
 *
 * Proxies requests from the browser to fal.ai, keeping the FAL_KEY secret
 * on the server side. The @fal-ai/client in the browser sends requests here
 * instead of directly to fal.ai.
 *
 * Expected by fal.ai client when configured with:
 *   fal.config({ proxyUrl: "/api/fal/proxy" })
 *
 * The client sends:
 *   - x-fal-target-url header: the actual fal.ai endpoint URL
 *   - The request body as-is
 *
 * This proxy:
 *   1. Reads x-fal-target-url from the incoming request
 *   2. Forwards the request to that URL with Authorization header
 *   3. Returns the response back to the browser
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const FAL_KEY = process.env.FAL_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for browser requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-fal-target-url, x-fal-request-id"
  );

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!FAL_KEY) {
    return res.status(500).json({ error: "FAL_KEY not configured on server" });
  }

  // The fal.ai client sends the target URL in this header
  const targetUrl =
    (req.headers["x-fal-target-url"] as string) ||
    (req.query?.target_url as string);

  if (!targetUrl) {
    return res.status(400).json({
      error: "Missing x-fal-target-url header",
    });
  }

  try {
    // Forward headers (excluding host and fal-specific proxy headers)
    const forwardHeaders: Record<string, string> = {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": req.headers["content-type"] || "application/json",
    };

    // Copy any x-fal-* headers (except target-url)
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        key.startsWith("x-fal-") &&
        key !== "x-fal-target-url" &&
        typeof value === "string"
      ) {
        forwardHeaders[key] = value;
      }
    }

    // Forward the request to fal.ai
    const response = await fetch(targetUrl, {
      method: req.method || "POST",
      headers: forwardHeaders,
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
    });

    // Get response body
    const contentType = response.headers.get("content-type") || "";
    const responseBody = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    // Forward status code and response
    res.status(response.status);

    // Forward relevant response headers
    const responseHeaders = [
      "x-fal-request-id",
      "x-fal-queue-id",
      "content-type",
    ];
    for (const header of responseHeaders) {
      const value = response.headers.get(header);
      if (value) res.setHeader(header, value);
    }

    return res.json(responseBody);
  } catch (error: any) {
    console.error("[fal-proxy] Error:", error);
    return res.status(502).json({
      error: "Proxy error",
      message: error.message,
    });
  }
}
