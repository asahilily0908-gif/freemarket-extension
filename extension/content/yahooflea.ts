// Yahoo!フリマ出品フォームへの転記 Content Script

interface ImageFile {
  base64: string;
  mimeType: string;
  filename: string;
}

const CONDITION_MAP: [string, string][] = [
  ["新品、未使用", "未使用"],
  ["未使用に近い", "未使用に近い"],
  ["目立った傷や汚れなし", "目立った傷や汚れなし"],
  ["やや傷や汚れあり", "やや傷や汚れあり"],
  ["傷や汚れあり", "傷や汚れあり"],
];

function findElementByLabel(labelText: string): HTMLElement | null {
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    if (!label.textContent?.trim().includes(labelText)) continue;
    const forId = label.getAttribute("for");
    if (forId && forId !== "null") {
      const el = document.getElementById(forId);
      if (el) return el;
    }
    const child = label.querySelector("input, textarea, select");
    if (child) return child as HTMLElement;
    let sibling = label.nextElementSibling;
    for (let i = 0; i < 5 && sibling; i++) {
      if (sibling.tagName === "INPUT" || sibling.tagName === "TEXTAREA" || sibling.tagName === "SELECT") return sibling as HTMLElement;
      const nested = sibling.querySelector("input, textarea, select");
      if (nested) return nested as HTMLElement;
      sibling = sibling.nextElementSibling;
    }
    let parent: Element | null = label.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const inputs = parent.querySelectorAll("input, textarea, select");
      for (const input of inputs) {
        if (!label.contains(input)) return input as HTMLElement;
      }
      parent = parent.parentElement;
    }
  }
  return null;
}

/**
 * テキスト内容でボタン/クリッカブル要素を探す
 */
function findButtonByText(text: string): HTMLElement | null {
  const allEls = document.querySelectorAll("button, a, [role='button'], div, span");
  for (const el of allEls) {
    const elText = (el as HTMLElement).textContent?.trim() || "";
    // 直接テキストが一致する要素を優先（子が少ないもの）
    if (elText === text && el.children.length <= 3) {
      return el as HTMLElement;
    }
  }
  // 部分一致フォールバック
  for (const el of allEls) {
    const elText = (el as HTMLElement).textContent?.trim() || "";
    if (elText.includes(text) && el.children.length <= 3) {
      return el as HTMLElement;
    }
  }
  return null;
}

/**
 * Reactのpointerイベント対応クリック
 */
function reactClick(el: HTMLElement) {
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  el.click();
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  try {
    if (nativeSetter) nativeSetter.call(el, value);
    else el.value = value;
  } catch { el.setAttribute("value", value); el.value = value; }
  el.focus();
  el.dispatchEvent(new Event("focus", { bubbles: true }));
  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  } catch { el.dispatchEvent(new Event("input", { bubbles: true })); }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fillTitle(value: string): boolean {
  const byLabel = findElementByLabel("商品名");
  if (byLabel && (byLabel.tagName === "INPUT" || byLabel.tagName === "TEXTAREA")) {
    setNativeValue(byLabel as HTMLInputElement, value);
    console.log("[フリマアシスト] title: OK");
    return true;
  }
  const byPlaceholder = document.querySelector<HTMLInputElement>('input[placeholder*="商品名"]');
  if (byPlaceholder) { setNativeValue(byPlaceholder, value); return true; }
  console.error("[フリマアシスト] title: 見つかりません");
  return false;
}

function fillDescription(value: string): boolean {
  const byLabel = findElementByLabel("商品説明");
  if (byLabel && byLabel.tagName === "TEXTAREA") {
    setNativeValue(byLabel as HTMLTextAreaElement, value);
    console.log("[フリマアシスト] description: OK");
    return true;
  }
  const textareas = document.querySelectorAll("textarea");
  if (textareas.length === 1) { setNativeValue(textareas[0] as HTMLTextAreaElement, value); return true; }
  console.error("[フリマアシスト] description: 見つかりません");
  return false;
}

function fillPrice(value: string): boolean {
  const byLabel = findElementByLabel("販売価格");
  if (byLabel && byLabel.tagName === "INPUT") {
    setNativeValue(byLabel as HTMLInputElement, value);
    console.log("[フリマアシスト] price: OK");
    return true;
  }
  const byPlaceholder = document.querySelector<HTMLInputElement>('input[placeholder*="300"]');
  if (byPlaceholder) { setNativeValue(byPlaceholder, value); return true; }
  console.error("[フリマアシスト] price: 見つかりません");
  return false;
}

// --- 商品の状態 ---

function mapCondition(mercariCondition: string): string | null {
  for (const [key, val] of CONDITION_MAP) {
    if (mercariCondition.includes(key)) return val;
  }
  return null;
}

