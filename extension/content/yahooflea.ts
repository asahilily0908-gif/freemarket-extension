// Yahoo!フリマ出品フォームへの転記 Content Script

interface YahooFleaSelectors {
  titleInput: string;
  descriptionInput: string;
  priceInput: string;
}

interface ImageFile {
  base64: string;
  mimeType: string;
  filename: string;
}

// メルカリ→Yahoo!フリマの商品状態マッピング
const CONDITION_MAP: Record<string, string> = {
  "新品、未使用": "新品、未使用",
  "未使用に近い": "未使用に近い",
  "目立った傷や汚れなし": "目立った傷や汚れなし",
  "やや傷や汚れあり": "やや傷や汚れあり",
  "傷や汚れあり": "傷や汚れあり",
  "全体的に状態が悪い": "全体的に状態が悪い",
};

const DEFAULT_SELECTORS: YahooFleaSelectors = {
  titleInput:
    '[name="title"], input[placeholder*="タイトル"], input[placeholder*="商品名"], input[aria-label*="商品名"]',
  descriptionInput:
    '[name="description"], textarea[placeholder*="商品の説明"], textarea[placeholder*="説明"], textarea[aria-label*="説明"]',
  priceInput:
    '[name="price"], input[placeholder*="販売価格"], input[placeholder*="価格"], input[placeholder*="円"], input[type="number"]',
};

let selectors: YahooFleaSelectors = DEFAULT_SELECTORS;

async function loadSelectors() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_SELECTORS",
    });
    if (response?.success && response.data?.yahooflea) {
      selectors = { ...DEFAULT_SELECTORS, ...response.data.yahooflea };
    }
  } catch {
    // デフォルトセレクタを使用
  }
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.focus();
  el.dispatchEvent(new Event("focus", { bubbles: true }));
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function setInputValue(fieldName: string, cssSelector: string, value: string): boolean {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(cssSelector);
  if (el) {
    console.log(`[フリマアシスト] ${fieldName}: マッチ (tag=${el.tagName}, name=${el.getAttribute("name")}, placeholder=${el.getAttribute("placeholder")})`);
    setNativeValue(el, value);
    return true;
  }

  console.warn(`[フリマアシスト] ${fieldName}: セレクタにマッチする要素なし。フォールバック検索中...`);
  const fallbackEl = findByFormContext(fieldName);
  if (fallbackEl) {
    console.log(`[フリマアシスト] ${fieldName}: フォールバックで要素を発見`);
    setNativeValue(fallbackEl, value);
    return true;
  }

  console.error(`[フリマアシスト] ${fieldName}: 入力先の要素が見つかりません`);
  return false;
}

function findByFormContext(fieldName: string): HTMLInputElement | HTMLTextAreaElement | null {
  const keywords: Record<string, string[]> = {
    title: ["商品名", "タイトル"],
    description: ["商品の説明", "説明"],
    price: ["販売価格", "価格", "金額"],
  };

  const terms = keywords[fieldName] || [];

  for (const term of terms) {
    const labels = document.querySelectorAll("label");
    for (const label of labels) {
      if (label.textContent?.includes(term)) {
        const forId = label.getAttribute("for");
        if (forId) {
          const el = document.getElementById(forId) as HTMLInputElement | HTMLTextAreaElement | null;
          if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return el;
        }
        const child = label.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
        if (child) return child;
        const sibling = label.nextElementSibling;
        if (sibling?.tagName === "INPUT" || sibling?.tagName === "TEXTAREA") {
          return sibling as HTMLInputElement | HTMLTextAreaElement;
        }
        const siblingInput = sibling?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
        if (siblingInput) return siblingInput;
      }
    }
  }

  if (fieldName === "description") {
    const textareas = document.querySelectorAll("textarea");
    if (textareas.length === 1) return textareas[0] as HTMLTextAreaElement;
  }

  return null;
}

