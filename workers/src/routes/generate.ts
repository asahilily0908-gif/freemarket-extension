import type { Env } from "../index";

interface GenerateRequest {
  title: string;
  description: string;
  images: string[];
}

export async function handleGenerate(
  request: Request,
  env: Env,
  licenseKey: string
): Promise<Response> {
  // レート制限チェック
  const today = new Date().toISOString().slice(0, 10);
  const countKey = `usage:generate:${licenseKey}:${today}`;
  const currentCount = parseInt((await env.KV.get(countKey)) || "0");

  // プラン判定
  const planKey = `license:${licenseKey}`;
  const planData = await env.KV.get(planKey);
  const plan = planData ? JSON.parse(planData).plan : "free";
  const limit = plan === "pro" ? 30 : 3;

  if (currentCount >= limit) {
    return new Response(
      JSON.stringify({
        error: "rate_limit",
        message: `本日のAI生成上限（${limit}回）に達しました。${
          plan === "free" ? "Proプランにアップグレードすると1日30回まで利用できます。" : ""
        }`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = (await request.json()) as GenerateRequest;

  if (!body.title) {
    return new Response(
      JSON.stringify({ error: "validation", message: "商品タイトルが必要です" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const prompt = `あなたはフリマアプリの出品のプロです。以下の商品情報をもとに、メルカリやラクマで売れやすい商品説明文を生成してください。

【ルール】
- 200〜400文字程度
- 親しみやすいトーンで書く
- 商品の状態を詳しく記載する
- 「即購入歓迎」「コメントなし購入OK」などの文言を入れる
- 偽ブランド品を匂わせる表現は絶対に使わない
- 改行を適切に入れて読みやすくする

【商品タイトル】
${body.title}

【元の説明文（参考）】
${body.description || "なし"}

売れやすい商品説明文を生成してください。`;

  try {
    const claudeResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          messages: [{ role: "user", content: prompt }],
        }),
      }
    );

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      console.error("Claude API error:", err);
      return new Response(
        JSON.stringify({
          error: "ai_error",
          message: "AI生成に失敗しました。しばらくしてからお試しください。",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = (await claudeResponse.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const generatedDescription =
      result.content.find((c) => c.type === "text")?.text || "";

    // 使用回数をインクリメント（TTL: 翌日まで）
    await env.KV.put(countKey, String(currentCount + 1), {
      expirationTtl: 86400,
    });

    return new Response(
      JSON.stringify({ generatedDescription }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate error:", error);
    return new Response(
      JSON.stringify({
        error: "internal",
        message: "サーバーエラーが発生しました",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
