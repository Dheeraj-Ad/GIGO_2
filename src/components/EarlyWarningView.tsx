import React, { useEffect, useState } from 'react';
import { ArrowLeft, ShieldAlert, Radio, ExternalLink, RefreshCw } from 'lucide-react';
import { GNewsArticle, hasGNewsApiKey, oceanApi } from '../services/oceanApi';

interface EarlyWarningViewProps {
  onBackToGlobe: () => void;
}

export const EarlyWarningView: React.FC<EarlyWarningViewProps> = ({ onBackToGlobe }) => {
  const [news, setNews] = useState<GNewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);

  const loadNews = async () => {
    setNewsLoading(true);
    setNewsError(false);
    try {
      setNews(await oceanApi.getMarineNews());
    } catch {
      setNewsError(true);
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    void loadNews();
  }, []);

  const formatPublishedAt = (publishedAt: string) =>
    new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(publishedAt));

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 lg:p-8 flex flex-col gap-6 bg-[#041329]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1c32] p-4 rounded border border-[#00f0ff]/20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToGlobe}
            className="p-2 rounded bg-[#112036] hover:bg-[#1c2a41] text-[#00f0ff] border border-[#00f0ff]/30 transition-all flex items-center gap-1.5 cursor-pointer font-mono text-xs"
          >
            <ArrowLeft size={16} />
            <span>RETURN TO 3D GLOBE</span>
          </button>
          <div>
            <h2 className="font-sans text-xl font-bold text-[#dbfcff]">
              ITEWS Indian Ocean Tsunami Early Warning Center
            </h2>
            <p className="font-mono text-xs text-[#b9cacb]">
              INCOIS Hyderabad 24/7 Crisis Command • Subduction Seismic Detection Latency: &lt; 5 mins
            </p>
          </div>
        </div>

        <span className="font-mono text-xs text-[#ffb703] font-bold">LIVE NEWS SOURCE: GNEWS</span>
      </div>

      {/* Live Bulletins and Hazard Alerts */}
      <div className="bg-[#0d1c32] rounded-lg p-6 border border-[#00f0ff]/15 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#00f0ff]" />
            <h3 className="font-sans text-base font-bold text-[#dbfcff]">
              Live Marine Advisory News
            </h3>
          </div>
          <span className="font-mono text-xs text-[#ffb703]">SOURCE: GNEWS API</span>
        </div>
        <p className="font-mono text-[10px] text-[#94a3b8] leading-relaxed">
          FILTER: Indian Ocean | Bay of Bengal | Arabian Sea | Andaman + ocean probe | Argo float | glider | bottom pressure recorder | seismometer | seismic | tsunami | earthquake
        </p>

        <div className="flex flex-col gap-3">
          {news.map((article) => (
            <a
              key={`bulletin-${article.url}`}
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="group p-4 rounded border border-[#ffb703]/40 bg-[#211d13] hover:border-[#ffb703] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Radio className="w-5 h-5 text-[#ffb703]" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-[#dbfcff]">
                      GNEWS LIVE • OCEAN / SEISMIC
                    </span>
                    <span className="font-mono text-[10px] text-[#b9cacb]">
                      [{formatPublishedAt(article.publishedAt)} UTC]
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-[#d6e3ff] mt-0.5">
                    {article.title}
                  </span>
                  {article.description && (
                    <p className="text-xs text-[#b9cacb] mt-1 leading-relaxed line-clamp-2">
                      {article.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:items-end shrink-0">
                <span className="font-mono text-xs font-bold text-[#ffb703]">LIVE NEWS</span>
                <span className="font-mono text-[10px] text-[#b9cacb] mt-0.5">
                  Src: {article.source.name} <ExternalLink size={11} className="inline ml-1" />
                </span>
              </div>
            </a>
          ))}
          {!newsLoading && !newsError && hasGNewsApiKey && news.length === 0 && (
            <p className="text-xs text-[#b9cacb]">No live GNews advisories matched the configured ocean and seismic filter.</p>
          )}
          {!newsLoading && !hasGNewsApiKey && (
            <p className="text-xs text-[#ffb4ab]">No live bulletins displayed because the GNews API key is not configured.</p>
          )}
        </div>
      </div>

      {/* External marine news context */}
      <div className="bg-[#0d1c32] rounded-lg p-6 border border-[#ffb703]/20 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#ffb703]" />
            <h3 className="font-sans text-base font-bold text-[#dbfcff]">Live Ocean Probe &amp; Seismic News</h3>
          </div>
          <button
            type="button"
            onClick={() => void loadNews()}
            disabled={newsLoading}
            aria-label="Refresh regional marine news"
            className="p-2 rounded bg-[#112036] border border-[#ffb703]/30 text-[#ffb703] hover:bg-[#1c2a41] disabled:opacity-50 transition cursor-pointer"
          >
            <RefreshCw size={14} className={newsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {!hasGNewsApiKey && (
          <p className="text-xs text-[#b9cacb]">Configure VITE_GNEWS_API_KEY to load live GNews headlines for ocean probes, seismic activity, and tsunamis.</p>
        )}
        {newsError && (
          <p className="text-xs text-[#ffb4ab]">Live GNews data is temporarily unavailable. No simulated advisories are shown.</p>
        )}
        {newsLoading && <p className="text-xs text-[#b9cacb]">Querying regional marine headlines...</p>}
        {!newsLoading && news.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {news.map((article) => (
              <a
                key={article.url}
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="group p-4 rounded border border-[#3b494b]/40 bg-[#112036] hover:border-[#ffb703]/60 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[10px] text-[#ffb703] uppercase">{article.source.name}</span>
                  <ExternalLink size={13} className="text-[#94a3b8] group-hover:text-[#ffb703] shrink-0" />
                </div>
                <h4 className="mt-2 text-sm font-semibold text-[#d6e3ff] leading-snug">{article.title}</h4>
                {article.description && <p className="mt-1.5 text-xs text-[#b9cacb] line-clamp-2">{article.description}</p>}
                <time className="block mt-3 font-mono text-[10px] text-[#64748b]" dateTime={article.publishedAt}>
                  {formatPublishedAt(article.publishedAt)} UTC
                </time>
              </a>
            ))}
          </div>
        )}
        {!newsLoading && !newsError && hasGNewsApiKey && news.length === 0 && (
          <p className="text-xs text-[#b9cacb]">No matching marine headlines were returned.</p>
        )}
      </div>
    </div>
  );
};
