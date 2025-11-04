import { useCallback, useMemo, useState } from "react";

const API = "http://localhost:2000";

function App() {
  // Single scrape
  const [oneUrl, setOneUrl] = useState("");
  const [oneLoading, setOneLoading] = useState(false);
  const [oneResult, setOneResult] = useState(null);
  const [oneError, setOneError] = useState("");

  // Batch scrape
  const [batchText, setBatchText] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState(null);
  const [batchError, setBatchError] = useState("");

  const validBatchUrls = useMemo(() => {
    return batchText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [batchText]);

  const onScrapeOne = useCallback(async () => {
    setOneError("");
    setOneLoading(true);
    setOneResult(null);
    try {
      const u = new URL(`${API}/api/scrape-one`);
      u.searchParams.set("url", oneUrl.trim());
      const res = await fetch(u.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to scrape");
      setOneResult(data); // { saved, outPath, meta, payload }
    } catch (e) {
      setOneError(e.message);
    } finally {
      setOneLoading(false);
    }
  }, [oneUrl]);

  const onScrapeBatch = useCallback(async () => {
    setBatchError("");
    setBatchLoading(true);
    setBatchResult(null);
    try {
      const res = await fetch(`${API}/api/scrape-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: validBatchUrls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to scrape batch");
      setBatchResult(data); // { files:[{url,title,words,outPath}], errors:[] ... }
    } catch (e) {
      setBatchError(e.message);
    } finally {
      setBatchLoading(false);
    }
  }, [validBatchUrls]);

  const downloadJSON = useCallback((obj, filename = "article.json") => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-10">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-2xl border border-gray-200 p-6 md:p-8">
        <h1 className="text-3xl font-bold text-center text-blue-700 mb-2">
          📰 Full-Text News Scraper (React)
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Backend: <code className="px-1 py-0.5 bg-gray-100 rounded">/api/scrape-one</code> &{" "}
          <code className="px-1 py-0.5 bg-gray-100 rounded">/api/scrape-batch</code>
        </p>

        {/* Single URL */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">1) Scrape one URL</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              type="url"
              placeholder="Paste a news article URL…"
              value={oneUrl}
              onChange={(e) => setOneUrl(e.target.value)}
            />
            <button
              onClick={onScrapeOne}
              disabled={!oneUrl.trim() || oneLoading}
              className={`px-5 py-2 rounded-lg font-medium text-white ${
                oneLoading || !oneUrl.trim()
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {oneLoading ? "Scraping…" : "Scrape"}
            </button>
          </div>

          {oneError && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              {oneError}
            </div>
          )}

          {oneResult && (
            <div className="mt-6 border border-gray-200 rounded-xl p-4">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    {oneResult?.payload?.title || oneResult?.meta?.title || "Untitled"}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {oneResult?.payload?.author || oneResult?.meta?.author || "Unknown author"}
                    {" · "}
                    {oneResult?.payload?.publishedAt ||
                      oneResult?.meta?.publishedAt ||
                      "Unknown date"}
                    {" · "}
                    {oneResult?.meta?.words ?? oneResult?.payload?.wordCount ?? 0} words
                  </p>
                  <p className="text-xs text-gray-400 mt-1 break-all">
                    Saved: {oneResult?.outPath}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      downloadJSON(
                        oneResult.payload ?? oneResult,
                        `${(oneResult?.payload?.title || "article").slice(0, 60)}.json`
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
                  >
                    Download JSON
                  </button>
                </div>
              </div>

              <hr className="my-4" />

              <ArticlePreview text={oneResult?.payload?.text} paragraphs={oneResult?.payload?.paragraphs} />
            </div>
          )}
        </section>

        <hr className="my-8" />

        {/* Batch URLs */}
        <section>
          <h2 className="text-xl font-semibold mb-3">2) Scrape a batch (one URL per line)</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <textarea
              className="border border-gray-300 rounded-lg px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[160px]"
              placeholder={"https://news-site.com/article-1\nhttps://another.com/news/abc\n..."}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            <div className="flex flex-col justify-between gap-3">
              <div className="text-sm text-gray-600">
                <div>Detected URLs: <b>{validBatchUrls.length}</b></div>
                <div className="text-xs text-gray-400 mt-1">
                  Tip: paste links from Google News results after resolving to the real publisher URL.
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onScrapeBatch}
                  disabled={batchLoading || validBatchUrls.length === 0}
                  className={`px-5 py-2 rounded-lg font-medium text-white ${
                    batchLoading || validBatchUrls.length === 0
                      ? "bg-emerald-300 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {batchLoading ? "Scraping…" : "Scrape Batch"}
                </button>
                <button
                  onClick={() => {
                    setBatchText("");
                    setBatchResult(null);
                    setBatchError("");
                  }}
                  className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium"
                >
                  Reset
                </button>
              </div>
              {batchError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
                  {batchError}
                </div>
              )}
            </div>
          </div>

          {batchResult && (
            <div className="mt-6">
              <BatchSummary data={batchResult} />
            </div>
          )}
        </section>
      </div>

      <footer className="text-center text-sm text-gray-500 mt-8">
        © {new Date().getFullYear()} Full-Text Scraper UI — React + Tailwind
      </footer>
    </div>
  );
}

function ArticlePreview({ text, paragraphs }) {
  const blocks = useMemo(() => {
    if (Array.isArray(paragraphs) && paragraphs.length > 0) return paragraphs;
    if (typeof text === "string" && text.trim()) return text.split(/\n{2,}/);
    return [];
  }, [text, paragraphs]);

  if (!blocks.length) {
    return <p className="text-gray-500 italic">No text extracted.</p>;
  }

  return (
    <div className="space-y-3 max-h-[420px] overflow-auto pr-2">
      {blocks.map((p, idx) => (
        <p key={idx} className="leading-7 text-gray-800">
          {p}
        </p>
      ))}
    </div>
  );
}

function BatchSummary({ data }) {
  const { requested, saved, failed, files = [], errors = [], outDir } = data;

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="px-2 py-1 rounded bg-gray-100">Requested: {requested}</span>
        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700">Saved: {saved}</span>
        <span className="px-2 py-1 rounded bg-red-100 text-red-700">Failed: {failed}</span>
        <span className="px-2 py-1 rounded bg-gray-100">Out dir: {outDir}</span>
      </div>

      {!!files.length && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Words</th>
                <th className="py-2 pr-4">File</th>
                <th className="py-2 pr-4">URL</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                  <td className="py-2 pr-4">{f.title || "Untitled"}</td>
                  <td className="py-2 pr-4">{f.words ?? 0}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500 break-all">{f.outPath}</td>
                  <td className="py-2 pr-4 text-xs text-blue-700 break-all">
                    <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {f.url}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">
            Open a saved file from disk if you serve the <code>/data</code> folder statically, or just
            scrape the URL again with “Scrape one” to preview and download the JSON directly.
          </p>
        </div>
      )}

      {!!errors.length && (
        <div className="mt-4">
          <h4 className="font-semibold mb-1">Errors</h4>
          <ul className="list-disc list-inside text-sm text-red-600">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="text-gray-700">{e.url}</span> — {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
