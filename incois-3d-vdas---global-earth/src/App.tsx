import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SatelliteGlobe } from './components/SatelliteGlobe';
import { InteractiveOceanView } from './components/InteractiveOceanView';
import { ArgoMooringArrayView } from './components/ArgoMooringArrayView';
import { EarlyWarningView } from './components/EarlyWarningView';
import { Footer } from './components/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BASINS } from './data/oceanData';
import { NavigationScreen, BasinTarget, SensorNode } from './types';
import { oceanApi } from './services/oceanApi';
import { loadProbeCsv } from './data/probeData';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<NavigationScreen>('globe-overview');
  const [activeBasin, setActiveBasin] = useState<BasinTarget>(BASINS[0]); // Bay of Bengal by default
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [backendService, setBackendService] = useState('Ocean data API');
  const [probeNodes, setProbeNodes] = useState<SensorNode[]>([]);
  const [activeProbe, setActiveProbe] = useState<SensorNode | null>(null);

  useEffect(() => {
    loadProbeCsv().then(setProbeNodes).catch(() => setProbeNodes([]));
  }, []);

  useEffect(() => {
    const moveProbes = () => {
      setProbeNodes((nodes) => nodes.map((probe) => {
        const direction = ((probe.currentDirection ?? probe.windDirection ?? 0) * Math.PI) / 180;
        const speed = probe.currentSpeed ?? probe.windSpeed ?? 0.1;
        const distance = (speed * 120) / 111000;
        const longitudeDistance = distance / Math.max(0.25, Math.cos((probe.lat * Math.PI) / 180));
        return {
          ...probe,
          lat: Math.max(-60, Math.min(60, probe.lat + Math.cos(direction) * distance)),
          lon: probe.lon + Math.sin(direction) * longitudeDistance,
          sst: probe.sst + Math.sin(Date.now() / 900000 + probe.lat) * 0.03,
          salinity: probe.salinity + Math.cos(Date.now() / 900000 + probe.lon) * 0.01,
          pressure: Math.max(0, Math.abs(probe.depth) + Math.sin(Date.now() / 900000) * 0.5),
          chlorophyll: Math.max(0, probe.chlorophyll + Math.sin(Date.now() / 900000 + probe.lon) * 0.01),
          humidity: Math.max(0, Math.min(100, (probe.humidity || 0) + Math.cos(Date.now() / 900000) * 0.2)),
          depth: Math.max(0, probe.depth + Math.sin(Date.now() / 900000 + probe.lat) * 0.5),
          currentDirection: probe.currentDirection,
          currentSpeed: probe.currentSpeed,
        };
      }));
    };
    const interval = setInterval(moveProbes, 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;

    Promise.all([oceanApi.health(), oceanApi.listSources(), oceanApi.listVariables()])
      .then(([health]) => {
        if (!mounted) return;
        setBackendService(health.service);
        setBackendStatus(health.status === 'ok' ? 'online' : 'offline');
      })
      .catch(() => {
        if (mounted) setBackendStatus('offline');
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Transition from Globe to 3D Ocean View when an ocean is chosen
  const handleSelectBasinFromGlobe = (basin: BasinTarget) => {
    setActiveProbe(null);
    setActiveBasin(basin);
    setActiveScreen('volumetric-ocean');
  };

  const handleFocusNodeOnGlobe = (node: SensorNode) => {
    const currentProbe = probeNodes.find((probe) => probe.id === node.id) || node;
    setActiveProbe(currentProbe);
    const matching = BASINS.find((b) => node.basin.toLowerCase().includes(b.name.toLowerCase())) || activeBasin;
    setActiveBasin({
      ...matching,
      lat: currentProbe.lat,
      lon: currentProbe.lon,
      depth: currentProbe.depth,
      sst: currentProbe.sst,
      salinity: currentProbe.salinity,
    });
    setActiveScreen('volumetric-ocean');
  };

  const handleSelectProbe = (probe: SensorNode) => {
    setActiveProbe(probe);
    const matching = BASINS.find((basin) => probe.basin.toLowerCase().includes(basin.name.toLowerCase())) || activeBasin;
    setActiveBasin(matching);
    setActiveScreen('volumetric-ocean');
  };

  return (
    <div className="min-h-screen bg-[#041329] text-[#d6e3ff] flex flex-col font-sans selection:bg-[#00f0ff] selection:text-[#00363a]">
      {/* Top Header with view mode toggles */}
      <Header
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        activeBasin={activeBasin}
        backendStatus={backendStatus}
        backendService={backendService}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        isMobileSidebarOpen={isMobileSidebarOpen}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
      />

      {/* Left Navigation Sidebar */}
      <Sidebar
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        activeBasin={activeBasin}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
      />

      {/* Main Content Area (Offset for Desktop Sidebar pl-72 and Header pt-16) */}
      <div className={`${isSidebarCollapsed ? '' : 'lg:pl-72'} pt-16 flex-1 flex flex-col`}>
        {/* 1. Landing Page: Realistic Satellite Globe */}
        {activeScreen === 'globe-overview' && (
          <ErrorBoundary fallbackTitle="Satellite Earth Globe Simulation">
            <SatelliteGlobe
              activeBasin={activeBasin}
              onSelectBasin={handleSelectBasinFromGlobe}
              probes={probeNodes}
              onSelectProbe={handleSelectProbe}
            />
          </ErrorBoundary>
        )}

        {/* 2. Ocean View (Interactive 3D Slicing, Currents, Probes & Anomalies) */}
        {activeScreen === 'volumetric-ocean' && (
          <ErrorBoundary fallbackTitle="Interactive 3D Ocean Slicing Engine">
            <InteractiveOceanView
              activeBasin={activeBasin}
              probeNodes={probeNodes}
              initialProbe={activeProbe}
              onReturnToGlobe={() => setActiveScreen('globe-overview')}
            />
          </ErrorBoundary>
        )}

        {/* Secondary Specialized Science Consoles */}
        {activeScreen === 'probe-telemetry' && (
          <ErrorBoundary fallbackTitle="ARGO & Mooring Array View">
            <ArgoMooringArrayView
              probeNodes={probeNodes}
              initialProbe={activeProbe}
              onBackToGlobe={() => setActiveScreen('globe-overview')}
              onOpenVolumetricBathymetry={handleFocusNodeOnGlobe}
            />
          </ErrorBoundary>
        )}

        {activeScreen === 'anomaly-alerts' && (
          <ErrorBoundary fallbackTitle="Early Warning Center">
            <EarlyWarningView
              onBackToGlobe={() => setActiveScreen('globe-overview')}
            />
          </ErrorBoundary>
        )}

        {/* Global Scientific Footer */}
        <Footer activeBasin={activeBasin} />
      </div>
    </div>
  );
}
