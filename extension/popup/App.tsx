import { useState, useEffect } from "react";
import type { ProductData, FillResult, TransferRecord, DescriptionTemplate } from "../utils/api";
import {
  fetchProductData, fillForm, generateDescription,
  saveTransferRecord, getTransferHistory,
  getTemplates, saveTemplates, getListingUrls,
} from "../utils/api";

type Status = "idle" | "loading" | "success" | "error";

export default function App() {
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [fetchStatus, setFetchStatus] = useState<Status>("idle");
  const [fillStatus, setFillStatus] = useState<Status>("idle");
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [fillingPlatform, setFillingPlatform] = useState<string>("");
  const [aiStatus, setAiStatus] = useState<Status>("idle");
  const [aiDescription, setAiDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"main" | "settings" | "history">("main");

  const handleFetch = async () => {
    setFetchStatus("loading");
    setErrorMessage("");
    try {
      const data = await fetchProductData();
      setProductData(data);
      setFetchStatus("success");
    } catch (err) {
      setFetchStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "取得に失敗しました");
    }
  };

  const handleFill = async (platform: "rakuma" | "yahooflea") => {
    if (!productData) return;
    setFillStatus("loading");
    setFillResult(null);
    setFillingPlatform(platform === "rakuma" ? "ラクマ" : "Yahoo!フリマ");
    setErrorMessage("");

    const dataToFill = {
      ...productData,
      description: aiDescription || productData.description,
      condition: productData.condition,
      images: productData.images,
    };

    try {
      const result = await fillForm(platform, dataToFill);
      setFillResult(result);
      setFillStatus("success");

      // 転記履歴を保存
      await saveTransferRecord({
        id: Date.now().toString(),
        date: new Date().toLocaleString("ja-JP"),
        title: productData.title,
        price: productData.price,
        platform,
        result,
      });
    } catch (err) {
      setFillStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "転記に失敗しました");
    }
  };

  const handleGenerate = async () => {
    if (!productData) return;
    setAiStatus("loading");
    setErrorMessage("");
    try {
      const result = await generateDescription({
        title: productData.title,
        description: productData.description,
        images: productData.images.slice(0, 3),
      });
      setAiDescription(result.generatedDescription);
      setAiStatus("success");
    } catch (err) {
      setAiStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "AI生成に失敗しました");
    }
  };

  const platformLabel = { rakuma: "ラクマ", yahooflea: "Yahoo!フリマ" } as const;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3">
        <h1 className="text-lg font-bold">フリマ出品アシスト AI</h1>
        <p className="text-xs text-blue-100">メルカリ → ラクマ・Yahoo!フリマ 転記ツール</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 bg-white">
        {(["main", "settings", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm font-medium ${
              activeTab === tab ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"
            }`}
          >
            {tab === "main" ? "メイン" : tab === "settings" ? "設定" : "履歴"}
          </button>
        ))}
      </div>

      {activeTab === "main" ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Step 1: 取得 */}
          <section className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">STEP 1</span>
              <h2 className="text-sm font-semibold">メルカリから取得</h2>
            </div>
            <button onClick={handleFetch} disabled={fetchStatus === "loading"}
              className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
              {fetchStatus === "loading" ? "取得中..." : "商品情報を取得"}
            </button>

            {productData && fetchStatus === "success" && (
              <div className="mt-3 text-xs space-y-2 bg-gray-50 rounded p-3">
                <p><span className="font-semibold text-gray-600">タイトル:</span> {productData.title || "(未取得)"}</p>
                <p><span className="font-semibold text-gray-600">価格:</span> ¥{productData.price || "---"}</p>
                {productData.condition && (
                  <p><span className="font-semibold text-gray-600">状態:</span> {productData.condition}</p>
                )}
                {/* 画像プレビュー */}
                {productData.images.length > 0 && (
                  <div>
                    <span className="font-semibold text-gray-600">画像: {productData.images.length}枚</span>
                    <div className="flex gap-1 mt-1 overflow-x-auto">
                      {productData.images.slice(0, 5).map((url, i) => (
                        <img key={i} src={url} alt={`商品画像${i + 1}`}
                          className="w-12 h-12 object-cover rounded border border-gray-200 flex-shrink-0" />
                      ))}
                      {productData.images.length > 5 && (
                        <div className="w-12 h-12 flex items-center justify-center bg-gray-200 rounded text-xs text-gray-500 flex-shrink-0">
                          +{productData.images.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-gray-500 truncate">{productData.description?.slice(0, 60) || "(説明なし)"}...</p>
              </div>
            )}
          </section>

          {/* Step 2: AI生成 + テンプレート */}
          <section className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded">STEP 2</span>
              <h2 className="text-sm font-semibold">AI説明文生成</h2>
              <span className="text-xs text-gray-400 ml-auto">任意</span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleGenerate} disabled={!productData || aiStatus === "loading"}
                className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
                {aiStatus === "loading" ? "生成中..." : "AIで生成"}
              </button>
              <TemplateButton onInsert={(text) => setAiDescription(text)} currentText={aiDescription} />
            </div>

            {aiDescription && (
              <div className="mt-3">
                <textarea value={aiDescription} onChange={(e) => setAiDescription(e.target.value)}
                  className="w-full h-32 text-xs border border-gray-300 rounded-lg p-2 resize-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 outline-none"
                  placeholder="生成された説明文がここに表示されます" />
                <p className="text-xs text-gray-400 mt-1">編集してからの転記も可能です</p>
              </div>
            )}
          </section>

          {/* Step 3: 転記 */}
          <section className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">STEP 3</span>
              <h2 className="text-sm font-semibold">他サイトに転記</h2>
            </div>
            <div className="space-y-2">
              {(["rakuma", "yahooflea"] as const).map((platform) => (
                <button key={platform} onClick={() => handleFill(platform)}
                  disabled={!productData || fillStatus === "loading"}
                  className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
                  {fillStatus === "loading" && fillingPlatform === platformLabel[platform]
                    ? "転記中..." : `${platformLabel[platform]}に転記`}
                </button>
              ))}
            </div>

            {/* 転記結果の進捗表示 */}
            {fillResult && fillStatus === "success" && (
              <TransferResult result={fillResult} platform={fillingPlatform} />
            )}

            <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded">
              転記後、内容を確認してから出品ボタンを押してください
            </p>
          </section>

          {/* 一括転記 */}
          <BatchTransfer />

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg">
              {errorMessage}
            </div>
          )}
        </div>
      ) : activeTab === "settings" ? (
        <SettingsTab />
      ) : (
        <HistoryTab />
      )}

      <div className="bg-white border-t border-gray-200 px-4 py-2 text-center">
        <p className="text-xs text-gray-400">フリマ出品アシスト AI v0.1.0</p>
      </div>
    </div>
  );
}

// --- 転記結果表示 ---
function TransferResult({ result, platform }: { result: FillResult; platform: string }) {
  const fields = [
    { key: "title", label: "タイトル" },
    { key: "description", label: "説明文" },
    { key: "price", label: "価格" },
    { key: "condition", label: "商品の状態" },
    { key: "shipping", label: "配送方法" },
    { key: "shippingDays", label: "発送日数" },
    { key: "prefecture", label: "発送元地域" },
    { key: "images", label: "画像" },
  ];

  return (
    <div className="mt-3 bg-gray-50 rounded p-3">
      <p className="text-xs font-semibold text-gray-600 mb-2">{platform} 転記結果:</p>
      <div className="grid grid-cols-2 gap-1">
        {fields.map(({ key, label }) => {
          const value = result[key as keyof FillResult];
          if (value === undefined) return null;
          return (
            <div key={key} className="flex items-center gap-1 text-xs">
              <span className={value ? "text-green-600" : "text-red-500"}>
                {value ? "OK" : "NG"}
              </span>
              <span className="text-gray-600">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- テンプレートボタン ---
function TemplateButton({ onInsert, currentText }: { onInsert: (text: string) => void; currentText: string }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<DescriptionTemplate[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    getTemplates().then(setTemplates);
  }, [open]);

  const handleSave = async () => {
    if (!currentText || !newName) return;
    const updated = [...templates, { id: Date.now().toString(), name: newName, text: currentText }];
    await saveTemplates(updated);
    setTemplates(updated);
    setNewName("");
  };

  const handleDelete = async (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    await saveTemplates(updated);
    setTemplates(updated);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 px-3 rounded-lg transition-colors text-sm whitespace-nowrap">
        テンプレ
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">テンプレート</p>
          {templates.length === 0 && (
            <p className="text-xs text-gray-400 mb-2">保存済みテンプレートなし</p>
          )}
          <div className="space-y-1 max-h-32 overflow-y-auto mb-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-1">
                <button onClick={() => { onInsert(t.text); setOpen(false); }}
                  className="flex-1 text-left text-xs bg-gray-50 hover:bg-blue-50 p-1.5 rounded truncate">
                  {t.name}
                </button>
                <button onClick={() => handleDelete(t.id)}
                  className="text-red-400 hover:text-red-600 text-xs px-1">x</button>
              </div>
            ))}
          </div>
          {currentText && (
            <div className="border-t border-gray-100 pt-2">
              <p className="text-xs text-gray-500 mb-1">現在の説明文を保存:</p>
              <div className="flex gap-1">
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="テンプレート名" className="flex-1 text-xs border rounded px-2 py-1" />
                <button onClick={handleSave} disabled={!newName}
                  className="text-xs bg-blue-500 text-white px-2 py-1 rounded disabled:bg-gray-300">保存</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- 一括転記 ---
function BatchTransfer() {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, title: "" });

  const handleLoadUrls = async () => {
    setLoading(true);
    try {
      const found = await getListingUrls();
      setUrls(found);
    } catch {
      setUrls([]);
    }
    setLoading(false);
  };

  const handleBatch = async (platform: "rakuma" | "yahooflea") => {
    if (urls.length === 0) return;
    setBatchRunning(true);
    const platformLabel = platform === "rakuma" ? "ラクマ" : "Yahoo!フリマ";

    for (let i = 0; i < urls.length; i++) {
      setProgress({ current: i + 1, total: urls.length, title: "処理中..." });

      try {
        // 商品ページに移動
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.update(tab.id, { url: urls[i] });
          // ページ読み込みを待つ
          await new Promise((r) => setTimeout(r, 3000));
        }

        // 商品情報取得
        const data = await fetchProductData();
        setProgress({ current: i + 1, total: urls.length, title: data.title.slice(0, 15) + "..." });

        // 転記
        const result = await fillForm(platform, data);

        // 履歴保存
        await saveTransferRecord({
          id: Date.now().toString(),
          date: new Date().toLocaleString("ja-JP"),
          title: data.title,
          price: data.price,
          platform,
          result,
        });

        // 次の処理まで少し待つ
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error("[バッチ] " + urls[i] + " 失敗:", err);
      }
    }

    setBatchRunning(false);
    alert(`一括転記完了: ${urls.length}件を${platformLabel}に転記しました。各出品の内容を確認してください。`);
  };

  return (
    <section className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded">一括</span>
        <h2 className="text-sm font-semibold">一括転記</h2>
      </div>

      <button onClick={handleLoadUrls} disabled={loading || batchRunning}
        className="w-full bg-orange-100 hover:bg-orange-200 text-orange-700 font-medium py-2 rounded-lg transition-colors text-xs mb-2">
        {loading ? "読み込み中..." : "メルカリ出品一覧から商品を取得"}
      </button>

      {urls.length > 0 && !batchRunning && (
        <div>
          <p className="text-xs text-gray-600 mb-2">{urls.length}件の商品を検出</p>
          <div className="flex gap-2">
            <button onClick={() => handleBatch("rakuma")}
              className="flex-1 bg-pink-500 hover:bg-pink-600 text-white font-medium py-2 rounded-lg text-xs">
              ラクマに一括転記
            </button>
            <button onClick={() => handleBatch("yahooflea")}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2 rounded-lg text-xs">
              Yahoo!に一括転記
            </button>
          </div>
        </div>
      )}

      {batchRunning && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>{progress.title}</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-orange-500 h-2 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-2">
        メルカリの出品一覧ページで実行してください
      </p>
    </section>
  );
}

// --- 転記履歴タブ ---
function HistoryTab() {
  const [history, setHistory] = useState<TransferRecord[]>([]);

  useEffect(() => {
    getTransferHistory().then(setHistory);
  }, []);

  const platformLabel = { rakuma: "ラクマ", yahooflea: "Yahoo!フリマ" } as const;

  const exportCsv = () => {
    if (history.length === 0) return;
    const header = "日時,商品名,価格,転記先,タイトル,説明文,価格,状態,配送,日数,地域,画像";
    const rows = history.map((r) => {
      const res = r.result || {};
      const ok = (v?: boolean) => v ? "OK" : "NG";
      return [
        r.date,
        `"${r.title.replace(/"/g, '""')}"`,
        r.price,
        platformLabel[r.platform],
        ok(res.title), ok(res.description), ok(res.price),
        ok(res.condition), ok(res.shipping), ok(res.shippingDays),
        ok(res.prefecture), ok(res.images),
      ].join(",");
    });
    const csv = "\uFEFF" + header + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `furima-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = async () => {
    if (!confirm("転記履歴をすべて削除しますか？")) return;
    await chrome.storage.local.set({ transferHistory: [] });
    setHistory([]);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">転記履歴</h2>
        <div className="flex gap-2">
          {history.length > 0 && (
            <>
              <button onClick={exportCsv}
                className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">
                CSV出力
              </button>
              <button onClick={clearHistory}
                className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300">
                削除
              </button>
            </>
          )}
        </div>
      </div>
      {history.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">まだ転記履歴がありません</p>
      ) : (
        <>
          <p className="text-xs text-gray-400">{history.length}件の転記履歴</p>
          {history.map((record) => (
            <div key={record.id} className="bg-white rounded-lg shadow-sm p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-700 truncate flex-1">{record.title}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded text-white text-[10px] ${
                  record.platform === "rakuma" ? "bg-pink-500" : "bg-red-500"
                }`}>
                  {platformLabel[record.platform]}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-400">
                <span>¥{record.price}</span>
                <span>{record.date}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// --- 設定タブ ---