function selectCondition(mercariCondition: string): boolean {
  const targetText = CONDITION_MAP[mercariCondition];
  if (!targetText) {
    console.warn(`[フリマアシスト] 状態マッピングなし: "${mercariCondition}"`);
    return false;
  }

  // 方式1: ページ上のすべての<select>を走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
    for (const option of select.options) {
      if (option.text.includes(targetText) || option.value.includes(targetText)) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, "value"
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(select, option.value);
        } else {
          select.value = option.value;
        }
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 状態: <select>で "${targetText}" を選択`);
        return true;
      }
    }
  }

  // 方式2: ラベル近傍の<select>を探す
  const labelEls = document.querySelectorAll("label, span, div, dt, th, p");
  for (const el of labelEls) {
    const text = el.textContent?.trim() || "";
    if (text.includes("商品の状態") || text === "状態" || text === "コンディション") {
      let parent: Element | null = el.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const select = parent.querySelector("select") as HTMLSelectElement | null;
        if (select) {
          for (const option of select.options) {
            if (option.text.includes(targetText)) {
              const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype, "value"
              )?.set;
              if (nativeSetter) {
                nativeSetter.call(select, option.value);
              } else {
                select.value = option.value;
              }
              select.dispatchEvent(new Event("input", { bubbles: true }));
              select.dispatchEvent(new Event("change", { bubbles: true }));
              console.log(`[フリマアシスト] 状態: ラベル近傍<select>で "${targetText}" を選択`);
              return true;
            }
          }
        }
        parent = parent.parentElement;
      }
    }
  }

  // 方式3: カスタムUIプルダウン
  for (const el of labelEls) {
    const text = el.textContent?.trim() || "";
    if (text.includes("商品の状態") || text === "状態") {
      let parent: Element | null = el.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const clickable = parent.querySelector(
          'button, [role="button"], [role="listbox"], [role="combobox"], [class*="select"], [class*="dropdown"]'
        ) as HTMLElement | null;

        if (clickable) {
          clickable.click();
          setTimeout(() => {
            const options = document.querySelectorAll(
              '[role="option"], [role="menuitem"], li[class*="option"], [class*="option"]'
            );
            for (const opt of options) {
              if (opt.textContent?.trim().includes(targetText)) {
                (opt as HTMLElement).click();
                console.log(`[フリマアシスト] 状態: "${targetText}" を選択`);
                return;
              }
            }
          }, 500);
          return true;
        }
        parent = parent.parentElement;
      }
    }
  }

  console.warn(`[フリマアシスト] 状態: プルダウン要素が見つかりません`);
  return false;
}

function base64ToFile(imageFile: ImageFile): File {
  const byteChars = atob(imageFile.base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  return new File([byteArray], imageFile.filename, { type: imageFile.mimeType });
}

function uploadImages(imageFiles: ImageFile[]): boolean {
  if (imageFiles.length === 0) return false;

  const files = imageFiles.map(base64ToFile);
  console.log(`[フリマアシスト] 画像アップロード: ${files.length}枚`);

  const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  for (const fileInput of fileInputs) {
    const accept = fileInput.getAttribute("accept") || "";
    if (accept && !accept.includes("image")) continue;

    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    console.log(`[フリマアシスト] 画像: input[type="file"]にセット完了`);
    return true;
  }

  const dropZones = document.querySelectorAll<HTMLElement>(
    '[class*="upload"], [class*="drop"], [class*="image"], [class*="photo"]'
  );
  for (const zone of dropZones) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    zone.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
    zone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }));
    zone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
    console.log(`[フリマアシスト] 画像: ドロップゾーンにドロップ完了`);
    return true;
  }

  const allInputs = document.querySelectorAll<HTMLInputElement>("input");
  for (const input of allInputs) {
    if (input.type === "file") {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      console.log(`[フリマアシスト] 画像: 隠れたfile inputにセット完了`);
      return true;
    }
  }

  console.error(`[フリマアシスト] 画像: アップロード先が見つかりません`);
  return false;
}

function fillForm(data: {
  title: string;
  description: string;
  price: string;
  condition?: string;
  imageFiles?: ImageFile[];
}) {
  console.log("[フリマアシスト] Yahoo!フリマ転記開始:", {
    title: data.title?.slice(0, 20),
    price: data.price,
    condition: data.condition,
    imageCount: data.imageFiles?.length || 0,
  });

  const results: Record<string, boolean> = {
    title: setInputValue("title", selectors.titleInput, data.title),
    description: setInputValue("description", selectors.descriptionInput, data.description),
    price: setInputValue("price", selectors.priceInput, data.price),
  };

  if (data.condition) {
    results.condition = selectCondition(data.condition);
  }

  if (data.imageFiles && data.imageFiles.length > 0) {
    results.images = uploadImages(data.imageFiles);
  }

  console.log("[フリマアシスト] 転記結果:", results);
  return results;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ pong: true });
    return;
  }
  if (message.type === "FILL_FORM") {
    const results = fillForm(message.data);
    sendResponse(results);
  }
});

loadSelectors();
