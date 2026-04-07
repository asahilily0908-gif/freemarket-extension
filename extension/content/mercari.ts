// メルカリ商品ページからの情報取得 Content Script

interface MercariSelectors {
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  images: string;
}

const DEFAULT_SELECTORS: MercariSelectors = {
  title: '[data-testid="name"], h1.item-name, #item-name, input[name="name"]',
  description:
    '[data-testid="description"], .item-description, #item-description, textarea[name="description"]',
  price:
    '[data-testid="price"], .item-price, #item-price, input[name="price"]',
  category: '[data-testid="category"], .item-category',
  condition:
    '[data-testid="condition"], [data-testid="商品の状態"], th:has(+ td)',
  images:
    '[data-testid="image"] img, .item-photo img, .slick-slide img, figure img',
};

let selectors: MercariSelectors = DEFAULT_SELECTORS;

// サーバーからセレクタを取得（起動時）
async function loadSelectors() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_SELECTORS",
    });
    if (response?.success && response.data?.mercari) {
      selectors = { ...DEFAULT_SELECTORS, ...response.data.mercari };
    }
  } catch {
    // デフォルトセレクタを使用
  }
}

function getTextContent(selectorGroup: string): string {
  const selectorList = selectorGroup.split(",").map((s) => s.trim());
  for (const selector of selectorList) {
    const el = document.querySelector(selector);
    if (el) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value.trim();
      }
      return el.textContent?.trim() || "";
    }
  }
  return "";
}

function getImageUrls(selectorGroup: string): string[] {
  const selectorList = selectorGroup.split(",").map((s) => s.trim());
  const urls: string[] = [];

  for (const selector of selectorList) {
    const images = document.querySelectorAll<HTMLImageElement>(selector);
    images.forEach((img) => {
      const src = img.src || img.dataset.src || "";
      if (src && !urls.includes(src)) {
        urls.push(src);
      }
    });
    if (urls.length > 0) break;
  }

  return urls;
}

// メルカリの状態ラベル一覧（正規化用）
const KNOWN_CONDITIONS = [
  "新品、未使用",
  "未使用に近い",
  "目立った傷や汚れなし",
  "やや傷や汚れあり",
  "傷や汚れあり",
  "全体的に状態が悪い",
];

function normalizeCondition(raw: string): string {
  // メルカリは「目立った傷や汚れなし 細かな使用感・傷・汚れはあるが、目立たない」のように
  // ラベル+説明文がセットで取れることがあるので、既知のラベル部分だけ抽出する
  for (const label of KNOWN_CONDITIONS) {
    if (raw.includes(label)) return label;
  }
  console.log(`[フリマアシスト] condition正規化: 未知の値 "${raw}"`);
  return raw;
}

function getCondition(): string {
  // data-testid ベースで取得を試みる
  const selectorList = selectors.condition.split(",").map((s) => s.trim());
  for (const selector of selectorList) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim() || "";
      if (text) return normalizeCondition(text);
    }
  }

  // テーブル行やラベルテキストからフォールバック検索
  const allElements = document.querySelectorAll("th, dt, span, div");
  for (const el of allElements) {
    const text = el.textContent?.trim() || "";
    if (text === "商品の状態" || text === "状態") {
      const value =
        el.nextElementSibling?.textContent?.trim() ||
        el.parentElement?.querySelector("td, dd, span:last-child")
          ?.textContent?.trim() ||
        "";
      if (value) return normalizeCondition(value);
    }
  }

  return "";
}

function scrapeProductData() {
  return {
    title: getTextContent(selectors.title),
    description: getTextContent(selectors.description),
    price: getTextContent(selectors.price).replace(/[^0-9]/g, ""),
    category: getTextContent(selectors.category),
    condition: getCondition(),
    images: getImageUrls(selectors.images),
  };
}

// Service Workerからのメッセージを受信
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "SCRAPE_MERCARI") {
    const data = scrapeProductData();
    sendResponse(data);
  }
});

// 初期化
loadSelectors();