const RAKUMA_SHIPPING_OPTIONS = [
  { value: "", label: "選択しない（手動）" },
  { value: "かんたんラクマパック（日本郵便）", label: "かんたんラクマパック（日本郵便）" },
  { value: "かんたんラクマパック（ヤマト運輸）", label: "かんたんラクマパック（ヤマト運輸）" },
  { value: "未定", label: "未定" },
  { value: "送料込み（出品者負担）", label: "送料込み（出品者負担）" },
  { value: "着払い（購入者負担）", label: "着払い（購入者負担）" },
];

const YAHOO_SHIPPING_OPTIONS = [
  { value: "", label: "選択しない（手動）" },
  { value: "おてがる配送（ヤマト運輸）", label: "おてがる配送（ヤマト運輸）" },
  { value: "おてがる配送（日本郵便）", label: "おてがる配送（日本郵便）" },
];

const SHIPPING_DAYS_OPTIONS = [
  { value: "", label: "選択しない（手動）" },
  { value: "1~2日", label: "1~2日で発送" },
  { value: "2~3日", label: "2~3日で発送" },
  { value: "3~7日", label: "3~7日で発送" },
];

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

function SettingsTab() {
  const [licenseKey, setLicenseKey] = useState("");
  const [rakumaShipping, setRakumaShipping] = useState("");
  const [yahooShipping, setYahooShipping] = useState("");
  const [shippingDays, setShippingDays] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [saved, setSaved] = useState(false);

  const loadSettings = async () => {
    const data = await chrome.storage.local.get([
      "licenseKey", "rakumaShipping", "yahooShipping", "shippingDays", "prefecture",
    ]);
    if (data.licenseKey) setLicenseKey(data.licenseKey);
    if (data.rakumaShipping) setRakumaShipping(data.rakumaShipping);
    if (data.yahooShipping) setYahooShipping(data.yahooShipping);
    if (data.shippingDays) setShippingDays(data.shippingDays);
    if (data.prefecture) setPrefecture(data.prefecture);
  };

  const saveSettings = async () => {
    await chrome.storage.local.set({ licenseKey, rakumaShipping, yahooShipping, shippingDays, prefecture });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => { loadSettings(); }, []);

  const sc = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none bg-white";

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <section className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold mb-3">ライセンスキー</h2>
        <input type="text" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)}
          placeholder="ライセンスキーを入力" className={sc} />
      </section>

      <section className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold mb-3">デフォルト設定</h2>
        <div className="space-y-3">
          {([
            { label: "ラクマ配送", value: rakumaShipping, setter: setRakumaShipping, options: RAKUMA_SHIPPING_OPTIONS },
            { label: "Yahoo!フリマ配送", value: yahooShipping, setter: setYahooShipping, options: YAHOO_SHIPPING_OPTIONS },
            { label: "発送日数", value: shippingDays, setter: setShippingDays, options: SHIPPING_DAYS_OPTIONS },
          ] as const).map(({ label, value, setter, options }) => (
            <div key={label}>
              <label className="text-xs text-gray-600 font-medium">{label}</label>
              <select value={value} onChange={(e) => setter(e.target.value)} className={sc + " mt-1"}>
                {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-600 font-medium">発送元地域</label>
            <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} className={sc + " mt-1"}>
              <option value="">選択しない（手動）</option>
              {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </section>

      <button onClick={saveSettings}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 rounded-lg transition-colors text-sm">
        {saved ? "保存しました！" : "設定を保存"}
      </button>

      <section className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold mb-2">プラン</h2>
        <div className="text-xs text-gray-600 space-y-1">
          <p><span className="font-semibold">Free:</span> AI生成 1日3回</p>
          <p><span className="font-semibold">Pro (¥980/月):</span> AI生成 1日30回</p>
        </div>
      </section>
    </div>
  );
}
