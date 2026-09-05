import React, { useState } from 'react';
import { ArrowLeft, Layers, Compass, Eye, ShieldAlert, Sliders } from 'lucide-react';
import { BasinTarget } from '../types';

interface VolumetricBathymetryViewProps {
  activeBasin: BasinTarget;
  onBackToGlobe: () => void;
}

export const VolumetricBathymetryView: React.FC<VolumetricBathymetryViewProps> = ({
  activeBasin,
  onBackToGlobe,
}) => {
  const [selectedDepth, setSelectedDepth] = useState<number>(-1200);
  const [isoMetric, setIsoMetric] = useState<'temp' | 'salinity' | 'sound_speed' | 'oxygen'>('temp');

  const layers = [
    { name: 'Epipelagic (Sunlight)', range: '0m to -200m', temp: '29.4°C → 20.0°C', color: '#00f0ff' },
    { name: 'Mesopelagic (Thermocline)', range: '-200m to -1,000m', temp: '20.0°C → 5.0°C', color: '#00e2a0' },
    { name: 'Bathypelagic (Midnight)', range: '-1,000m to -4,000m', temp: '5.0°C → 2.0°C', color: '#27354c' },
    { name: 'Abyssopelagic (Abyss)', range: '-4,000m to -6,000m', temp: '2.0°C → 1.1°C', color: '#010e24' },
  ];

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 lg:p-8 flex flex-col gap-6 bg-[#041329]">
      {/* Header Bar */}
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
              Volumetric Bathymetry &amp; Isopycnal Slices
            </h2>
            <p className="font-mono text-xs text-[#b9cacb]">
              Basin: <span className="text-[#43ffbb]">{activeBasin.name}</span> • Max Sounding: {activeBasin.depth} m
            </p>
          </div>
        </div>

        {/* Metric Selector */}
        <div className="flex items-center gap-1 bg-[#112036] p-1 rounded border border-[#3b494b]/30">
          {(['temp', 'salinity', 'sound_speed', 'oxygen'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setIsoMetric(m)}
              className={`px-2.5 py-1 rounded font-mono text-xs uppercase transition-colors cursor-pointer ${
                isoMetric === m
                  ? 'bg-[#00f0ff] text-[#00363a] font-bold'
                  : 'text-[#b9cacb] hover:text-[#d6e3ff]'
              }`}
            >
              {m.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main 3D Depth Isometric Canvas Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Volumetric Water Column View */}
        <div className="lg:col-span-2 bg-[#0d1c32] rounded-lg p-6 border border-[#00f0ff]/15 relative overflow-hidden flex flex-col justify-between min-h-[480px]">
          {/* Depth Grid Lines */}
          <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#00f0ff_1px,transparent_1px)] [background-size:24px_24px]"></div>

          <div className="flex items-center justify-between z-10">
            <span className="font-mono text-xs text-[#43ffbb] font-bold">
              3D ISOPYCNAL DENSITY SLICE (HYCOM + ARGO CTD)
            </span>
            <span className="font-mono text-xs text-[#b9cacb]">
              VERTICAL RESOLUTION: 10m INTERVALS
            </span>
          </div>

          {/* Graphical Layer Slices Simulation */}
          <div className="my-6 relative w-full h-80 flex flex-col justify-between py-2 border-l-2 border-[#00f0ff]/40 pl-4">
            {layers.map((layer, idx) => (
              <div
                key={layer.name}
                className="relative group p-3 rounded bg-[#112036]/80 hover:bg-[#1c2a41] border border-[#3b494b]/40 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: layer.color }}
                  ></div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[#dbfcff]">
                      {layer.name}
                    </span>
                    <span className="font-mono text-xs text-[#b9cacb]">
                      Depth Range: {layer.range}
                    </span>
                  </div>
                </div>

                <div className="font-mono text-xs text-[#00f0ff] font-medium">
                  {layer.temp}
                </div>
              </div>
            ))}

            {/* Active Slicing Plane Cursor */}
            <div
              className="absolute left-0 right-0 h-1 bg-[#00f0ff] shadow-[0_0_12px_#00f0ff] pointer-events-none transition-all flex items-center justify-end pr-2"
              style={{
                top: `${((Math.abs(selectedDepth) / 5000) * 100).toFixed(0)}%`,
              }}
            >
              <span className="font-mono text-[10px] text-[#00363a] font-bold bg-[#00f0ff] px-1.5 py-0.5 rounded -translate-y-4">
                ACTIVE SLICE: {selectedDepth}m
              </span>
            </div>
          </div>

          {/* Interactive Depth Slider */}
          <div className="z-10 bg-[#112036] p-3 rounded border border-[#3b494b]/30 flex flex-col gap-2">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-[#b9cacb]">DEPTH SLICE CONTROL:</span>
              <span className="text-[#00f0ff] font-bold">{selectedDepth} METERS</span>
            </div>
            <input
              type="range"
              min="-5000"
              max="0"
              step="50"
              value={selectedDepth}
              onChange={(e) => setSelectedDepth(parseInt(e.target.value))}
              className="w-full h-2 bg-[#27354c] rounded appearance-none cursor-pointer accent-[#00f0ff]"
            />
            <div className="flex justify-between font-mono text-[10px] text-[#b9cacb]">
              <span>Surface (0m)</span>
              <span>Thermocline (-800m)</span>
              <span>Abyssal Trench (-5,000m)</span>
            </div>
          </div>
        </div>

        {/* Right Info & Acoustic Wave Velocity */}
        <div className="bg-[#0d1c32] rounded-lg p-6 border border-[#00f0ff]/15 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#43ffbb]" />
            <h3 className="font-sans text-base font-bold text-[#dbfcff]">
              Ocean Hydrophysics Profile
            </h3>
          </div>

          {/* SOFAR Channel Indicator */}
          <div className="bg-[#112036] p-3.5 rounded border border-[#3b494b]/30 flex flex-col gap-2">
            <span className="font-mono text-[10px] text-[#43ffbb] font-bold uppercase">
              SOFAR ACOUSTIC CHANNEL
            </span>
            <p className="text-xs text-[#b9cacb] leading-relaxed">
              Sound Fixing and Ranging channel locked at <strong>-850 meters depth</strong> in the Bay of Bengal. Low frequency sound propagates thousands of kilometers with minimal transmission loss.
            </p>
            <div className="flex items-center justify-between font-mono text-xs pt-1">
              <span className="text-[#b9cacb]">Sound Speed:</span>
              <span className="text-[#dbfcff] font-bold">1,488.4 m/s</span>
            </div>
          </div>

          {/* Oxygen Minimum Zone (OMZ) */}
          <div className="bg-[#112036] p-3.5 rounded border border-[#3b494b]/30 flex flex-col gap-2">
            <span className="font-mono text-[10px] text-[#ffb4ab] font-bold uppercase">
              OXYGEN MINIMUM ZONE (OMZ)
            </span>
            <p className="text-xs text-[#b9cacb] leading-relaxed">
              Intense sub-surface denitrification zone active between -150m and -600m. Dissolved oxygen drops below 0.2 ml/L.
            </p>
            <div className="flex items-center justify-between font-mono text-xs pt-1">
              <span className="text-[#b9cacb]">Dissolved O₂:</span>
              <span className="text-[#ffb4ab] font-bold">0.14 ml/L</span>
            </div>
          </div>

          {/* Basin Stratification Index */}
          <div className="bg-[#112036] p-3.5 rounded border border-[#3b494b]/30 flex flex-col gap-1.5">
            <div className="flex justify-between font-mono text-xs">
              <span className="text-[#b9cacb]">Stratification Energy:</span>
              <span className="text-[#00f0ff] font-bold">428 J/m²</span>
            </div>
            <div className="w-full bg-[#010e24] h-1.5 rounded overflow-hidden">
              <div className="bg-[#00f0ff] h-full w-[74%]"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