function selectCondition(mercariCondition: string): void {
  const targetText = mapCondition(mercariCondition);
  if (!targetText) {
    console.warn(`[フリマアシスト] 状態マッピングなし: "${mercariCondition}"`);
    return;
  }

  // 「商品の状態」ラベル近傍のボタンを探す
  const labels = document.querySelectorAll("label");
  let conditionButton: HTMLElement | null = null;
  for (const label of labels) {
    if (!label.textContent?.trim().includes("商品の状態")) continue;
    let parent: Element | null = label.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const btn = parent.querySelector("button") as HTMLElement | null;
      if (btn && !label.contains(btn)) { conditionButton = btn; break; }
      parent = parent.parentElement;
    }
    if (conditionButton) break;
  }

  if (!conditionButton) {
    console.warn("[フリマアシスト] 状態: ボタンが見つかりません");
    return;
  }

  console.log(`[フリマアシスト] 状態: ボタン発見 class=${conditionButton.className?.slice(0, 40)}`);

  // ReactModalPortalにコンテンツが出現するのを監視してからクリック
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        // モーダル内のテキストを探す
        const allText = node.querySelectorAll("*");
        for (const el of allText) {
          const text = (el as HTMLElement).textContent?.trim() || "";
          if (text === targetText || text.includes(targetText)) {
            console.log(`[フリマアシスト] 状態: "${targetText}" を発見、クリック`);
            setTimeout(() => reactClick(el as HTMLElement), 100);
            observer.disconnect();
            return;
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ボタンをReact対応クリック
  reactClick(conditionButton);
  console.log("[フリマアシスト] 状態: ボタンをクリック");

  // タイムアウト
  setTimeout(() => {
    observer.disconnect();
    // まだ選択されていなければ、ページ全体から探す
    const allEls = document.querySelectorAll("*");
    for (const el of allEls) {
      if (el.children.length > 2) continue;
      const text = (el as HTMLElement).textContent?.trim() || "";
      if (text === targetText) {
        reactClick(el as HTMLElement);
        console.log(`[フリマアシスト] 状態: フォールバックで "${targetText}" をクリック`);
        return;
      }
    }
    console.warn(`[フリマアシスト] 状態: "${targetText}" が見つかりません`);
  }, 3000);
}

// --- 画像アップロード ---

function base64ToFile(img: ImageFile): File {
  const bytes = atob(img.base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], img.filename, { type: img.mimeType });
}

function uploadImages(imageFiles: ImageFile[]): void {
  if (imageFiles.length === 0) return;
  const files = imageFiles.map(base64ToFile);
  console.log(`[フリマアシスト] 画像: ${files.length}枚`);

  // 「画像を追加する」ボタンを探す
  const addImageBtn = findButtonByText("画像を追加する");
  if (!addImageBtn) {
    console.warn("[フリマアシスト] 画像: 「画像を追加する」ボタンが見つかりません。ドロップゾーンを試行");
    tryDropOnPage(files);
    return;
  }

  console.log("[フリマアシスト] 画像: 「画像を追加する」ボタン発見");

  // input[type=file] の出現を監視
  const fileInputObserver = new MutationObserver(() => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input) {
      fileInputObserver.disconnect();
      console.log("[フリマアシスト] 画像: input[type=file]出現！ファイルセット");
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      console.log(`[フリマアシスト] 画像: ${files.length}枚セット完了`);
    }
  });
  fileInputObserver.observe(document.body, { childList: true, subtree: true });

  // ボタンクリック → モーダルが開く
  reactClick(addImageBtn);

  // モーダル内の「アルバムから選択する」を探してクリック
  const albumObserver = new MutationObserver(() => {
    const albumBtn = findButtonByText("アルバムから選択する");
    if (albumBtn) {
      albumObserver.disconnect();
      console.log("[フリマアシスト] 画像: 「アルバムから選択する」発見、クリック");
      setTimeout(() => reactClick(albumBtn), 300);
    }
  });
  albumObserver.observe(document.body, { childList: true, subtree: true });

  // タイムアウト
  setTimeout(() => {
    fileInputObserver.disconnect();
    albumObserver.disconnect();
  }, 10000);
}

function tryDropOnPage(files: File[]) {
  // 「ドラッグ＆ドロップ」テキスト近傍のエリアにdropする
  const allEls = document.querySelectorAll("*");
  for (const el of allEls) {
    if ((el as HTMLElement).textContent?.includes("ドラッグ＆ドロップ") && el.children.length <= 3) {
      const target = el.parentElement || el;
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      (target as HTMLElement).dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
      (target as HTMLElement).dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }));
      (target as HTMLElement).dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
      console.log("[フリマアシスト] 画像: ドロップゾーンにdrop");
      return;
    }
  }
  console.warn("[フリマアシスト] 画像: ドロップゾーンも見つかりません");
}

// --- 配送方法 ---

