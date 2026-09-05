import React from 'react';
import { BasinTarget } from '../types';

interface FooterProps {
  activeBasin: BasinTarget;
}

export const Footer: React.FC<FooterProps> = ({ activeBasin }) => {
  return (
    <footer className="w-full bg-[#010e24] py-3 border-t border-[#3b494b]/30">
      <div className="w-full px-4 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-2 font-mono text-[11px] text-[#b9cacb]">
        <div className="tracking-wider">
          INDIAN NATIONAL CENTRE FOR OCEAN INFORMATION SERVICES (INCOIS) • MINISTRY OF EARTH SCIENCES
        </div>
        <div className="flex items-center gap-4">
          <span>
            SURFACE SST: <strong className="text-[#dbfcff]">{activeBasin.sst.toFixed(1)}°C</strong>
          </span>
          <span>
            BATHY DEPTH: <strong className="text-[#43ffbb]">{activeBasin.depth}m</strong>
          </span>
          <span>
            GEO-REF: <strong className="text-[#00f0ff]">EPSG:4326</strong>
          </span>
        </div>
      </div>
    </footer>
  );
};
