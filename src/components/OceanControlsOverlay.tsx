import React from 'react';
import { OceanVariable, OceanDepth, LayerToggles, BasinTarget } from '../types';
import { GridSlice, VolumeSlice } from '../services/oceanApi';
import { DEPTH_LEVELS, VARIABLE_CONFIGS } from '../data/oceanData';
import {
  Layers,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Eye,
  EyeOff,
  Maximize2,
  Waves,
  Sparkles,
  Info,
} from 'lucide-react';

interface OceanControlsOverlayProps {
  activeBasin: BasinTarget;
  activeVariable: OceanVariable;
  onChangeVariable: (v: OceanVariable) => void;
  activeDepth: OceanDepth;
  onChangeDepth: (d: OceanDepth) => void;
  verticalExaggeration: number;
  onChangeVerticalExaggeration: (val: number) => void;
  upperVolumeMode: 'semi-transparent' | 'hidden';
  onChangeUpperVolumeMode: (mode: 'semi-transparent' | 'hidden') => void;
  layerToggles: LayerToggles;
  onToggleLayer: (key: keyof LayerToggles) => void;
  isPlayingTime: boolean;
  onTogglePlayTime: () => void;
  simTimeStep: number;
  onResetTime: () => void;
  onReturnToGlobe: () => void;
  modelStatus?: 'loading' | 'live' | 'fallback';
  liveSlice?: GridSlice | null;
  liveVolume?: VolumeSlice | null;
}

