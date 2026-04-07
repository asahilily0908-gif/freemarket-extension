import type { Env } from "../index";

export interface AuthResult {
  licenseKey: string;
}

export async function authMiddleware(
  request: Request,
  env: Env
): Promise<Response | AuthResult> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        message: "ライセンスキーが必要です。設定画面からキーを入力してください。",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const licenseKey = authHeader.slice(7);

  if (!licenseKey) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        message: "無効なライセンスキーです",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return { licenseKey };
}
