// Service Worker - メッセージルーティング

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "FETCH_PRODUCT_DATA":
      handleFetchProductData().then(sendResponse);
      return true;

    case "FILL_FORM":
      handleFillForm(message.payload).then(sendResponse);
      return true;

    case "GENERATE_DESCRIPTION":
      handleGenerateDescription(message.payload).then(sendResponse);
      return true;

    case "GET_SELECTORS":
      handleGetSelectors().then(sendResponse);
      return true;
  }
});

async function handleFetchProductData(): Promise<unknown> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      return { success: false, error: "アクティブなタブが見つかりません" };
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SCRAPE_MERCARI",
    });
    return { success: true, data: response };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleFillForm(payload: {
  platform: "rakuma" | "yahooflea";
  data: Record<string, unknown>;
}): Promise<unknown> {
  const urlPatterns: Record<string, string[]> = {
    rakuma: ["https://fril.jp/*"],
    yahooflea: [
      "https://paypayfleamarket.yahoo.co.jp/*",
      "https://paypayfleamarket-sec.yahoo.co.jp/*",
    ],
  };

  const contentScripts: Record<string, string> = {
    rakuma: "rakuma.js",
    yahooflea: "yahooflea.js",
  };

  const tabs = await chrome.tabs.query({
    url: urlPatterns[payload.platform],
  });

  if (tabs.length === 0 || !tabs[0].id) {
    return {
      success: false,
      error: `${payload.platform}のタブが見つかりません。出品フォームを開いてください。`,
    };
  }

  const tabId = tabs[0].id;

  // Content Scriptが注入済みか確認し、未注入なら動的に注入
  await ensureContentScriptInjected(tabId, contentScripts[payload.platform]);

  // 画像URLがあればプロキシ経由でBase64に変換
  const images = (payload.data.images as string[]) || [];
  const imageFiles = await fetchImagesAsBase64(images.slice(0, 10));

  // conditionを正規化（メルカリの「ラベル+説明文」から既知のラベルだけ抽出）
  const condition = normalizeCondition(
    (payload.data.condition as string) || ""
  );

  // デフォルト配送方法・発送日数を取得
  const shippingKey = payload.platform === "rakuma" ? "rakumaShipping" : "yahooShipping";
  const settings = await chrome.storage.local.get([shippingKey, "shippingDays", "prefecture"]);

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "FILL_FORM",
      data: {
        ...payload.data,
        condition,
        imageFiles,
        defaultShipping: settings[shippingKey] || "",
        shippingDays: settings.shippingDays || "",
        prefecture: settings.prefecture || "",
      },
    });
    return { success: true, data: response };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function ensureContentScriptInjected(
  tabId: number,
  scriptFile: string
): Promise<void> {
  try {
    // PINGを送ってContent Scriptが応答するか確認
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    // 応答なし → Content Script未注入なので動的に注入
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptFile],
    });
    // 注入後、少し待ってから処理を続行
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function handleGenerateDescription(payload: {
  title: string;
  description: string;
  images: string[];
}): Promise<unknown> {
  try {
    const apiBase = await getApiBase();
    const licenseKey = await getLicenseKey();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (licenseKey) {
      headers["Authorization"] = `Bearer ${licenseKey}`;
    }

    const response = await fetch(`${apiBase}/api/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        images: payload.images,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        success: false,
        error:
          (error as { message?: string }).message ||
          `API error: ${response.status}`,
      };
    }

    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleGetSelectors(): Promise<unknown> {
  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/selectors`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const selectors = await response.json();
    return { success: true, data: selectors };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function getApiBase(): Promise<string> {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  return apiBase || "http://localhost:8787";
}

async function getLicenseKey(): Promise<string> {
  const { licenseKey } = await chrome.storage.local.get("licenseKey");
  return licenseKey || "";
}

const KNOWN_CONDITIONS = [
  "新品、未使用",
  "未使用に近い",
  "目立った傷や汚れなし",
  "やや傷や汚れあり",
  "傷や汚れあり",
  "全体的に状態が悪い",
];

function normalizeCondition(raw: string): string {
  if (!raw) return "";
  for (const label of KNOWN_CONDITIONS) {
    if (raw.includes(label)) return label;
  }
  return raw;
}

interface ImageFile {
  base64: string;
  mimeType: string;
  filename: string;
}

async function fetchImagesAsBase64(
  imageUrls: string[]
): Promise<ImageFile[]> {
  const apiBase = await getApiBase();
  const results: ImageFile[] = [];

  const fetches = imageUrls.map(async (url, index) => {
    try {
      const proxyUrl = `${apiBase}/api/image-proxy?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) return null;

      const blob = await response.blob();
      const mimeType = blob.type || "image/jpeg";
      const ext = mimeType.includes("png") ? "png" : "jpg";

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(",")[1]);
        };
        reader.readAsDataURL(blob);
      });

      return {
        base64,
        mimeType,
        filename: `image_${index + 1}.${ext}`,
      };
    } catch {
      console.error(`[フリマアシスト] 画像取得失敗: ${url}`);
      return null;
    }
  });

  const settled = await Promise.all(fetches);
  for (const item of settled) {
    if (item) results.push(item);
  }

  return results;
}
