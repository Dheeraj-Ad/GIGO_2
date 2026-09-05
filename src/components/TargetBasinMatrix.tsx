import React from 'react';
import { Compass, ArrowUpRight, Lock } from 'lucide-react';
import { BASINS } from '../data/oceanData';
import { BasinTarget } from '../types';

interface TargetBasinMatrixProps {
  activeBasin: BasinTarget;
  onSelectBasin: (basin: BasinTarget) => void;
}

export const TargetBasinMatrix: React.FC<TargetBasinMatrixProps> = ({
  activeBasin,
  onSelectBasin,
}) => {
  return (
    <div className="bg-[#0d1c32]/90 backdrop-blur-2xl rounded p-4 shadow-2xl border border-[#00f0ff]/15 flex flex-col gap-2.5 pointer-events-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#00f0ff]" />
          <h2 className="font-mono text-[11px] text-[#00f0ff] tracking-wider uppercase font-bold">
            Target Basin Matrix
          </h2>
        </div>
        <span className="font-mono text-[10px] text-[#43ffbb] bg-[#27354c] px-1.5 py-0.5 rounded font-semibold">
          4 ACTIVE
        </span>
      </div>

      {/* Basin selector list */}
      <div className="flex flex-col gap-1.5 mt-1">
        {BASINS.map((basin) => {
          const isSelected = activeBasin.id === basin.id;
          return (
            <button
              key={basin.id}
              onClick={() => onSelectBasin(basin)}
              className={`w-full text-left p-2.5 rounded transition-all flex items-center justify-between group cursor-pointer ${
                isSelected
                  ? 'bg-[#112036] border border-[#43ffbb]/50 shadow-[0_0_12px_rgba(67,255,187,0.15)]'
                  : 'bg-[#1c2a41]/60 hover:bg-[#2c3951] border border-transparent'
              }`}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#43ffbb] animate-pulse"></span>
                  )}
                  <span
                    className={`font-sans text-sm font-medium ${
                      isSelected ? 'text-[#d6e3ff] font-semibold' : 'text-[#d6e3ff] group-hover:text-[#00f0ff]'
                    }`}
                  >
                    {basin.name}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#b9cacb] mt-0.5">
                  {basin.zone}
                </span>
              </div>

              {isSelected ? (
                <span className="font-mono text-[10px] text-[#43ffbb] uppercase bg-[#010e24] px-1.5 py-0.5 rounded font-bold border border-[#43ffbb]/30 flex items-center gap-1">
                  <Lock size={10} />
                  LOCKED
                </span>
              ) : (
                <ArrowUpRight className="w-4 h-4 text-[#b9cacb] opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all text-[#00f0ff]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
