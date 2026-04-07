// ラクマ出品フォームへの転記 Content Script
// ラクマは Chakra UI ベース。IDはランダムなので label テキスト + for 属性で要素を特定する。

interface ImageFile {
  base64: string;
  mimeType: string;
  filename: string;
}

// メルカリ→ラクマの商品状態マッピング（部分一致で検索）
const CONDITION_MAP: [string, string][] = [
  ["新品、未使用", "新品・未使用"],
  ["未使用に近い", "未使用に近い"],
  ["目立った傷や汚れなし", "目立った傷や汚れなし"],
  ["やや傷や汚れあり", "やや傷や汚れあり"],
  ["傷や汚れあり", "傷や汚れあり"],
  ["全体的に状態が悪い", "全体的に状態が悪い"],
];

/**
 * labelテキストから紐づくinput/textarea/selectを取得
 */
function findElementByLabel(labelText: string): HTMLElement | null {
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    const text = label.textContent?.trim() || "";
    if (text === labelText || text.startsWith(labelText)) {
      const forId = label.getAttribute("for");
      if (forId) {
        const el = document.getElementById(forId);
        if (el) return el;
      }
      // for属性がない場合はlabel内の入力要素を探す
      const child = label.querySelector("input, textarea, select");
      if (child) return child as HTMLElement;
    }
  }
  return null;
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

function fillTitle(value: string): boolean {
  const el = findElementByLabel("商品名") as HTMLInputElement | null;
  if (el) {
    console.log(`[フリマアシスト] title: ラベル "商品名" → id="${el.id}"`);
    setNativeValue(el, value);
    return true;
  }
  console.error("[フリマアシスト] title: 商品名フィールドが見つかりません");
  return false;
}

function fillDescription(value: string): boolean {
  const el = findElementByLabel("商品説明") as HTMLTextAreaElement | null;
  if (el) {
    console.log(`[フリマアシスト] description: ラベル "商品説明" → id="${el.id}"`);
    setNativeValue(el, value);
    return true;
  }
  // フォールバック: ページ内唯一のtextarea
  const textareas = document.querySelectorAll("textarea");
  if (textareas.length === 1) {
    console.log("[フリマアシスト] description: フォールバック（唯一のtextarea）");
    setNativeValue(textareas[0] as HTMLTextAreaElement, value);
    return true;
  }
  console.error("[フリマアシスト] description: 商品説明フィールドが見つかりません");
  return false;
}

function fillPrice(value: string): boolean {
  // name="sellPrice" で直接取得
  const el = document.querySelector<HTMLInputElement>('[name="sellPrice"]');
  if (el) {
    console.log(`[フリマアシスト] price: name="sellPrice" にマッチ`);
    setNativeValue(el, value);
    return true;
  }
  // フォールバック: labelテキストから探す
  const byLabel = findElementByLabel("販売価格") as HTMLInputElement | null;
  if (byLabel) {
    console.log("[フリマアシスト] price: ラベル「販売価格」から取得");
    setNativeValue(byLabel, value);
    return true;
  }
  console.error("[フリマアシスト] price: 価格フィールドが見つかりません");
  return false;
}

function mapCondition(mercariCondition: string): string | null {
  for (const [mercariKey, rakumaValue] of CONDITION_MAP) {
    if (mercariCondition.includes(mercariKey)) {
      return rakumaValue;
    }
  }
  console.warn(`[フリマアシスト] 状態マッピングなし: "${mercariCondition}"`);
  return null;
}

function selectCondition(mercariCondition: string): boolean {
  const targetText = mapCondition(mercariCondition);
  if (!targetText) return false;

  // 方式1: labelテキスト「商品の状態」から紐づくselect要素を取得
  const el = findElementByLabel("商品の状態");
  if (el && el.tagName === "SELECT") {
    const select = el as HTMLSelectElement;
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
        console.log(`[フリマアシスト] 状態: "${targetText}" を選択 (value=${option.value})`);
        return true;
      }
    }
  }

  // 方式2: Chakra UIのカスタムセレクト（labelの近傍を探す）
  if (el) {
    // Chakra UIのselectはnative selectの場合もある
    let parent: Element | null = el.closest(".chakra-form-control") || el.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const select = parent.querySelector("select") as HTMLSelectElement | null;
      if (select && select !== el) {
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
            console.log(`[フリマアシスト] 状態: Chakra近傍selectで "${targetText}" を選択`);
            return true;
          }
        }
      }
      // Chakra UIのカスタムボタン型セレクト
      const clickable = parent.querySelector(
        'button, [role="button"], [role="listbox"], [role="combobox"]'
      ) as HTMLElement | null;
      if (clickable) {
        clickable.click();
        setTimeout(() => {
          const options = document.querySelectorAll(
            '[role="option"], [role="menuitem"], [class*="option"]'
          );
          for (const opt of options) {
            if (opt.textContent?.trim().includes(targetText)) {
              (opt as HTMLElement).click();
              console.log(`[フリマアシスト] 状態: カスタムUIで "${targetText}" を選択`);
              return;
            }
          }
        }, 500);
        return true;
      }
      parent = parent.parentElement;
    }
  }

  // 方式3: ページ全体のselectを走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
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
        console.log(`[フリマアシスト] 状態: 全select走査で "${targetText}" を選択`);
        return true;
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
  console.log("[フリマアシスト] ラクマ転記開始:", {
    title: data.title?.slice(0, 20),
    price: data.price,
    condition: data.condition,
    imageCount: data.imageFiles?.length || 0,
  });

  const results: Record<string, boolean> = {
    title: fillTitle(data.title),
    description: fillDescription(data.description),
    price: fillPrice(data.price),
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