export const OceanControlsOverlay: React.FC<OceanControlsOverlayProps> = ({
  activeBasin,
  activeVariable,
  onChangeVariable,
  activeDepth,
  onChangeDepth,
  verticalExaggeration,
  onChangeVerticalExaggeration,
  upperVolumeMode,
  onChangeUpperVolumeMode,
  layerToggles,
  onToggleLayer,
  isPlayingTime,
  onTogglePlayTime,
  simTimeStep,
  onResetTime,
  onReturnToGlobe,
  modelStatus = 'fallback',
  liveSlice,
  liveVolume,
}) => {
  const currentVarConfig = VARIABLE_CONFIGS[activeVariable];

  // Calculate simulated date from time step
  const getSimulatedDateString = (step: number) => {
    const base = new Date('2026-09-04T08:00:00Z');
    base.setHours(base.getHours() + step * 3);
    return base.toUTCString().replace('GMT', 'UTC');
  };

  // Depth stratum classification and physical estimates
  const getDepthMeta = (depth: number) => {
    switch (depth) {
      case 0:
        return {
          zone: 'SURFACE LAYER (EPIPELAGIC)',
          tempEst: '29.4°C',
          salEst: '33.2 PSU',
          desc: 'Sunlit mixed layer, direct solar irradiance, atmospheric exchange',
          pressure: '1.0 dbar',
        };
      case 50:
        return {
          zone: 'MIXED LAYER BASE (EPIPELAGIC)',
          tempEst: '28.8°C',
          salEst: '34.1 PSU',
          desc: 'Turbulent boundary layer with wind-driven Ekman shearing',
          pressure: '50.4 dbar',
        };
      case 100:
        return {
          zone: 'UPPER THERMOCLINE FRONT',
          tempEst: '23.2°C',
          salEst: '34.8 PSU',
          desc: 'Rapid thermal transition front with deep chlorophyll maxima',
          pressure: '101.1 dbar',
        };
      case 200:
        return {
          zone: 'CORE THERMOCLINE / PYCNOCLINE',
          tempEst: '16.5°C',
          salEst: '35.0 PSU',
          desc: 'Maximum density gradient and cyclonic eddy shear zone',
          pressure: '202.8 dbar',
        };
      case 400:
        return {
          zone: 'PERMANENT PYCNOCLINE',
          tempEst: '11.2°C',
          salEst: '34.9 PSU',
          desc: 'Sub-thermocline intermediate layer with attenuated velocity',
          pressure: '406.4 dbar',
        };
      case 500:
        return {
          zone: 'MESOPELAGIC (TWILIGHT ZONE)',
          tempEst: '9.6°C',
          salEst: '34.9 PSU',
          desc: 'Aphotic zone, minimal photosynthetic activity, high stability',
          pressure: '508.6 dbar',
        };
      case 1000:
      default:
        return {
          zone: 'DEEP MESOPELAGIC / BATHYPELAGIC',
          tempEst: '6.2°C',
          salEst: '34.8 PSU',
          desc: 'Antarctic Intermediate Water (AAIW) boundary, uniform cold water',
          pressure: '1018.2 dbar',
        };
    }
  };

  const depthMeta = getDepthMeta(activeDepth);

  return (
    <>
      {/* 1. Top Datum & Quick Return Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-none">
        <div className="flex items-center gap-2.5 bg-[#0d1c32]/95 backdrop-blur-xl px-3.5 py-1.5 rounded-xl border border-[#00f0ff]/30 shadow-2xl pointer-events-auto">
          <button
            onClick={onReturnToGlobe}
            className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#00f0ff] hover:text-[#43ffbb] transition cursor-pointer pr-2.5 border-r border-white/10"
          >
            <span>← RETURN TO GLOBE</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#43ffbb] animate-pulse shadow-sm shadow-[#43ffbb]"></span>
            <span className="font-mono text-xs font-bold text-white tracking-wide">
              {activeBasin.name.toUpperCase()}
            </span>
            <span className="font-mono text-[10px] text-[#00f0ff] bg-[#00f0ff]/15 px-2 py-0.5 rounded font-bold border border-[#00f0ff]/30">
              3D VOLUMETRIC SLICING ENGINE
            </span>
            <span className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold border ${
              modelStatus === 'live'
                ? 'text-[#43ffbb] border-[#43ffbb]/30 bg-[#43ffbb]/10'
                : modelStatus === 'loading'
                  ? 'text-[#ffb703] border-[#ffb703]/30 bg-[#ffb703]/10'
                  : 'text-[#b9cacb] border-[#b9cacb]/30 bg-[#b9cacb]/10'
            }`}>
              {modelStatus === 'live' ? 'BACKEND MODEL' : modelStatus === 'loading' ? 'LOADING MODEL' : 'PROCEDURAL FALLBACK'}
            </span>
          </div>
        </div>

        {/* Live Simulation Timestamp Badge */}
        <div className="flex items-center gap-2 bg-[#0d1c32]/95 backdrop-blur-xl px-3.5 py-1.5 rounded-xl border border-[#00f0ff]/30 shadow-2xl pointer-events-auto font-mono text-xs text-[#b9cacb]">
          <span className="text-[10px] text-[#00f0ff] font-bold">HYCOM 1/12°</span>
          <span className="text-[#dbfcff] font-bold">{getSimulatedDateString(simTimeStep)}</span>
        </div>
      </div>

      {/* 2. Right Floating Dock: Depth Slicing, Vertical Exaggeration, & Controls */}
      <div className="absolute top-16 right-4 w-76 lg:w-88 z-20 pointer-events-auto flex flex-col gap-3">
        {/* Prominent Depth Controller Card */}
        <div className="bg-[#0d1c32]/95 backdrop-blur-xl p-4 rounded-2xl border border-[#00f0ff]/30 shadow-2xl">
          {/* Prominent Current Depth Header */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[11px] font-bold text-[#b9cacb] flex items-center gap-1.5 tracking-wider">
              <Sliders className="w-3.5 h-3.5 text-[#00f0ff]" />
              ACTIVE SLICING PLANE
            </span>
            <span className="font-mono text-[10px] text-[#43ffbb] bg-[#43ffbb]/10 px-2 py-0.5 rounded border border-[#43ffbb]/30 font-bold">
              {depthMeta.zone}
            </span>
          </div>

          {/* Prominent Depth Reading Value */}
          <div className="flex items-baseline justify-between mb-3 bg-[#041329]/80 px-3 py-2 rounded-xl border border-[#00f0ff]/20">
            <div>
              <div className="text-[10px] font-mono text-[#b9cacb]">CURRENT DEPTH</div>
              <div className="font-mono text-2xl font-extrabold text-[#00f0ff] tracking-tight drop-shadow-[0_0_12px_rgba(0,240,255,0.4)]">
                {activeDepth === 0 ? 'Depth: 0 m (Surface)' : `Depth: ${activeDepth} m`}
              </div>
            </div>
            <div className="text-right font-mono text-xs text-[#b9cacb]">
              <div className="text-[#43ffbb] font-bold">
                {activeVariable === 'TEMPERATURE'
                  ? depthMeta.tempEst
                  : activeVariable === 'SALINITY'
                  ? depthMeta.salEst
                  : depthMeta.pressure}
              </div>
              {liveSlice && (
                <div className="mt-1 text-[10px] text-[#b9cacb]">
                  Grid {liveSlice.lat.length}x{liveSlice.lon.length} | range {liveSlice.value_range[0].toFixed(2)} to {liveSlice.value_range[1].toFixed(2)} {liveSlice.units}
                </div>
              )}
              {liveVolume && (
                <div className="text-[10px] text-[#b9cacb]">
                  Volume {liveVolume.depths_m.length} depth levels
                </div>
              )}
              <div className="text-[10px] text-[#b9cacb]/70">{depthMeta.pressure}</div>
            </div>
          </div>

          {/* Quick Exact Depth Buttons */}
          <div className="mb-3">
            <div className="text-[10px] font-mono text-[#b9cacb] mb-1.5 flex items-center justify-between">
              <span>EXACT DEPTH LEVELS:</span>
              <span className="text-[#00f0ff]">SMOOTH 3D ANIMATION</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {DEPTH_LEVELS.map((d) => (
                <button
                  key={d}
                  onClick={() => onChangeDepth(d)}
                  className={`py-1.5 px-1 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer border text-center ${
                    activeDepth === d
                      ? 'bg-[#00f0ff] text-[#00363a] border-[#00f0ff] shadow-lg shadow-[#00f0ff]/30 scale-105 ring-1 ring-[#00f0ff]'
                      : 'bg-[#041329] text-[#b9cacb] hover:text-[#00f0ff] border-white/10 hover:border-[#00f0ff]/40'
                  }`}
                >
                  {d === 0 ? '0m' : `${d}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Continuous Depth Slider */}
          <div className="space-y-1 mb-3">
            <div className="flex items-center justify-between font-mono text-[10px] text-[#b9cacb]">
              <span>0m (SURFACE)</span>
              <span className="text-[#00f0ff] font-bold">{activeDepth} m</span>
              <span>1000m (ABYSS)</span>
            </div>
            <input
              type="range"
              min="0"
              max="1000"
              step="25"
              value={activeDepth}
              onChange={(e) => {
                const val = Number(e.target.value);
                // Snap to closest depth level
                const closest = DEPTH_LEVELS.reduce((prev, curr) =>
                  Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
                );
                onChangeDepth(closest);
              }}
              className="w-full accent-[#00f0ff] cursor-pointer h-2 bg-[#041329] rounded-lg appearance-none border border-white/10"
            />
          </div>

          {/* Volume Above Slicing Plane Visibility Toggle */}
          <div className="flex items-center justify-between text-xs font-mono pt-2.5 border-t border-white/10">
            <span className="text-[#b9cacb] text-[11px] flex items-center gap-1">
              <Eye className="w-3 h-3 text-[#00f0ff]" />
              Volume Above Slice:
            </span>
            <div className="flex items-center gap-1 bg-[#041329] p-0.5 rounded-lg border border-white/10">
              <button
                onClick={() => onChangeUpperVolumeMode('semi-transparent')}
                className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                  upperVolumeMode === 'semi-transparent'
                    ? 'bg-[#00f0ff] text-[#00363a] shadow-sm'
                    : 'text-[#b9cacb] hover:text-white'
                }`}
                title="Ghosted semi-transparent volume above slice"
              >
                Ghosted
              </button>
              <button
                onClick={() => onChangeUpperVolumeMode('hidden')}
                className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                  upperVolumeMode === 'hidden'
                    ? 'bg-[#00f0ff] text-[#00363a] shadow-sm'
                    : 'text-[#b9cacb] hover:text-white'
                }`}
                title="Hide volume above slice for clear cross-section"
              >
                Hidden
              </button>
            </div>
          </div>
        </div>

        {/* Vertical Exaggeration Card (1x to 5x) */}
        <div className="bg-[#0d1c32]/95 backdrop-blur-xl p-3.5 rounded-2xl border border-[#00f0ff]/30 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-bold text-[#b9cacb] flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-[#43ffbb]" />
              VERTICAL EXAGGERATION
            </span>
            <span className="font-mono text-xs font-bold text-[#43ffbb] bg-[#43ffbb]/10 px-2 py-0.5 rounded border border-[#43ffbb]/30">
              {verticalExaggeration.toFixed(1)}x
            </span>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <input
              type="range"
              min="1.0"
              max="5.0"
              step="0.1"
              value={verticalExaggeration}
              onChange={(e) => onChangeVerticalExaggeration(Number(e.target.value))}
              className="flex-1 accent-[#43ffbb] cursor-pointer h-2 bg-[#041329] rounded-lg appearance-none border border-white/10"
            />
          </div>

          {/* Quick Exaggeration Presets */}
          <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
            {[1.0, 2.0, 3.5, 5.0].map((preset) => (
              <button
                key={preset}
                onClick={() => onChangeVerticalExaggeration(preset)}
                className={`py-1 rounded text-center cursor-pointer transition border ${
                  Math.abs(verticalExaggeration - preset) < 0.05
                    ? 'bg-[#43ffbb] text-[#00363a] font-bold border-[#43ffbb]'
                    : 'bg-[#041329] text-[#b9cacb] hover:text-white border-white/10'
                }`}
              >
                {preset === 1 ? '1.0x (1:1)' : `${preset.toFixed(1)}x`}
              </button>
            ))}
          </div>
        </div>

        {/* Oceanic Visual Layers Toggles Card */}
        <div className="bg-[#0d1c32]/95 backdrop-blur-xl p-3.5 rounded-2xl border border-[#00f0ff]/30 shadow-2xl">
          <span className="font-mono text-xs font-bold text-[#b9cacb] block mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#00f0ff]" />
            OCEANIC VISUAL LAYERS
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {(
              [
                { key: 'waterSurface', label: 'Wave Surface', color: '#7df4ff' },
                { key: 'currents', label: 'Flow Vectors', color: '#00f0ff' },
                { key: 'probes', label: 'Probes Array', color: '#43ffbb' },
                { key: 'anomalies', label: 'Anomalies', color: '#ff4d6d' },
                { key: 'bathymetryMesh', label: 'Seafloor Terrain', color: '#38bdf8' },
                { key: 'seafloorContours', label: 'Isobath Contours', color: '#2dd4bf' },
              ] as const
            ).map((layer) => {
              const active = layerToggles[layer.key];
              return (
                <button
                  key={layer.key}
                  onClick={() => onToggleLayer(layer.key)}
                  className={`py-1.5 px-2.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-between border ${
                    active
                      ? 'bg-[#041329] border-[#00f0ff]/40 text-white shadow-sm'
                      : 'bg-[#020b18]/60 border-white/5 text-[#b9cacb]/50'
                  }`}
                >
                  <span className="text-[11px]">{layer.label}</span>
                  {active ? (
                    <Eye className="w-3 h-3 text-[#00f0ff]" />
                  ) : (
                    <EyeOff className="w-3 h-3 opacity-40" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

    </>
  );
};

