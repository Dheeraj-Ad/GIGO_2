import React from 'react';
import { OceanAnomaly } from '../types';
import { AlertTriangle, X, ShieldAlert, Waves, MapPin, Calendar, Layers, Activity } from 'lucide-react';

interface AnomalyDetailModalProps {
  anomaly: OceanAnomaly | null;
  onClose: () => void;
  onJumpToBasin?: () => void;
}

export const AnomalyDetailModal: React.FC<AnomalyDetailModalProps> = ({
  anomaly,
  onClose,
}) => {
  if (!anomaly) return null;

  const getSeverityBadge = (sev: OceanAnomaly['severity']) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/40 ring-red-500/20';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/40 ring-orange-500/20';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 ring-yellow-500/20';
      default:
        return 'bg-[#00f0ff]/20 text-[#00f0ff] border-[#00f0ff]/40 ring-[#00f0ff]/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0d1c32]/95 backdrop-blur-2xl border border-[#00f0ff]/40 rounded-2xl p-6 shadow-2xl shadow-[#00f0ff]/20 flex flex-col overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#ff4d6d] via-[#ffb703] to-[#00f0ff]"></div>

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400 shadow-lg">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#b9cacb]">{anomaly.id}</span>
                <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full border font-bold ring-2 ${getSeverityBadge(anomaly.severity)}`}>
                  {anomaly.severity} ALERT
                </span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-wide mt-0.5">{anomaly.name}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#b9cacb] hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 font-mono text-xs">
          {/* Key Metrics Bento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#041329]/90 p-3 rounded-xl border border-white/5">
            <div>
              <span className="text-[10px] text-[#b9cacb] block">DELTA ANOMALY</span>
              <span className="text-[#ff4d6d] font-bold text-sm">{anomaly.deltaValue}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#b9cacb] block">DEPTH RANGE</span>
              <span className="text-[#00f0ff] font-bold text-sm">{anomaly.depthRange}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#b9cacb] block">SPATIAL AREA</span>
              <span className="text-[#43ffbb] font-bold text-sm">{(anomaly.affectedAreaKm2 / 1000).toFixed(0)}k km²</span>
            </div>
            <div>
              <span className="text-[10px] text-[#b9cacb] block">DETECTED</span>
              <span className="text-[#dbfcff] font-bold text-sm">{anomaly.detectedDate}</span>
            </div>
          </div>

          {/* Coordinates & Region */}
          <div className="flex items-center justify-between text-xs text-[#b9cacb] bg-[#071324]/80 px-3 py-2 rounded-lg border border-white/5">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#00f0ff]" />
              {Math.abs(anomaly.lat).toFixed(2)}°{anomaly.lat >= 0 ? 'N' : 'S'}, {Math.abs(anomaly.lon).toFixed(2)}°E
            </span>
            <span className="flex items-center gap-1.5 font-bold text-white">
              <Waves className="w-3.5 h-3.5 text-[#43ffbb]" />
              {anomaly.basin}
            </span>
          </div>

          {/* Summary */}
          <div>
            <span className="text-[10px] font-bold text-[#b9cacb] block mb-1">SCIENTIFIC OBSERVATION SUMMARY</span>
            <div className="bg-[#041329]/80 p-3 rounded-xl border border-[#00f0ff]/15 text-[#dbfcff] leading-relaxed text-xs">
              {anomaly.summary}
            </div>
          </div>

          {/* Oceanographic Advisory */}
          <div>
            <span className="text-[10px] font-bold text-[#ffb703] block mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              OPERATIONAL MARINE ADVISORY
            </span>
            <div className="bg-amber-950/20 p-3 rounded-xl border border-amber-500/30 text-amber-200 leading-relaxed text-xs">
              {anomaly.advisory}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#00f0ff] text-[#00363a] font-mono text-xs font-bold rounded-xl cursor-pointer hover:bg-[#00dbe9] shadow-lg shadow-[#00f0ff]/20 transition"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
