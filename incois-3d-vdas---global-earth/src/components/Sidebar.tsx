import React from 'react';
import { 
  Globe, 
  Waves, 
  Radio, 
  AlertTriangle, 
  Activity, 
  Disc,
  X
} from 'lucide-react';
import { NavigationScreen, BasinTarget } from '../types';

interface SidebarProps {
  activeScreen: NavigationScreen;
  onSelectScreen: (screen: NavigationScreen) => void;
  activeBasin: BasinTarget;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen,
  onSelectScreen,
  activeBasin,
  isMobileOpen = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const navItems = [
    {
      id: 'globe-overview' as NavigationScreen,
      label: '3D Globe Telemetry',
      icon: Globe,
      badge: 'LIVE',
    },
    {
      id: 'volumetric-ocean' as NavigationScreen,
      label: 'Volumetric Bathymetry',
      icon: Waves,
      badge: '3D ISO',
    },
    {
      id: 'probe-telemetry' as NavigationScreen,
      label: 'ARGO & Mooring Array',
      icon: Radio,
      badge: '3,842',
    },
    {
      id: 'anomaly-alerts' as NavigationScreen,
      label: 'Early Warning Center',
      icon: AlertTriangle,
      badge: 'NOMINAL',
    },
  ];

  // Format coordinates to DMS
  const formatLat = (lat: number) => {
    const deg = Math.floor(Math.abs(lat));
    const min = Math.floor((Math.abs(lat) - deg) * 60);
    const sec = Math.floor(((Math.abs(lat) - deg) * 60 - min) * 60);
    return `${deg}°${min}'${sec}" ${lat >= 0 ? 'N' : 'S'}`;
  };

  const formatLon = (lon: number) => {
    const deg = Math.floor(Math.abs(lon));
    const min = Math.floor((Math.abs(lon) - deg) * 60);
    const sec = Math.floor(((Math.abs(lon) - deg) * 60 - min) * 60);
    return `${deg}°${min}'${sec}" ${lon >= 0 ? 'E' : 'W'}`;
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-[#0d1c32]/95 lg:bg-[#0d1c32]/90 backdrop-blur-xl z-50 flex flex-col justify-between border-r border-[#3b494b]/30 shadow-[0_1px_8px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : isCollapsed ? '-translate-x-full' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* Top Header Grid info */}
          <div className="h-16 px-4 flex items-center justify-between bg-[#010e24]/90 border-b border-[#3b494b]/30">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-[#43ffbb] animate-pulse"></div>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] text-[#b9cacb] font-bold tracking-wider uppercase">
                  TELEMETRY GRID
                </span>
                <span className="font-mono text-[11px] text-[#dbfcff] tracking-wider font-semibold">
                  INDIAN OCEAN NODES
                </span>
              </div>
            </div>

            {/* Mobile close button */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1 rounded hover:bg-[#112036] text-[#b9cacb]"
            >
              <X size={18} />
            </button>
            <button
              onClick={onToggleCollapse}
              className="hidden lg:block p-1 rounded hover:bg-[#112036] text-[#b9cacb]"
              title="Close navigation"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>

          {/* Node Health KPI Card */}
          <div className="px-4 py-3 border-b border-[#3b494b]/20">
            <div className="bg-[#1c2a41]/70 rounded p-2.5 border border-[#3b494b]/30 shadow-inner">
              <div className="flex items-center justify-between font-mono text-[10px] text-[#b9cacb] mb-1">
                <span>INCOIS NODE HEALTH</span>
                <span className="text-[#43ffbb] font-mono text-[11px] font-bold">99.98%</span>
              </div>
              <div className="w-full bg-[#010e24] h-1.5 rounded overflow-hidden">
                <div className="bg-[#00e2a0] h-full w-[94%] transition-all duration-500"></div>
              </div>
              <div className="flex justify-between font-mono text-[11px] text-[#b9cacb] mt-1.5">
                <span>ACTIVE: <strong className="text-[#dbfcff]">3,842</strong></span>
                <span>LATENCY: <strong className="text-[#43ffbb]">18ms</strong></span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 px-2.5 mt-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectScreen(item.id);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded transition-all text-left group ${
                    isActive
                      ? 'bg-[#1c2a41] text-[#00f0ff] font-semibold shadow-[0_0_12px_rgba(0,240,255,0.15)] border-l-2 border-[#00f0ff]'
                      : 'text-[#b9cacb] hover:bg-[#112036] hover:text-[#d6e3ff]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon 
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-[#00f0ff]' : 'text-[#b9cacb] group-hover:text-[#dbfcff]'
                      }`} 
                    />
                    <span className="text-sm tracking-wide">{item.label}</span>
                  </div>
                  <span 
                    className={`font-mono text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                      isActive 
                        ? 'bg-[#00f0ff]/20 text-[#00f0ff]' 
                        : 'bg-[#010e24] text-[#849495] group-hover:text-[#b9cacb]'
                    }`}
                  >
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Spatial Datum Card */}
        <div className="p-4 bg-[#010e24]/90 border-t border-[#3b494b]/30 flex flex-col gap-2">
          <div className="flex items-center justify-between font-mono text-[10px] text-[#b9cacb] uppercase font-bold tracking-wider">
            <span>SPATIAL DATUM</span>
            <span className="text-[#dbfcff]">WGS-84 / GEBCO</span>
          </div>

          <div className="font-mono text-[11px] text-[#b9cacb] bg-[#1c2a41]/50 p-2 rounded border border-[#3b494b]/30 flex flex-col gap-1">
            <div>
              LAT: <span className="text-[#00f0ff] font-medium">{formatLat(activeBasin.lat)}</span>
            </div>
            <div>
              LON: <span className="text-[#00f0ff] font-medium">{formatLon(activeBasin.lon)}</span>
            </div>
            <div>
              REG: <span className="text-[#43ffbb] font-medium truncate block">{activeBasin.name}</span>
            </div>
            <div>
              BATHY: <span className="text-[#dbfcff] font-medium">{activeBasin.depth} m</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00e2a0] animate-pulse"></span>
              <span className="font-mono text-[11px] text-[#b9cacb]">RT-CORAL LINK OK</span>
            </div>
            <span className="font-mono text-[10px] text-[#00f0ff] bg-[#112036] px-1.5 py-0.5 rounded border border-[#00f0ff]/20">
              SECURE
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
