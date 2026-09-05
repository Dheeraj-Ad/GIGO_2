import React from 'react';
import { Radio, Anchor, Activity, ArrowUpRight, Database } from 'lucide-react';
import { NavigationScreen } from '../types';

interface SensorNetworkBentoProps {
  onNavigate: (screen: NavigationScreen) => void;
  onSelectSensorCategory?: (category: string) => void;
}

export const SensorNetworkBento: React.FC<SensorNetworkBentoProps> = ({
  onNavigate,
  onSelectSensorCategory,
}) => {
  return (
    <section className="w-full bg-[#0d1c32] px-4 lg:px-8 py-8 border-t border-[#3b494b]/30 flex flex-col gap-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[#43ffbb] uppercase font-bold tracking-wider">
              SURFACE &amp; VERTICAL INVENTORY
            </span>
            <span className="font-mono text-[10px] text-[#b9cacb]">
              GEO-POLYGON [INDIAN OCEAN BASIN]
            </span>
          </div>
          <h3 className="font-sans text-2xl lg:text-3xl text-[#dbfcff] font-bold tracking-tight">
            Autonomous Sensor Network Overview
          </h3>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#b9cacb]">
          <Database size={13} className="text-[#00f0ff]" />
          <span>ALL SENSORS SYNCED WITH INCOIS HYDERABAD HYDRAULIC REPOSITORY</span>
        </div>
      </div>

      {/* 3-Column Bento Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Core ARGO & Bio-Argo Floats */}
        <div 
          onClick={() => onNavigate('probe-telemetry')}
          className="bg-[#112036] hover:bg-[#1c2a41] border border-[#3b494b]/30 hover:border-[#00f0ff]/40 p-5 rounded transition-all group flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-[#00f0ff]" />
                <span className="font-mono text-[10px] text-[#00f0ff] uppercase font-bold tracking-wider">
                  PROFILING ARRAY
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#43ffbb] bg-[#010e24] px-1.5 py-0.5 rounded border border-[#43ffbb]/25 font-semibold">
                99.2% RECOVERY
              </span>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center justify-between">
                <h4 className="font-sans text-lg text-[#d6e3ff] font-semibold group-hover:text-[#00f0ff] transition-colors">
                  Core ARGO &amp; Bio-Argo Floats
                </h4>
                <ArrowUpRight size={16} className="text-[#b9cacb] group-hover:text-[#00f0ff] transition-colors" />
              </div>
              <p className="text-sm text-[#b9cacb] mt-1.5 leading-relaxed">
                Continuous vertical conductivity, temperature, and depth profiling from 0 down to -2,000 meters depth on 10-day cycles.
              </p>
            </div>
          </div>

          <div className="pt-6 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between font-mono text-xs">
              <span className="text-[#b9cacb]">Active Profilers in IO</span>
              <span className="text-[#00f0ff] font-bold">1,024 units</span>
            </div>
            <div className="w-full bg-[#010e24] h-1.5 rounded overflow-hidden">
              <div className="bg-[#00f0ff] h-full w-[88%] transition-all"></div>
            </div>
          </div>
        </div>

        {/* Card 2: Deep Sea Moored Buoys (OMNI / RAMA) */}
        <div 
          onClick={() => onNavigate('probe-telemetry')}
          className="bg-[#112036] hover:bg-[#1c2a41] border border-[#3b494b]/30 hover:border-[#43ffbb]/40 p-5 rounded transition-all group flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Anchor className="w-5 h-5 text-[#43ffbb]" />
                <span className="font-mono text-[10px] text-[#43ffbb] uppercase font-bold tracking-wider">
                  METOCEAN MOORINGS
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#00f0ff] bg-[#010e24] px-1.5 py-0.5 rounded border border-[#00f0ff]/25 font-semibold">
                INSAT RT-LINK
              </span>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center justify-between">
                <h4 className="font-sans text-lg text-[#d6e3ff] font-semibold group-hover:text-[#43ffbb] transition-colors">
                  OMNI &amp; RAMA Moored Network
                </h4>
                <ArrowUpRight size={16} className="text-[#b9cacb] group-hover:text-[#43ffbb] transition-colors" />
              </div>
              <p className="text-sm text-[#b9cacb] mt-1.5 leading-relaxed">
                High-frequency subsurface ADCP current meters, radiation sensors, and automated surface meteorological logging packages.
              </p>
            </div>
          </div>

          <div className="pt-6 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between font-mono text-xs">
              <span className="text-[#b9cacb]">Critical Deep Stations</span>
              <span className="text-[#43ffbb] font-bold">48 stations</span>
            </div>
            <div className="w-full bg-[#010e24] h-1.5 rounded overflow-hidden">
              <div className="bg-[#00e2a0] h-full w-[96%] transition-all"></div>
            </div>
          </div>
        </div>

        {/* Card 3: Deep Sea Acoustic & Tsunameter TLDs */}
        <div 
          onClick={() => onNavigate('anomaly-alerts')}
          className="bg-[#112036] hover:bg-[#1c2a41] border border-[#3b494b]/30 hover:border-[#ffb2b8]/40 p-5 rounded transition-all group flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#ffb2b8]" />
                <span className="font-mono text-[10px] text-[#ffb2b8] uppercase font-bold tracking-wider">
                  SEISMIC &amp; ACOUSTIC
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#ffb2b8] bg-[#010e24] px-1.5 py-0.5 rounded border border-[#ffb2b8]/25 font-semibold">
                BPR RECORDING
              </span>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center justify-between">
                <h4 className="font-sans text-lg text-[#d6e3ff] font-semibold group-hover:text-[#ffb2b8] transition-colors">
                  Bottom Pressure Recorders (BPR)
                </h4>
                <ArrowUpRight size={16} className="text-[#b9cacb] group-hover:text-[#ffb2b8] transition-colors" />
              </div>
              <p className="text-sm text-[#b9cacb] mt-1.5 leading-relaxed">
                Sub-millimeter hydrostatic sea-level pressure detection for immediate tsunami trigger assessment along subduction faults.
              </p>
            </div>
          </div>

          <div className="pt-6 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between font-mono text-xs">
              <span className="text-[#b9cacb]">Tsunameter Health Check</span>
              <span className="text-[#43ffbb] font-bold">100% Operational</span>
            </div>
            <div className="w-full bg-[#010e24] h-1.5 rounded overflow-hidden">
              <div className="bg-[#43ffbb] h-full w-[100%] transition-all"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