function selectShipping(shippingText: string): void {
  if (!shippingText) return;

  // Yahoo!フリマの配送方法は「選択してください」のアコーディオン内にラジオボタンがある
  // まずアコーディオンを開く
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    if (!label.textContent?.trim().includes("配送方法")) continue;

    let parent: Element | null = label.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      // 「選択してください」のボタン/エリアをクリックしてアコーディオンを開く
      const trigger = parent.querySelector('[class*="select"], button, [role="button"]') as HTMLElement | null;
      if (trigger && !label.contains(trigger)) {
        reactClick(trigger);
        console.log("[フリマアシスト] 配送: アコーディオンを開いた");
        break;
      }
      parent = parent.parentElement;
    }
    break;
  }

  // 少し待ってからラジオボタンをテキストマッチでクリック
  setTimeout(() => {
    // ラジオボタン or クリッカブルな配送方法行を探す
    const allEls = document.querySelectorAll("*");
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || "";
      // 直接テキストが一致するリーフ要素
      if (text.includes(shippingText) && el.children.length <= 5) {
        // ラジオボタンinputがあればそれをクリック
        const radio = (el as HTMLElement).querySelector('input[type="radio"]') as HTMLInputElement | null;
        if (radio) {
          radio.click();
          radio.dispatchEvent(new Event("change", { bubbles: true }));
          console.log(`[フリマアシスト] 配送: ラジオボタン "${shippingText}" を選択`);
          return;
        }
        // ラジオボタンがなければ要素自体をクリック
        reactClick(el as HTMLElement);
        console.log(`[フリマアシスト] 配送: "${shippingText}" をクリック`);
        return;
      }
    }

    // 近傍のラジオボタンのlabel/テキストで探す
    const radioLabels = document.querySelectorAll("label");
    for (const rl of radioLabels) {
      if (rl.textContent?.trim().includes(shippingText)) {
        const radio = rl.querySelector('input[type="radio"]') as HTMLInputElement | null;
        if (radio) {
          radio.click();
          radio.dispatchEvent(new Event("change", { bubbles: true }));
          console.log(`[フリマアシスト] 配送: label経由で "${shippingText}" を選択`);
          return;
        }
        reactClick(rl as HTMLElement);
        console.log(`[フリマアシスト] 配送: labelクリック "${shippingText}"`);
        return;
      }
    }

    console.warn(`[フリマアシスト] 配送: "${shippingText}" が見つかりません`);
  }, 800);
}

// --- 発送日数 ---

function selectShippingDays(daysText: string): void {
  if (!daysText) return;

  // 「発送までの日数」ラベル近傍のselectを探す
  const el = findElementByLabel("発送までの日数");
  if (el && el.tagName === "SELECT") {
    const select = el as HTMLSelectElement;
    for (const option of select.options) {
      if (option.text.includes(daysText)) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 発送日数: "${daysText}" を選択`);
        return;
      }
    }
  }

  // フォールバック: ページ全体のselect走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
    for (const option of select.options) {
      if (option.text.includes(daysText)) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 発送日数: 全select走査で "${daysText}" を選択`);
        return;
      }
    }
  }

  console.warn(`[フリマアシスト] 発送日数: "${daysText}" が見つかりません`);
}

// --- 発送元の地域 ---

function selectPrefecture(prefText: string): void {
  if (!prefText) return;

  // labelベース
  const el = findElementByLabel("発送元の地域") || findElementByLabel("発送元");
  if (el && el.tagName === "SELECT") {
    const select = el as HTMLSelectElement;
    for (const option of select.options) {
      if (option.text.includes(prefText)) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 地域: "${prefText}" を選択`);
        return;
      }
    }
  }

  // 全select走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
    for (const option of select.options) {
      if (option.text === prefText || option.text.includes(prefText)) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[フリマアシスト] 地域: 全select走査で "${prefText}" を選択`);
        return;
      }
    }
  }

  // Yahoo!フリマはモーダル形式の可能性もある
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    if (!label.textContent?.trim().includes("発送元")) continue;
    let parent: Element | null = label.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const btn = parent.querySelector("button") as HTMLElement | null;
      if (btn && !label.contains(btn)) {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (!(node instanceof HTMLElement)) continue;
              const allEls = node.querySelectorAll("*");
              for (const el of allEls) {
                const text = (el as HTMLElement).textContent?.trim() || "";
                if (text === prefText && el.children.length <= 2) {
                  setTimeout(() => reactClick(el as HTMLElement), 100);
                  console.log(`[フリマアシスト] 地域: モーダルで "${prefText}" を選択`);
                  observer.disconnect();
                  return;
                }
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        reactClick(btn);
        setTimeout(() => observer.disconnect(), 5000);
        return;
      }
      parent = parent.parentElement;
    }
  }

  console.warn(`[フリマアシスト] 地域: "${prefText}" が見つかりません`);
}

// --- メイン ---

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
  console.log("[フリマアシスト] Yahoo!フリマ転記開始");

  const results: Record<string, boolean> = {
    title: fillTitle(data.title),
    description: fillDescription(data.description),
    price: fillPrice(data.price),
  };

  if (data.condition) {
    selectCondition(data.condition);
    results.condition = true;
  }

  if (data.defaultShipping) {
    selectShipping(data.defaultShipping);
    results.shipping = true;
  }

  if (data.shippingDays) {
    selectShippingDays(data.shippingDays);
    results.shippingDays = true;
  }

  if (data.prefecture) {
    selectPrefecture(data.prefecture);
    results.prefecture = true;
  }

  if (data.imageFiles && data.imageFiles.length > 0) {
    uploadImages(data.imageFiles);
    results.images = true;
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
