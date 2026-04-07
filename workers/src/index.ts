import { handleGenerate } from "./routes/generate";
import { handleImageProxy } from "./routes/image-proxy";
import { handleLicense } from "./routes/license";
import { handleSelectors } from "./routes/selectors";
import { authMiddleware } from "./middleware/auth";

export interface Env {
  KV: KVNamespace;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // セレクタ配信（認証不要）
      if (path === "/api/selectors" && request.method === "GET") {
        return addCors(await handleSelectors(env));
      }

      // 画像プロキシ（認証不要）
      if (path === "/api/image-proxy" && request.method === "GET") {
        return addCors(await handleImageProxy(request, env));
      }

      // ライセンス検証
      if (path === "/api/license/verify" && request.method === "POST") {
        return addCors(await handleLicense(request, env));
      }

      // 以下は認証が必要なエンドポイント
      // ローカル開発時は認証をスキップ
      const isDev = env.ENVIRONMENT === "development";
      let licenseKey: string;

      if (isDev) {
        licenseKey = "dev-local";
      } else {
        const authResult = await authMiddleware(request, env);
        if (authResult instanceof Response) {
          return addCors(authResult);
        }
        licenseKey = authResult.licenseKey;
      }

      // AI説明文生成
      if (path === "/api/generate" && request.method === "POST") {
        return addCors(
          await handleGenerate(request, env, licenseKey)
        );
      }

      return addCors(
        new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      );
    } catch (error) {
      return addCors(
        new Response(
          JSON.stringify({ error: "Internal Server Error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    }
  },
};

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function addCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
