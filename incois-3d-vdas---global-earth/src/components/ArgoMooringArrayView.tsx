import React, { useEffect, useState } from 'react';
import { ArrowLeft, Search, Radio } from 'lucide-react';
import { SensorNode } from '../types';

interface ArgoMooringArrayViewProps {
  probeNodes: SensorNode[];
  initialProbe?: SensorNode | null;
  onBackToGlobe: () => void;
  onOpenVolumetricBathymetry: (node: SensorNode) => void;
}

export const ArgoMooringArrayView: React.FC<ArgoMooringArrayViewProps> = ({
  probeNodes,
  initialProbe,
  onBackToGlobe,
  onOpenVolumetricBathymetry,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedNode, setSelectedNode] = useState<SensorNode | null>(initialProbe || probeNodes[0] || null);

  useEffect(() => {
    setSelectedNode((current) => probeNodes.find((probe) => probe.id === current?.id) || probeNodes[0] || null);
  }, [probeNodes]);

  const filteredNodes = probeNodes.filter((node) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch = node.id.toLowerCase().includes(query) || node.name.toLowerCase().includes(query) || node.basin.toLowerCase().includes(query);
    return matchesSearch && (selectedType === 'ALL' || node.type === selectedType);
  });

  const inspectedNode = selectedNode || probeNodes[0];
  const selectProbe = (node: SensorNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedNode(node);
  };

  const openSelectedProbe = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inspectedNode) onOpenVolumetricBathymetry(inspectedNode);
  };

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 lg:p-8 flex flex-col gap-6 bg-[#041329]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1c32] p-4 rounded border border-[#00f0ff]/20">
        <div className="flex items-center gap-3">
          <button onClick={onBackToGlobe} className="p-2 rounded bg-[#112036] hover:bg-[#1c2a41] text-[#00f0ff] border border-[#00f0ff]/30 transition-all flex items-center gap-1.5 cursor-pointer font-mono text-xs"><ArrowLeft size={16} /><span>RETURN TO 3D GLOBE</span></button>
          <div><h2 className="font-sans text-xl font-bold text-[#dbfcff]">ARGO &amp; Glider Telemetry Inventory</h2><p className="font-mono text-xs text-[#43ffbb]">{probeNodes.filter((node) => node.type === 'ARGO').length} Argo + {probeNodes.filter((node) => node.type === 'GLIDER').length} gliders from local CSV</p></div>
        </div>
        <div className="flex items-center gap-2"><div className="relative"><Search className="w-4 h-4 text-[#b9cacb] absolute left-2.5 top-1/2 -translate-y-1/2" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search probe or basin..." className="bg-[#112036] border border-[#3b494b]/40 rounded pl-8 pr-3 py-1.5 font-mono text-xs text-[#d6e3ff] placeholder-[#849495] focus:outline-none focus:border-[#00f0ff]" /></div><div className="flex items-center gap-1 bg-[#112036] p-1 rounded border border-[#3b494b]/40">{['ALL', 'ARGO', 'GLIDER'].map((type) => <button key={type} onClick={() => setSelectedType(type)} className={`px-2 py-1 rounded font-mono text-[11px] uppercase cursor-pointer ${selectedType === type ? 'bg-[#00f0ff] text-[#00363a] font-bold' : 'text-[#b9cacb] hover:text-[#d6e3ff]'}`}>{type}</button>)}</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0d1c32] rounded-lg p-4 border border-[#00f0ff]/15 flex flex-col gap-3"><div className="flex items-center justify-between font-mono text-xs text-[#b9cacb] px-2 py-1 border-b border-[#3b494b]/30"><span>PROBE</span><span>REGION</span><span>TELEMETRY</span><span>STATUS</span></div><div className="flex flex-col gap-1.5 overflow-y-auto max-h-[560px] pr-1">{filteredNodes.map((node) => <button key={node.id} onClick={(e) => selectProbe(node, e)} className={`p-3 rounded border transition-all flex items-center justify-between cursor-pointer text-left ${inspectedNode?.id === node.id ? 'bg-[#1c2a41] border-[#00f0ff]/60' : 'bg-[#112036] hover:bg-[#162942] border-[#3b494b]/30'}`}><span className="flex items-center gap-3 min-w-0"><Radio size={16} className={node.type === 'GLIDER' ? 'text-[#ffb703]' : 'text-[#00f0ff]'} /><span><strong className="block font-mono text-xs text-[#dbfcff]">{node.id}</strong><span className="text-xs text-[#b9cacb]">{node.name}</span></span></span><span className="text-xs text-[#d6e3ff] max-w-[150px] truncate">{node.basin}</span><span className="font-mono text-xs text-[#43ffbb]">{node.sst.toFixed(1)}°C<br />{node.salinity.toFixed(1)} PSU</span><span className="font-mono text-[10px] text-[#43ffbb]">{node.status}</span></button>)}</div></div>

        <div className="bg-[#0d1c32] rounded-lg p-6 border border-[#00f0ff]/15 flex flex-col gap-4">{inspectedNode ? <><div className="border-b border-[#3b494b]/30 pb-3"><span className="font-mono text-[10px] text-[#00f0ff] uppercase font-bold">SELECTED PROBE</span><h3 className="font-sans text-xl font-bold text-[#dbfcff]">{inspectedNode.id}</h3><span className="font-mono text-xs text-[#43ffbb]">{inspectedNode.type} / {inspectedNode.status}</span></div><div className="grid grid-cols-2 gap-2 font-mono text-xs"><div className="bg-[#112036] p-2.5 rounded"><span className="block text-[10px] text-[#b9cacb]">LATITUDE</span><strong>{inspectedNode.lat.toFixed(4)}°</strong></div><div className="bg-[#112036] p-2.5 rounded"><span className="block text-[10px] text-[#b9cacb]">LONGITUDE</span><strong>{inspectedNode.lon.toFixed(4)}°</strong></div><div className="bg-[#112036] p-2.5 rounded"><span className="block text-[10px] text-[#b9cacb]">DEPTH</span><strong>{inspectedNode.depth.toFixed(1)} m</strong></div><div className="bg-[#112036] p-2.5 rounded"><span className="block text-[10px] text-[#b9cacb]">BATTERY</span><strong className="text-[#43ffbb]">{inspectedNode.battery}%</strong></div><div className="bg-[#112036] p-2.5 rounded"><span className="block text-[10px] text-[#b9cacb]">CURRENT</span><strong>{inspectedNode.currentDirection}°</strong></div><div className="bg-[#112036] p-2.5 rounded"><span className="block text-[10px] text-[#b9cacb]">SPEED</span><strong>{inspectedNode.currentSpeed?.toFixed(2)} m/s</strong></div></div><div className="bg-[#020b17] rounded border border-[#00f0ff]/20 p-3 font-mono text-xs space-y-2"><p><span className="text-[#b9cacb]">TEMPERATURE</span><strong className="float-right text-[#00f0ff]">{inspectedNode.sst.toFixed(2)} °C</strong></p><p><span className="text-[#b9cacb]">PRESSURE</span><strong className="float-right">{inspectedNode.pressure.toFixed(1)} dbar</strong></p><p><span className="text-[#b9cacb]">CHLOROPHYLL</span><strong className="float-right text-[#ffb703]">{inspectedNode.chlorophyll.toFixed(2)} mg/m³</strong></p><p><span className="text-[#b9cacb]">HUMIDITY</span><strong className="float-right text-[#7df4ff]">{(inspectedNode.humidity || 0).toFixed(1)}%</strong></p></div><button onClick={openSelectedProbe} className="w-full py-2.5 rounded bg-[#00f0ff] hover:bg-[#00dbe9] text-[#00363a] font-mono text-xs font-bold cursor-pointer">OPEN IN 3D OCEAN SLICING</button></> : <p className="font-mono text-sm text-[#b9cacb]">Loading local probe data...</p>}</div>
      </div>
    </div>
  );
};
