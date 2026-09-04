import React from 'react';
import { SensorNode } from '../types';
import { X, Activity, Battery, Radio, Gauge, Thermometer, Droplets, Navigation, Layers } from 'lucide-react';
import { DEPTH_LEVELS } from '../data/oceanData';

interface ProbeDetailPanelProps {
  probe: SensorNode | null;
  onClose: () => void;
  activeDepth: number;
  onSelectDepth: (depth: any) => void;
  onAlignSliceToProbe?: (depth: number) => void;
}

export const ProbeDetailPanel: React.FC<ProbeDetailPanelProps> = ({
  probe,
  onClose,
  activeDepth,
  onSelectDepth,
  onAlignSliceToProbe,
}) => {
  const isGlider = probe?.type === 'GLIDER';
  const isArgo = probe?.type === 'ARGO';
  const accentColor = isGlider ? '#ffb703' : isArgo ? '#00f0ff' : '#43ffbb';

  if (!probe) return null;

  const probeObservedDepth = Math.abs(probe.depth);

  return (
    <div className="fixed top-20 right-4 w-96 max-w-[calc(100vw-2rem)] z-40 bg-[#071324]/95 backdrop-blur-2xl border border-[#00f0ff]/30 rounded-2xl shadow-2xl shadow-[#00f0ff]/15 flex flex-col overflow-hidden animate-in slide-in-from-right-8 duration-300">
      {/* Header with Distinct Probe Classification Badge */}
      <div className="p-4 border-b border-[#00f0ff]/15 flex items-center justify-between bg-[#040e1c]/90">
        <div className="flex items-center gap-2.5">
          <div
            style={{
              backgroundColor: `${accentColor}18`,
              borderColor: `${accentColor}50`,
              color: accentColor,
            }}
            className="w-9 h-9 rounded-xl border flex items-center justify-center shadow-lg"
          >
            {isGlider ? (
              <Navigation className="w-5 h-5 -rotate-45" />
            ) : isArgo ? (
              <Radio className="w-5 h-5 animate-pulse" />
            ) : (
              <Activity className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-white tracking-wider">{probe.id}</span>
              <span
                style={{
                  backgroundColor: `${accentColor}20`,
                  color: accentColor,
                  borderColor: `${accentColor}50`,
                }}
                className="font-mono text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider"
              >
                {isGlider ? 'Autonomous Glider' : isArgo ? 'Profiling Argo' : probe.type}
              </span>
            </div>
            <div className="text-[11px] text-[#94a3b8] font-mono truncate max-w-[210px]">{probe.name}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#94a3b8] hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 overflow-y-auto max-h-[calc(100vh-12rem)] space-y-4">
        {/* Quick Position, Status & Dynamic Heading/Drift Spec */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#020b17]/90 p-2.5 rounded-xl border border-white/5">
          <div>
            <span className="text-[#64748b] text-[10px] block font-semibold">GEOGRAPHIC COORD</span>
            <span className="text-[#dbfcff] font-bold">
              {Math.abs(probe.lat).toFixed(2)}°{probe.lat >= 0 ? 'N' : 'S'}, {Math.abs(probe.lon).toFixed(2)}°E
            </span>
            <span className="text-[#64748b] text-[10px] block mt-1">STATUS</span>
            <div className="flex items-center gap-1.5 text-[#43ffbb] font-bold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-[#43ffbb] animate-ping inline-block" />
              <span>{probe.status}</span>
            </div>
          </div>
          <div>
            <span className="text-[#64748b] text-[10px] block font-semibold">
              {isGlider ? 'HEADING & SPEED' : 'SENSOR SUITE'}
            </span>
            {isGlider ? (
              <div className="text-[#dbfcff] font-bold">
                {probe.heading || 42}° ({((probe.heading || 42) > 0 && (probe.heading || 42) < 90) ? 'NE' : 'SE'}) • {(probe.speedKnots || 1.2).toFixed(1)} kn
              </div>
            ) : (
              <div className="text-[#dbfcff] font-bold text-[11px]">
                Sea-Bird SBE 41CP CTD
              </div>
            )}
            <span className="text-[#64748b] text-[10px] block mt-1">BATTERY HEALTH</span>
            <div className="flex items-center gap-1.5 text-[#43ffbb] font-bold text-[11px]">
              <Battery className="w-3.5 h-3.5" />
              <span>{probe.battery}% • Nominal</span>
            </div>
          </div>
        </div>

        {/* Clean Telemetry Table (Requested explicitly by User) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-bold text-[#b9cacb] flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#00f0ff]" />
              TELEMETRY DATA TABLE
            </span>
            <span className="font-mono text-[10px] bg-[#00f0ff]/10 text-[#00f0ff] px-2 py-0.5 rounded-md border border-[#00f0ff]/25 font-bold">
              CURRENT DEPTH: {probeObservedDepth}m
            </span>
          </div>

          <div className="bg-[#020b17]/95 rounded-xl border border-[#00f0ff]/20 overflow-hidden shadow-inner">
            <table className="w-full text-xs font-mono text-left">
              <tbody>
                <tr className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-2.5 px-3 text-[#94a3b8] flex items-center gap-1.5 font-medium">
                    <Thermometer className="w-3.5 h-3.5 text-[#ff4d6d]" /> Temperature
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#00f0ff]">
                    {probe.sst.toFixed(2)} °C
                  </td>
                </tr>
                <tr className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-2.5 px-3 text-[#94a3b8] flex items-center gap-1.5 font-medium">
                    <Droplets className="w-3.5 h-3.5 text-[#43ffbb]" /> Salinity
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#43ffbb]">
                    {probe.salinity.toFixed(2)} PSU
                  </td>
                </tr>
                <tr className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-2.5 px-3 text-[#94a3b8] flex items-center gap-1.5 font-medium">
                    <Gauge className="w-3.5 h-3.5 text-[#7df4ff]" /> Pressure
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#d6e3ff]">
                    {probe.pressure.toFixed(1)} dbar
                  </td>
                </tr>
                <tr className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-2.5 px-3 text-[#94a3b8] flex items-center gap-1.5 font-medium">
                    <Activity className="w-3.5 h-3.5 text-[#ffb703]" /> Chlorophyll
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#ffb703]">
                    {probe.chlorophyll.toFixed(2)} mg/m³
                  </td>
                </tr>
                <tr className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-2.5 px-3 text-[#94a3b8] flex items-center gap-1.5 font-medium">
                    <Droplets className="w-3.5 h-3.5 text-[#7df4ff]" /> Humidity
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#7df4ff]">
                    {(probe.humidity ?? 0).toFixed(1)} %
                  </td>
                </tr>
                <tr className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-2.5 px-3 text-[#94a3b8] flex items-center gap-1.5 font-medium">
                    <Layers className="w-3.5 h-3.5 text-[#a78bfa]" /> Depth
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#dbfcff]">
                    {probeObservedDepth.toFixed(2)} meters
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Slice Jump to Depth Levels */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-[#94a3b8] font-bold">
              ALIGN SLICE PLANE TO PROBE STRATUM:
            </span>
            {onAlignSliceToProbe && (
              <button
                onClick={() => onAlignSliceToProbe(probeObservedDepth)}
                className="text-[10px] font-mono font-bold text-[#00f0ff] hover:underline cursor-pointer"
              >
                Snap to {probeObservedDepth}m
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {DEPTH_LEVELS.map((depth) => (
              <button
                key={depth}
                onClick={() => onSelectDepth(depth)}
                className={`py-1.5 rounded-lg font-mono text-[11px] font-bold transition cursor-pointer border ${
                  Math.abs(activeDepth) === depth
                    ? 'bg-[#00f0ff] text-[#00363a] border-[#00f0ff] shadow-sm'
                    : 'bg-[#020b17] text-[#94a3b8] hover:text-[#00f0ff] border-white/5'
                }`}
              >
                {depth}m
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

