import React from 'react';
import { Waves, ArrowUp, Compass } from 'lucide-react';
import { BasinTarget } from '../types';

interface TelemetryCardProps {
  basin: BasinTarget;
}

export const TelemetryCard: React.FC<TelemetryCardProps> = ({ basin }) => {
  return (
    <div className="bg-[#0d1c32]/90 backdrop-blur-2xl rounded p-4 shadow-2xl border border-[#00f0ff]/15 flex flex-col gap-2.5 pointer-events-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-[#43ffbb]" />
          <span className="font-mono text-[10px] text-[#d6e3ff] font-bold uppercase tracking-wider">
            {basin.name} Telemetry
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#00f0ff] font-semibold bg-[#112036] px-1.5 py-0.5 rounded border border-[#00f0ff]/20">
          LIVE INCOIS BUOY
        </span>
      </div>

      {/* Metric 2x2 cards */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {/* SST */}
        <div className="bg-[#112036] p-2.5 rounded border border-[#3b494b]/30 flex flex-col justify-between">
          <span className="font-mono text-[9px] text-[#b9cacb] uppercase tracking-wider font-bold">
            SURFACE TEMP (SST)
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="font-mono text-2xl text-[#dbfcff] font-bold tracking-tight">
              {basin.sst.toFixed(1)}
            </span>
            <span className="font-mono text-xs text-[#b9cacb]">°C</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-[#ffb4ab] mt-1">
            <ArrowUp size={11} />
            <span>{basin.sstAnomaly}</span>
          </div>
        </div>

        {/* SSS Salinity */}
        <div className="bg-[#112036] p-2.5 rounded border border-[#3b494b]/30 flex flex-col justify-between">
          <span className="font-mono text-[9px] text-[#b9cacb] uppercase tracking-wider font-bold">
            SALINITY (SSS)
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="font-mono text-2xl text-[#43ffbb] font-bold tracking-tight">
              {basin.salinity.toFixed(1)}
            </span>
            <span className="font-mono text-xs text-[#b9cacb]">PSU</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-[#b9cacb] mt-1 truncate">
            <span>Freshwater plume</span>
          </div>
        </div>

        {/* SWH Wave Height */}
        <div className="bg-[#112036] p-2.5 rounded border border-[#3b494b]/30 flex flex-col justify-between">
          <span className="font-mono text-[9px] text-[#b9cacb] uppercase tracking-wider font-bold">
            SIG WAVE HT (SWH)
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="font-mono text-2xl text-[#d6e3ff] font-bold tracking-tight">
              {basin.waveHeight.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-[#b9cacb]">m</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-[#43ffbb] mt-1">
            <span>Period: {basin.wavePeriod}</span>
          </div>
        </div>

        {/* Flow Vector */}
        <div className="bg-[#112036] p-2.5 rounded border border-[#3b494b]/30 flex flex-col justify-between">
          <span className="font-mono text-[9px] text-[#b9cacb] uppercase tracking-wider font-bold">
            FLOW VECTOR
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="font-mono text-2xl text-[#dbfcff] font-bold tracking-tight">
              {basin.flowVelocity.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-[#b9cacb]">m/s</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-[#b9cacb] mt-1">
            <Compass size={11} className="text-[#00f0ff]" />
            <span>Heading: {basin.flowHeading}</span>
          </div>
        </div>
      </div>

      {/* SST Gradient Scale Bar */}
      <div className="mt-1 flex flex-col gap-1 pt-1 border-t border-[#3b494b]/20">
        <div className="flex justify-between font-mono text-[10px] text-[#b9cacb]">
          <span className="uppercase">SST GRADIENT (24°C - 32°C)</span>
          <span className="text-[#43ffbb] font-bold">OPTIMAL</span>
        </div>
        <div className="h-2 w-full rounded-sm bg-gradient-to-r from-[#1c2a41] via-[#00f0ff] to-[#00e2a0]"></div>
        <div className="flex justify-between font-mono text-[10px] text-[#b9cacb]">
          <span>24.0°C</span>
          <span>28.0°C</span>
          <span>32.0°C</span>
        </div>
      </div>
    </div>
  );
};
