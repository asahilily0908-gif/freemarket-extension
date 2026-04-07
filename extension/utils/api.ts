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

  if (!tab.url.includes("/item/")) {
    throw new Error("メルカリの商品ページ（商品詳細）を開いてください。トップページや検索結果からは取得できません。");
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

export interface FillResult {
  title: boolean;
  description: boolean;
  price: boolean;
  condition?: boolean;
  shipping?: boolean;
  shippingDays?: boolean;
  prefecture?: boolean;
  images?: boolean;
}

export function fillForm(
  platform: "rakuma" | "yahooflea",
  data: ProductData
): Promise<FillResult> {
  return sendMessage<FillResult>("FILL_FORM", { platform, data });
}

export interface TransferRecord {
  id: string;
  date: string;
  title: string;
  price: string;
  platform: "rakuma" | "yahooflea";
  result: FillResult;
}

export async function saveTransferRecord(record: TransferRecord): Promise<void> {
  const { transferHistory = [] } = await chrome.storage.local.get("transferHistory");
  transferHistory.unshift(record);
  // 最大100件保持
  if (transferHistory.length > 100) transferHistory.length = 100;
  await chrome.storage.local.set({ transferHistory });
}

export async function getTransferHistory(): Promise<TransferRecord[]> {
  const { transferHistory = [] } = await chrome.storage.local.get("transferHistory");
  return transferHistory;
}

export interface DescriptionTemplate {
  id: string;
  name: string;
  text: string;
}

export async function getTemplates(): Promise<DescriptionTemplate[]> {
  const { descTemplates = [] } = await chrome.storage.local.get("descTemplates");
  return descTemplates;
}

export async function saveTemplates(templates: DescriptionTemplate[]): Promise<void> {
  await chrome.storage.local.set({ descTemplates: templates });
}

export function getListingUrls(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id || !tab.url?.includes("mercari.com")) {
        reject(new Error("メルカリのページを開いてください"));
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "GET_LISTING_URLS" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve((response as string[]) || []);
      });
    });
  });
}

export function generateDescription(payload: {
  title: string;
  description: string;
  images: string[];
}): Promise<{ generatedDescription: string }> {
  return sendMessage("GENERATE_DESCRIPTION", payload);
}
