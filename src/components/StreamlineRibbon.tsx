import React from 'react';
import { Wind, ArrowRight } from 'lucide-react';
import { NavigationScreen } from '../types';

interface StreamlineRibbonProps {
  onNavigate: (screen: NavigationScreen) => void;
}

export const StreamlineRibbon: React.FC<StreamlineRibbonProps> = ({ onNavigate }) => {
  return (
    <div className="w-full max-w-4xl bg-[#0d1c32]/90 backdrop-blur-2xl rounded-xl shadow-2xl p-3.5 border border-[#00f0ff]/20 pointer-events-auto flex flex-col md:flex-row items-center justify-between gap-3">
      {/* Streamline vector field preview */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="w-9 h-9 rounded bg-[#112036] border border-[#00f0ff]/30 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
          <Wind className="w-5 h-5 text-[#00f0ff] animate-pulse" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[#00f0ff] uppercase font-bold tracking-wider">
              STREAMLINE VECTOR FIELD
            </span>
            <span className="font-mono text-[10px] text-[#43ffbb] bg-[#112036] border border-[#43ffbb]/30 px-1.5 py-0.2 rounded font-bold">
              HYCOM 1/12°
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#b9cacb] mt-0.5">
            <span>
              Velocity: <strong className="text-[#d6e3ff]">0.12 - 1.48 m/s</strong>
            </span>
            <span>•</span>
            <span>
              Vectors: <strong className="text-[#43ffbb]">42,800 active</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
        <button
          onClick={() => onNavigate('volumetric-ocean')}
          className="px-4 py-2 rounded bg-[#00f0ff] hover:bg-[#00dbe9] text-[#00363a] font-mono text-xs font-bold transition-all shadow-lg shadow-[#00f0ff]/20 hover:shadow-[#00f0ff]/40 flex items-center gap-2 group cursor-pointer"
        >
          <span>ZOOM INTO 3D VOLUMETRIC OCEAN</span>
          <ArrowRight
            size={15}
            className="group-hover:translate-x-1 transition-transform"
          />
        </button>
      </div>
    </div>
  );
};
