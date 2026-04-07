import type { Env } from "../index";

interface LicenseVerifyRequest {
  licenseKey: string;
}

export async function handleLicense(
  request: Request,
  env: Env
): Promise<Response> {
  const body = (await request.json()) as LicenseVerifyRequest;

  if (!body.licenseKey) {
    return new Response(
      JSON.stringify({ valid: false, message: "ライセンスキーが必要です" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const planKey = `license:${body.licenseKey}`;
  const planData = await env.KV.get(planKey);

  if (!planData) {
    return new Response(
      JSON.stringify({ valid: false, plan: "free" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const data = JSON.parse(planData) as {
    plan: string;
    expiresAt?: string;
  };

  // 期限チェック
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
    return new Response(
      JSON.stringify({
        valid: false,
        plan: "free",
        message: "ライセンスの有効期限が切れています",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ valid: true, plan: data.plan }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
