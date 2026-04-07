// Yahoo!フリマ出品フォームへの転記 Content Script
// labelのfor属性がnullなので、ラベルテキスト部分一致 → 近傍要素探索で特定する

interface ImageFile {
  base64: string;
  mimeType: string;
  filename: string;
}

const CONDITION_MAP: [string, string][] = [
  ["新品、未使用", "新品、未使用"],
  ["未使用に近い", "未使用に近い"],
  ["目立った傷や汚れなし", "目立った傷や汚れなし"],
  ["やや傷や汚れあり", "やや傷や汚れあり"],
  ["傷や汚れあり", "傷や汚れあり"],
  ["全体的に状態が悪い", "全体的に状態が悪い"],
];

/**
 * labelテキスト（部分一致）から近傍のinput/textarea/selectを探す
 * Yahoo!フリマはlabelのfor属性がnullなので、DOM構造を辿って探す
 */
function findElementByLabel(labelText: string): HTMLElement | null {
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    const text = label.textContent?.trim() || "";
    if (!text.includes(labelText)) continue;

    // 1. for属性がある場合
    const forId = label.getAttribute("for");
    if (forId && forId !== "null") {
      const el = document.getElementById(forId);
      if (el) return el;
    }

    // 2. label内のinput/textarea/select
    const child = label.querySelector("input, textarea, select");
    if (child) return child as HTMLElement;

    // 3. labelの次の兄弟要素を探す
    let sibling = label.nextElementSibling;
    for (let i = 0; i < 5 && sibling; i++) {
      if (sibling.tagName === "INPUT" || sibling.tagName === "TEXTAREA" || sibling.tagName === "SELECT") {
        return sibling as HTMLElement;
      }
      const nested = sibling.querySelector("input, textarea, select");
      if (nested) return nested as HTMLElement;
      sibling = sibling.nextElementSibling;
    }

    // 4. labelの親を遡って同じコンテナ内のinput/textarea/selectを探す
    let parent: Element | null = label.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const inputs = parent.querySelectorAll("input, textarea, select");
      for (const input of inputs) {
        // labelそのものの中でなく、label外のinputを返す
        if (!label.contains(input)) return input as HTMLElement;
      }
      parent = parent.parentElement;
    }
  }
  return null;
}

/**
 * labelテキスト近傍のbutton/カスタムUIプルダウンを探す
 */
function findClickableByLabel(labelText: string): HTMLElement | null {
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    const text = label.textContent?.trim() || "";
    if (!text.includes(labelText)) continue;

    let parent: Element | null = label.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      // select
      const select = parent.querySelector("select") as HTMLElement | null;
      if (select && !label.contains(select)) return select;
      // カスタムUI
      const clickable = parent.querySelector(
        'button, [role="button"], [role="listbox"], [role="combobox"], [class*="select"], [class*="dropdown"], [class*="Select"]'
      ) as HTMLElement | null;
      if (clickable && !label.contains(clickable)) return clickable;
      parent = parent.parentElement;
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

  try {
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }
  } catch {
    // Illegal invocation フォールバック
    el.setAttribute("value", value);
    el.value = value;
  }

  el.focus();
  el.dispatchEvent(new Event("focus", { bubbles: true }));
  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  } catch {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fillTitle(value: string): boolean {
  // labelベース（部分一致: "商品名必須" にマッチ）
  const byLabel = findElementByLabel("商品名");
  if (byLabel && (byLabel.tagName === "INPUT" || byLabel.tagName === "TEXTAREA")) {
    console.log(`[フリマアシスト] title: ラベル近傍で発見 (tag=${byLabel.tagName}, class=${byLabel.className?.slice(0, 40)})`);
    setNativeValue(byLabel as HTMLInputElement, value);
    return true;
  }
  // placeholderフォールバック
  const byPlaceholder = document.querySelector<HTMLInputElement>(
    'input[placeholder*="商品名"], input[placeholder*="タイトル"]'
  );
  if (byPlaceholder) {
    console.log(`[フリマアシスト] title: placeholderで発見`);
    setNativeValue(byPlaceholder, value);
    return true;
  }
  // name属性フォールバック
  const byName = document.querySelector<HTMLInputElement>('[name="title"], [name="name"]');
  if (byName) {
    console.log(`[フリマアシスト] title: name属性で発見`);
    setNativeValue(byName, value);
    return true;
  }
  console.error("[フリマアシスト] title: フィールドが見つかりません");
  return false;
}

function fillDescription(value: string): boolean {
  const byLabel = findElementByLabel("商品説明");
  if (byLabel && byLabel.tagName === "TEXTAREA") {
    console.log(`[フリマアシスト] description: ラベル近傍で発見`);
    setNativeValue(byLabel as HTMLTextAreaElement, value);
    return true;
  }
  const byPlaceholder = document.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder*="説明"], textarea[placeholder*="商品"]'
  );
  if (byPlaceholder) {
    console.log(`[フリマアシスト] description: placeholderで発見`);
    setNativeValue(byPlaceholder, value);
    return true;
  }
  const byName = document.querySelector<HTMLTextAreaElement>('[name="description"]');
  if (byName) {
    console.log(`[フリマアシスト] description: name属性で発見`);
    setNativeValue(byName, value);
    return true;
  }
  const textareas = document.querySelectorAll("textarea");
  if (textareas.length === 1) {
    console.log("[フリマアシスト] description: フォールバック（唯一のtextarea）");
    setNativeValue(textareas[0] as HTMLTextAreaElement, value);
    return true;
  }
  console.error("[フリマアシスト] description: フィールドが見つかりません");
  return false;
}

