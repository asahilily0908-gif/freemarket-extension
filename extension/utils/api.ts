// Chrome拡張 → Service Worker へのメッセージ送信ヘルパー

export interface ProductData {
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  images: string[];
}

export function sendMessage<T = unknown>(
  type: string,
  payload?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.success) {
        resolve(response.data as T);
      } else {
        reject(new Error(response?.error || "Unknown error"));
      }
    });
  });
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    // content scriptが未注入なので動的に注入
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["mercari.js"],
    });
  }
}

export async function fetchProductData(): Promise<ProductData> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    throw new Error("アクティブなタブが見つかりません");
  }

  if (!tab.url?.includes("mercari.com")) {
    throw new Error("メルカリの商品ページを開いてください");
  }

  await ensureContentScript(tab.id);

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tab.id!,
      { type: "SCRAPE_MERCARI" },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response) {
          resolve(response as ProductData);
        } else {
          reject(new Error("商品情報を取得できませんでした"));
        }
      }
    );
  });
}

export function fillForm(
  platform: "rakuma" | "yahooflea",
  data: ProductData
): Promise<void> {
  return sendMessage("FILL_FORM", { platform, data });
}

export function generateDescription(payload: {
  title: string;
  description: string;
  images: string[];
}): Promise<{ generatedDescription: string }> {
  return sendMessage("GENERATE_DESCRIPTION", payload);
}
