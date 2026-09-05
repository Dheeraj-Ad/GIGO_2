import React, { useState, useEffect } from 'react';
import { Radio, Satellite, User, Waves, Activity, Menu, X, Globe, Sliders } from 'lucide-react';
import { BasinTarget, NavigationScreen } from '../types';

interface HeaderProps {
  activeScreen: NavigationScreen;
  onSelectScreen: (screen: NavigationScreen) => void;
  activeBasin: BasinTarget;
  backendStatus?: 'connecting' | 'online' | 'offline';
  backendService?: string;
  onToggleMobileSidebar?: () => void;
  isMobileSidebarOpen?: boolean;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeScreen,
  onSelectScreen,
  activeBasin,
  backendStatus = 'connecting',
  backendService = 'Ocean data API',
  onToggleMobileSidebar,
  isMobileSidebarOpen,
  isSidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const [timeStr, setTimeStr] = useState('09:42:18Z');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const mins = String(now.getUTCMinutes()).padStart(2, '0');
      const secs = String(now.getUTCSeconds()).padStart(2, '0');
      setTimeStr(`${hours}:${mins}:${secs}Z`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className={`fixed top-0 left-0 ${isSidebarCollapsed ? '' : 'lg:left-72'} right-0 h-16 bg-[#041329]/95 backdrop-blur-xl z-40 border-b border-[#3b494b]/30 shadow-[0_1px_8px_rgba(0,0,0,0.3)] transition-[left] duration-300`}>
      <div className="h-16 w-full px-4 lg:px-6 flex items-center justify-between">
        {/* Left branding & mobile toggle */}
        <div className="flex items-center gap-3 lg:gap-6">
          <button
            onClick={onToggleMobileSidebar}
            className="lg:hidden p-1.5 rounded bg-[#112036] text-[#dbfcff] hover:bg-[#1c2a41] transition-colors cursor-pointer"
            title="Toggle Menu"
          >
            {isMobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {isSidebarCollapsed && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 rounded bg-[#112036] text-[#dbfcff] hover:bg-[#1c2a41] transition-colors cursor-pointer"
              title="Open navigation"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
          )}

          <div className="flex items-center gap-2.5">
            {/* Visual Logo Emblem */}
            <div className="w-8 h-8 rounded bg-[#112036] border border-[#00f0ff]/40 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.25)] shrink-0">
              <Waves className="w-4 h-4 text-[#00f0ff] animate-pulse" />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-sans font-bold text-base lg:text-lg tracking-tight text-[#dbfcff] leading-none">
                  INCOIS 3D-VDAS
                </span>
                <span className="hidden sm:inline-block text-[9px] font-mono font-bold uppercase tracking-wider bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/30 px-1.5 py-0.5 rounded">
                  v3.4-RT
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#b9cacb] uppercase tracking-wider mt-0.5">
                Indian Ocean Telemetry
              </span>
            </div>
          </div>

          {/* Quick Primary View Mode Switcher Pills */}
          <div className="hidden md:flex items-center gap-1 bg-[#010e24] p-1 rounded-xl border border-white/10">
            <button
              onClick={() => onSelectScreen('globe-overview')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                activeScreen === 'globe-overview'
                  ? 'bg-[#00f0ff] text-[#00363a] shadow-sm'
                  : 'text-[#b9cacb] hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Satellite Globe</span>
            </button>
            <button
              onClick={() => onSelectScreen('volumetric-ocean')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                activeScreen === 'volumetric-ocean'
                  ? 'bg-[#00f0ff] text-[#00363a] shadow-sm'
                  : 'text-[#b9cacb] hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>3D Ocean Slicing</span>
              <span className="text-[10px] opacity-75 font-normal">[{activeBasin.name}]</span>
            </button>
          </div>
        </div>

        {/* Right HUD info modules */}
        <div className="flex items-center gap-2.5 lg:gap-4">
          {/* UTC Clock */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#0d1c32] border border-[#3b494b]/40 px-2.5 py-1 rounded">
            <span className="font-mono text-[10px] text-[#b9cacb] font-bold">UTC</span>
            <span className="font-mono text-[13px] text-[#00f0ff] font-medium tracking-wider">
              {timeStr}
            </span>
          </div>

          {/* Satellite Data link */}
          <div className="hidden lg:flex items-center gap-1.5 bg-[#112036] border border-[#00f0ff]/25 px-2.5 py-1 rounded">
            <Satellite className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span className="font-mono text-[11px] text-[#d6e3ff]">
              INSAT-3DR L3
            </span>
          </div>

          <div
            className="hidden md:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[#b9cacb]"
            title={backendService}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                backendStatus === 'online'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : backendStatus === 'offline'
                    ? 'bg-rose-400'
                    : 'bg-amber-300 animate-pulse'
              }`}
            />
            <span>API {backendStatus}</span>
          </div>

          {/* User profile avatar */}
          <div
            className="w-8 h-8 rounded-full bg-[#dbfcff] text-[#00363a] flex items-center justify-center shadow-md font-semibold cursor-pointer hover:bg-[#7df4ff] transition-colors"
            title="Oceanographer Station: IO-HQ"
          >
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    </header>
  );
};
