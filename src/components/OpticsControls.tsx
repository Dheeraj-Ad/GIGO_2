import React from 'react';
import { 
  Video, 
  SunMedium, 
  Cloud, 
  Minus, 
  Plus, 
  RotateCcw,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { OpticsSettings } from '../types';

interface OpticsControlsProps {
  optics: OpticsSettings;
  onChangeOptics: (newOptics: OpticsSettings) => void;
  onOpenEarlyWarning?: () => void;
}

export const OpticsControls: React.FC<OpticsControlsProps> = ({
  optics,
  onChangeOptics,
  onOpenEarlyWarning,
}) => {
  const handleProjection = (mode: 'PERSPECTIVE' | 'ORTHOGRAPHIC') => {
    onChangeOptics({ ...optics, projection: mode });
  };

  const handleExaggeration = (val: number) => {
    onChangeOptics({ ...optics, bathymetryExaggeration: val });
  };

  const handleToggleTerminator = (enabled: boolean) => {
    onChangeOptics({ ...optics, dayNightTerminator: enabled });
  };

  const handleToggleClouds = (enabled: boolean) => {
    onChangeOptics({ ...optics, cloudCover: enabled });
  };

  const handleZoom = (delta: number) => {
    const next = Math.max(0.8, Math.min(3.0, optics.opticalMagnification + delta));
    onChangeOptics({ ...optics, opticalMagnification: parseFloat(next.toFixed(2)) });
  };

  const handleReset = () => {
    onChangeOptics({
      projection: 'PERSPECTIVE',
      bathymetryExaggeration: 2.4,
      dayNightTerminator: true,
      cloudCover: true,
      opticalMagnification: 1.4,
    });
  };

  return (
    <div className="flex flex-col gap-3 pointer-events-none">
      {/* Controls Container */}
      <div className="bg-[#0d1c32]/90 backdrop-blur-2xl rounded p-4 shadow-2xl border border-[#00f0ff]/15 flex flex-col gap-3.5 pointer-events-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-[#00f0ff]" />
            <h2 className="font-mono text-[11px] text-[#00f0ff] tracking-wider uppercase font-bold">
              Optics &amp; Spatial Controls
            </h2>
          </div>
          <span className="font-mono text-[11px] text-[#b9cacb]">CAM-01</span>
        </div>

        {/* Projection Mode Toggle */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[9px] text-[#b9cacb] uppercase tracking-wider font-bold">
            PROJECTION MODE
          </span>
          <div className="grid grid-cols-2 p-0.5 bg-[#112036] rounded border border-[#3b494b]/30 gap-1">
            <button
              onClick={() => handleProjection('PERSPECTIVE')}
              className={`py-1 px-2 rounded font-mono text-[11px] font-medium transition-colors text-center cursor-pointer ${
                optics.projection === 'PERSPECTIVE'
                  ? 'bg-[#1c2a41] text-[#00f0ff] font-bold shadow-sm'
                  : 'text-[#b9cacb] hover:text-[#d6e3ff]'
              }`}
            >
              PERSPECTIVE
            </button>
            <button
              onClick={() => handleProjection('ORTHOGRAPHIC')}
              className={`py-1 px-2 rounded font-mono text-[11px] font-medium transition-colors text-center cursor-pointer ${
                optics.projection === 'ORTHOGRAPHIC'
                  ? 'bg-[#1c2a41] text-[#00f0ff] font-bold shadow-sm'
                  : 'text-[#b9cacb] hover:text-[#d6e3ff]'
              }`}
            >
              ORTHOGRAPHIC
            </button>
          </div>
        </div>

        {/* Bathymetry Exaggeration Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-[#b9cacb] uppercase tracking-wider font-bold">
              BATHYMETRY EXAGGERATION
            </span>
            <span className="font-mono text-[11px] text-[#43ffbb] font-bold">
              {optics.bathymetryExaggeration.toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="1.0"
            max="5.0"
            step="0.1"
            value={optics.bathymetryExaggeration}
            onChange={(e) => handleExaggeration(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#27354c] rounded appearance-none cursor-pointer accent-[#00e2a0] focus:outline-none"
          />
          <div className="flex justify-between font-mono text-[10px] text-[#b9cacb]">
            <span>1.0x (True)</span>
            <span>3.0x</span>
            <span>5.0x (Max)</span>
          </div>
        </div>

        {/* Day/Night Solar Terminator Toggle */}
        <div className="flex items-center justify-between bg-[#112036] p-2 rounded border border-[#3b494b]/30">
          <div className="flex items-center gap-2.5">
            <SunMedium className="w-4 h-4 text-[#00f0ff]" />
            <div className="flex flex-col">
              <span className="text-xs text-[#d6e3ff] font-medium">
                Day/Night Solar Terminator
              </span>
              <span className="font-mono text-[10px] text-[#b9cacb]">
                Dynamic ephemeris simulation
              </span>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={optics.dayNightTerminator}
              onChange={(e) => handleToggleTerminator(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-[#27354c] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#00e2a0] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#041329] after:rounded-full after:h-3 after:w-3 after:transition-all"></div>
          </label>
        </div>

        {/* INSAT-3DR Cloud Cover Toggle */}
        <div className="flex items-center justify-between bg-[#112036] p-2 rounded border border-[#3b494b]/30">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-4 h-4 text-[#43ffbb]" />
            <div className="flex flex-col">
              <span className="text-xs text-[#d6e3ff] font-medium">
                INSAT-3DR Real-Time Cloud Cover
              </span>
              <span className="font-mono text-[10px] text-[#b9cacb]">
                Infrared optical density channel
              </span>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={optics.cloudCover}
              onChange={(e) => handleToggleClouds(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-[#27354c] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#00e2a0] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#041329] after:rounded-full after:h-3 after:w-3 after:transition-all"></div>
          </label>
        </div>

        {/* Optical Magnification FOV */}
        <div className="flex items-center justify-between pt-1 border-t border-[#3b494b]/20">
          <div className="flex flex-col">
            <span className="font-mono text-[9px] text-[#b9cacb] uppercase tracking-wider font-bold">
              OPTICAL MAGNIFICATION
            </span>
            <span className="font-mono text-base text-[#00f0ff] font-bold">
              {optics.opticalMagnification.toFixed(2)}x FOV
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleZoom(-0.2)}
              className="w-7 h-7 rounded bg-[#112036] hover:bg-[#1c2a41] border border-[#3b494b]/40 flex items-center justify-center text-[#d6e3ff] hover:text-[#00f0ff] transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => handleZoom(0.2)}
              className="w-7 h-7 rounded bg-[#112036] hover:bg-[#1c2a41] border border-[#3b494b]/40 flex items-center justify-center text-[#d6e3ff] hover:text-[#00f0ff] transition-colors cursor-pointer"
              title="Zoom In"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={handleReset}
              className="w-7 h-7 rounded bg-[#112036] hover:bg-[#1c2a41] border border-[#3b494b]/40 flex items-center justify-center text-[#43ffbb] hover:text-[#00e2a0] transition-colors cursor-pointer"
              title="Reset View"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Alert / Anomaly Monitor Pill */}
      <div 
        onClick={onOpenEarlyWarning}
        className="bg-[#0d1c32]/90 backdrop-blur-2xl rounded p-2.5 shadow-2xl border border-[#43ffbb]/30 pointer-events-auto flex items-center gap-2.5 cursor-pointer hover:bg-[#112036] transition-all group"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-[#00e2a0] animate-pulse"></div>
        <div className="flex flex-col">
          <span className="font-mono text-[10px] text-[#43ffbb] uppercase font-bold tracking-wider group-hover:underline flex items-center gap-1">
            <ShieldCheck size={11} />
            NO ACTIVE TSUNAMI ALERT
          </span>
          <span className="font-mono text-[10px] text-[#b9cacb]">
            Makran &amp; Sunda Trench seismic normal
          </span>
        </div>
      </div>
    </div>
  );
};
