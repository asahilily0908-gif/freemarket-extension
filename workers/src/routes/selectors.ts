import type { Env } from "../index";

const DEFAULT_SELECTORS = {
  mercari: {
    title: '[data-testid="name"], h1.item-name, #item-name, input[name="name"]',
    description:
      '[data-testid="description"], .item-description, #item-description, textarea[name="description"]',
    price: '[data-testid="price"], .item-price, #item-price, input[name="price"]',
    category: '[data-testid="category"], .item-category',
    images:
      '[data-testid="image"] img, .item-photo img, .slick-slide img, figure img',
  },
  rakuma: {
    titleInput: '[name="title"], input[placeholder*="商品名"]',
    descriptionInput:
      '[name="description"], textarea[placeholder*="説明"], textarea[placeholder*="商品の説明"]',
    priceInput: '[name="price"], input[placeholder*="価格"], input[type="number"]',
  },
  yahooflea: {
    titleInput:
      'input[name="title"], input[placeholder*="タイトル"], input[placeholder*="商品名"]',
    descriptionInput:
      'textarea[name="description"], textarea[placeholder*="説明"], textarea[placeholder*="商品の説明"]',
    priceInput:
      'input[name="price"], input[placeholder*="価格"], input[type="number"][placeholder*="円"]',
  },
};

export async function handleSelectors(env: Env): Promise<Response> {
  // KVからセレクタを取得。なければデフォルトを返す
  const kvSelectors = await env.KV.get("dom_selectors");

  const selectors = kvSelectors
    ? JSON.parse(kvSelectors)
    : DEFAULT_SELECTORS;

  return new Response(JSON.stringify(selectors), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
