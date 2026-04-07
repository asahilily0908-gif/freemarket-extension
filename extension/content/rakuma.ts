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

function setSelectValue(select: HTMLSelectElement, targetText: string): boolean {
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
  return false;
}

function selectCondition(mercariCondition: string): boolean {
  const targetText = mapCondition(mercariCondition);
  if (!targetText) return false;

  // labelテキスト「商品の状態」から紐づく要素を取得
  const el = findElementByLabel("商品の状態");
  console.log(`[フリマアシスト] 状態: findElementByLabel("商品の状態") → tagName=${el?.tagName}, className=${el?.className?.slice(0, 60)}, role=${el?.getAttribute("role")}`);

  if (el) {
    // ケース1: 要素自体が<select>
    if (el.tagName === "SELECT") {
      if (setSelectValue(el as HTMLSelectElement, targetText)) return true;
    }

    // ケース2: Chakra UIの chakra-native-select（要素の親や近傍にselectがある）
    // label for → input/div の場合、近傍のselectを探す
    let parent: Element | null = el.closest("[class*='chakra']") || el.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const select = parent.querySelector("select") as HTMLSelectElement | null;
      if (select) {
        console.log(`[フリマアシスト] 状態: 近傍select発見 (name=${select.name}, class=${select.className?.slice(0, 60)})`);
        if (setSelectValue(select, targetText)) return true;
      }
      parent = parent.parentElement;
    }

    // ケース3: Chakra UIのカスタムボタン型セレクト（Menu/Popover方式）
    parent = el.closest("[class*='chakra']") || el.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const clickable = parent.querySelector(
        'button, [role="button"], [role="listbox"], [role="combobox"], [class*="chakra-select"], [class*="chakra-menu"]'
      ) as HTMLElement | null;
      if (clickable) {
        console.log(`[フリマアシスト] 状態: カスタムUI発見 (tag=${clickable.tagName}, class=${clickable.className?.slice(0, 60)})`);
        clickable.click();
        setTimeout(() => {
          const options = document.querySelectorAll(
            '[role="option"], [role="menuitem"], [class*="option"], [class*="menu-item"], li'
          );
          for (const opt of options) {
            if (opt.textContent?.trim().includes(targetText)) {
              (opt as HTMLElement).click();
              console.log(`[フリマアシスト] 状態: カスタムUIで "${targetText}" を選択`);
              return;
            }
          }
          console.warn(`[フリマアシスト] 状態: カスタムUI選択肢に "${targetText}" が見つかりません`);
        }, 500);
        return true;
      }
      parent = parent.parentElement;
    }
  }

  // フォールバック: ページ全体のselectを走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
    if (setSelectValue(select, targetText)) {
      console.log(`[フリマアシスト] 状態: 全select走査で発見`);
      return true;
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

/**
 * 配送方法を選択する（Chakra UIのselect or カスタムUI）
 */
function selectShipping(shippingText: string): boolean {
  if (!shippingText) return false;

  // ラクマはChakra UIなのでlabelベース + 近傍select
  const el = findElementByLabel("配送料の負担") || findElementByLabel("配送方法");
  if (el && el.tagName === "SELECT") {
    const select = el as HTMLSelectElement;
    for (const option of select.options) {
      if (option.text.includes(shippingText)) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, "value"
        )?.set;
        if (nativeSetter) nativeSetter.call(select, option.value);
        else select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 配送: "${shippingText}" を選択`);
        return true;
      }
    }
  }

  // ページ全体のselectを走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
    for (const option of select.options) {
      if (option.text.includes(shippingText)) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, "value"
        )?.set;
        if (nativeSetter) nativeSetter.call(select, option.value);
        else select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 配送: 全select走査で "${shippingText}" を選択`);
        return true;
      }
    }
  }

  console.warn(`[フリマアシスト] 配送: "${shippingText}" が見つかりません`);
  return false;
}

/**
 * 発送日数を選択する
 */
function selectShippingDays(daysText: string): boolean {
  if (!daysText) return false;

  const el = findElementByLabel("発送までの日数") || findElementByLabel("発送日の目安");
  if (el && el.tagName === "SELECT") {
    const select = el as HTMLSelectElement;
    for (const option of select.options) {
      if (option.text.includes(daysText)) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, "value"
        )?.set;
        if (nativeSetter) nativeSetter.call(select, option.value);
        else select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 発送日数: "${daysText}" を選択`);
        return true;
      }
    }
  }

  // ページ全体のselect走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
    for (const option of select.options) {
      if (option.text.includes(daysText)) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, "value"
        )?.set;
        if (nativeSetter) nativeSetter.call(select, option.value);
        else select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 発送日数: 全select走査で "${daysText}" を選択`);
        return true;
      }
    }
  }

  console.warn(`[フリマアシスト] 発送日数: "${daysText}" が見つかりません`);
  return false;
}

/**
 * 発送元の地域を選択する
 */
function selectPrefecture(prefText: string): boolean {
  if (!prefText) return false;

  // labelベース
  const el = findElementByLabel("発送元") || findElementByLabel("地域");
  if (el && el.tagName === "SELECT") {
    const select = el as HTMLSelectElement;
    for (const option of select.options) {
      if (option.text.includes(prefText)) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, "value"
        )?.set;
        if (nativeSetter) nativeSetter.call(select, option.value);
        else select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 地域: "${prefText}" を選択`);
        return true;
      }
    }
  }

  // 全select走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
    for (const option of select.options) {
      if (option.text === prefText || option.text.includes(prefText)) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, "value"
        )?.set;
        if (nativeSetter) nativeSetter.call(select, option.value);
        else select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 地域: 全select走査で "${prefText}" を選択`);
        return true;
      }
    }
  }

  console.warn(`[フリマアシスト] 地域: "${prefText}" が見つかりません`);
  return false;
}

function fillForm(data: {
  title: string;
  description: string;
  price: string;
  condition?: string;
  defaultShipping?: string;
  shippingDays?: string;
  prefecture?: string;
  imageFiles?: ImageFile[];
}) {
  console.log("[フリマアシスト] ラクマ転記開始:", {
    title: data.title?.slice(0, 20),
    price: data.price,
    condition: data.condition,
    shipping: data.defaultShipping,
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

  if (data.defaultShipping) {
    results.shipping = selectShipping(data.defaultShipping);
  }

  if (data.shippingDays) {
    results.shippingDays = selectShippingDays(data.shippingDays);
  }

  if (data.prefecture) {
    results.prefecture = selectPrefecture(data.prefecture);
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
