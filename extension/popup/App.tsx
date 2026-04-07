import { useState, useEffect } from "react";
import type { ProductData } from "../utils/api";
import { fetchProductData, fillForm, generateDescription } from "../utils/api";

type Status = "idle" | "loading" | "success" | "error";

export default function App() {
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [fetchStatus, setFetchStatus] = useState<Status>("idle");
  const [fillStatus, setFillStatus] = useState<Status>("idle");
  const [aiStatus, setAiStatus] = useState<Status>("idle");
  const [aiDescription, setAiDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"main" | "settings">("main");

  const handleFetch = async () => {
    setFetchStatus("loading");
    setErrorMessage("");
    try {
      const data = await fetchProductData();
      setProductData(data);
      setFetchStatus("success");
    } catch (err) {
      setFetchStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "取得に失敗しました"
      );
    }
  };

  const handleFill = async (platform: "rakuma" | "yahooflea") => {
    if (!productData) return;
    setFillStatus("loading");
    setErrorMessage("");

    const dataToFill = {
      ...productData,
      description: aiDescription || productData.description,
      condition: productData.condition,
      images: productData.images,
    };

    try {
      await fillForm(platform, dataToFill);
      setFillStatus("success");
      alert("転記が完了しました。内容を確認して出品ボタンを押してください。");
    } catch (err) {
      setFillStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "転記に失敗しました"
      );
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
      setErrorMessage(
        err instanceof Error ? err.message : "AI生成に失敗しました"
      );
    }
  };

  const platformLabel = {
    rakuma: "ラクマ",
    yahooflea: "Yahoo!フリマ",
  } as const;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3">
        <h1 className="text-lg font-bold">フリマ出品アシスト AI</h1>
        <p className="text-xs text-blue-100">
          メルカリ → ラクマ・Yahoo!フリマ 転記ツール
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab("main")}
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === "main"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500"
          }`}
        >
          メイン
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === "settings"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500"
          }`}
        >
          設定
        </button>
      </div>

      {activeTab === "main" ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Step 1: 取得 */}
          <section className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">
                STEP 1
              </span>
              <h2 className="text-sm font-semibold">メルカリから取得</h2>
            </div>
            <button
              onClick={handleFetch}
              disabled={fetchStatus === "loading"}
              className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {fetchStatus === "loading" ? "取得中..." : "商品情報を取得"}
            </button>

            {productData && fetchStatus === "success" && (
              <div className="mt-3 text-xs space-y-1 bg-gray-50 rounded p-3">
                <p>
                  <span className="font-semibold text-gray-600">タイトル:</span>{" "}
                  {productData.title || "(未取得)"}
                </p>
                <p>
                  <span className="font-semibold text-gray-600">価格:</span> ¥
                  {productData.price || "---"}
                </p>
                {productData.condition && (
                  <p>
                    <span className="font-semibold text-gray-600">状態:</span>{" "}
                    {productData.condition}
                  </p>
                )}
                <p>
                  <span className="font-semibold text-gray-600">画像:</span>{" "}
                  {productData.images.length}枚（転記時に自動アップロード）
                </p>
                <p className="text-gray-500 truncate">
                  {productData.description?.slice(0, 60) || "(説明なし)"}...
                </p>
              </div>
            )}
          </section>

          {/* Step 2: AI生成 */}
          <section className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded">
                STEP 2
              </span>
              <h2 className="text-sm font-semibold">AI説明文生成</h2>
              <span className="text-xs text-gray-400 ml-auto">任意</span>
            </div>
            <button
              onClick={handleGenerate}
              disabled={!productData || aiStatus === "loading"}
              className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {aiStatus === "loading" ? "生成中..." : "AIで説明文を生成"}
            </button>

            {aiDescription && (
              <div className="mt-3">
                <textarea
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  className="w-full h-32 text-xs border border-gray-300 rounded-lg p-2 resize-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 outline-none"
                  placeholder="生成された説明文がここに表示されます"
                />
                <p className="text-xs text-gray-400 mt-1">
                  編集してからの転記も可能です
                </p>
              </div>
            )}
          </section>

          {/* Step 3: 転記 */}
          <section className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">
                STEP 3
              </span>
              <h2 className="text-sm font-semibold">他サイトに転記</h2>
            </div>
            <div className="space-y-2">
              {(["rakuma", "yahooflea"] as const).map((platform) => (
                <button
                  key={platform}
                  onClick={() => handleFill(platform)}
                  disabled={!productData || fillStatus === "loading"}
                  className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                >
                  {fillStatus === "loading"
                    ? "転記中..."
                    : `${platformLabel[platform]}に転記`}
                </button>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded">
              転記後、内容を確認してから出品ボタンを押してください
            </p>
          </section>

          {/* Error */}
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg">
              {errorMessage}
            </div>
          )}
        </div>
      ) : (
        <SettingsTab />
      )}

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 text-center">
        <p className="text-xs text-gray-400">
          フリマ出品アシスト AI v0.1.0 — 自動出品ツールではありません
        </p>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [licenseKey, setLicenseKey] = useState("");
  const [saved, setSaved] = useState(false);

  const loadKey = async () => {
    const { licenseKey: key } = await chrome.storage.local.get("licenseKey");
    if (key) setLicenseKey(key);
  };

  const saveKey = async () => {
    await chrome.storage.local.set({ licenseKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    loadKey();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <section className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold mb-3">ライセンスキー</h2>
        <input
          type="text"
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
          placeholder="ライセンスキーを入力"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
        />
        <button
          onClick={saveKey}
          className="mt-2 w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 rounded-lg transition-colors text-sm"
        >
          {saved ? "保存しました" : "保存"}
        </button>
      </section>

      <section className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold mb-2">プランについて</h2>
        <div className="text-xs text-gray-600 space-y-1">
          <p>
            <span className="font-semibold">Free:</span> 転記 1日3回 / AI生成
            1日3回
          </p>
          <p>
            <span className="font-semibold">Pro (¥980/月):</span> 転記 無制限 /
            AI生成 1日30回
          </p>
        </div>
      </section>
    </div>
  );
}