function fillPrice(value: string): boolean {
  const byLabel = findElementByLabel("販売価格");
  if (byLabel && byLabel.tagName === "INPUT") {
    console.log(`[フリマアシスト] price: ラベル近傍で発見`);
    setNativeValue(byLabel as HTMLInputElement, value);
    return true;
  }
  const byPlaceholder = document.querySelector<HTMLInputElement>(
    'input[placeholder*="販売価格"], input[placeholder*="300"]'
  );
  if (byPlaceholder) {
    console.log(`[フリマアシスト] price: placeholderで発見`);
    setNativeValue(byPlaceholder, value);
    return true;
  }
  const byName = document.querySelector<HTMLInputElement>('[name="price"], [name="sellPrice"]');
  if (byName) {
    console.log(`[フリマアシスト] price: name属性で発見`);
    setNativeValue(byName, value);
    return true;
  }
  console.error("[フリマアシスト] price: フィールドが見つかりません");
  return false;
}

function mapCondition(mercariCondition: string): string | null {
  for (const [mercariKey, yahooValue] of CONDITION_MAP) {
    if (mercariCondition.includes(mercariKey)) {
      return yahooValue;
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
      try {
        if (nativeSetter) {
          nativeSetter.call(select, option.value);
        } else {
          select.value = option.value;
        }
      } catch {
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

  // labelベースでselect/カスタムUIを探す
  const el = findClickableByLabel("商品の状態");
  console.log(`[フリマアシスト] 状態: findClickableByLabel → tagName=${el?.tagName}, class=${el?.className?.slice(0, 60)}, role=${el?.getAttribute("role")}`);

  if (el) {
    // select要素の場合
    if (el.tagName === "SELECT") {
      if (setSelectValue(el as HTMLSelectElement, targetText)) return true;
    }

    // カスタムUI（button等）の場合 → クリックして選択肢を出す
    el.click();
    console.log(`[フリマアシスト] 状態: カスタムUI要素をクリック`);

    // クリック後に出現する選択肢を探す
    setTimeout(() => {
      const options = document.querySelectorAll(
        '[role="option"], [role="menuitem"], [class*="option"], [class*="Option"], [class*="menu-item"], [class*="MenuItem"], li'
      );
      console.log(`[フリマアシスト] 状態: 選択肢候補 ${options.length}件`);
      for (const opt of options) {
        const optText = opt.textContent?.trim() || "";
        if (optText.includes(targetText)) {
          (opt as HTMLElement).click();
          console.log(`[フリマアシスト] 状態: "${targetText}" を選択`);
          return;
        }
      }
      console.warn(`[フリマアシスト] 状態: 選択肢に "${targetText}" が見つかりません`);
    }, 500);
    return true;
  }

  // フォールバック: ページ全体のselectを走査
  const selects = document.querySelectorAll("select");
  for (const select of selects) {
    if (setSelectValue(select, targetText)) return true;
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

  // 方式1: input[type="file"]（hidden含む）
  const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  for (const fileInput of fileInputs) {
    const accept = fileInput.getAttribute("accept") || "";
    if (accept && !accept.includes("image")) continue;

    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    console.log(`[フリマアシスト] 画像: input[type="file"]にセット完了 (accept=${accept})`);
    return true;
  }

  // 方式2: ドロップゾーン
  const dropZones = document.querySelectorAll<HTMLElement>(
    '[class*="upload"], [class*="Upload"], [class*="drop"], [class*="Drop"], [class*="image"], [class*="Image"], [class*="photo"], [class*="Photo"], [data-testid*="image"], [data-testid*="photo"]'
  );
  for (const zone of dropZones) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    zone.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
    zone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }));
    zone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
    console.log(`[フリマアシスト] 画像: ドロップゾーンにドロップ (class=${zone.className?.slice(0, 40)})`);
    return true;
  }

  console.error(`[フリマアシスト] 画像: アップロード先が見つかりません`);
  return false;
}

/**
 * DOM診断: フォーム要素 + 画像アップロード関連要素
 */
function dumpFormElements() {
  console.log("=== [フリマアシスト] Yahoo!フリマ出品フォーム DOM診断 ===");
  console.log("URL:", location.href);

  // 全input/textarea/select
  const elements = document.querySelectorAll("input, textarea, select");
  console.log(`\nフォーム要素数: ${elements.length}`);
  elements.forEach((el, i) => {
    const attrs: Record<string, string | null> = {
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      id: el.id || null,
      placeholder: el.getAttribute("placeholder"),
      accept: el.getAttribute("accept"),
      "aria-label": el.getAttribute("aria-label"),
      "data-testid": el.getAttribute("data-testid"),
      role: el.getAttribute("role"),
      hidden: (el as HTMLElement).hidden ? "true" : null,
      className: (el.className || "").toString().slice(0, 80) || null,
    };
    const clean = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v != null));
    console.log(`  [${i}]`, JSON.stringify(clean));

    if (el.tagName === "SELECT") {
      const select = el as HTMLSelectElement;
      const opts = Array.from(select.options).map((o) => `"${o.value}" → "${o.text}"`);
      console.log(`    options: [${opts.join(", ")}]`);
    }
  });

  // 全label
  const labels = document.querySelectorAll("label");
  console.log(`\nlabel要素数: ${labels.length}`);
  labels.forEach((label, i) => {
    const forAttr = label.getAttribute("for");
    const nextTag = label.nextElementSibling?.tagName || "none";
    const parentTag = label.parentElement?.tagName || "none";
    console.log(`  label[${i}]: for="${forAttr}" text="${label.textContent?.trim().slice(0, 50)}" nextSibling=${nextTag} parent=${parentTag}`);
  });

  // input[type="file"]の詳細
  const fileInputs = document.querySelectorAll('input[type="file"]');
  console.log(`\ninput[type="file"]数: ${fileInputs.length}`);
  fileInputs.forEach((el, i) => {
    const input = el as HTMLInputElement;
    console.log(`  file[${i}]: accept="${input.accept}" multiple=${input.multiple} hidden=${input.hidden} class="${input.className?.slice(0, 60)}"`);
    // 親要素の情報
    const parent = input.parentElement;
    if (parent) {
      console.log(`    parent: tag=${parent.tagName} class="${parent.className?.slice(0, 60)}"`);
    }
  });

  // 画像アップロード関連の要素
  const uploadRelated = document.querySelectorAll(
    '[class*="upload"], [class*="Upload"], [class*="drop"], [class*="Drop"], [class*="image" i], [class*="photo" i], [data-testid*="image"], [data-testid*="photo"]'
  );
  console.log(`\n画像関連要素数: ${uploadRelated.length}`);
  uploadRelated.forEach((el, i) => {
    console.log(`  img[${i}]: tag=${el.tagName} class="${el.className?.toString().slice(0, 80)}" role="${el.getAttribute("role")}"`);
  });

  console.log("=== DOM診断おわり ===");
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

// ページ読み込み時にDOM診断ログを出力
setTimeout(() => {
  dumpFormElements();
}, 2000);
