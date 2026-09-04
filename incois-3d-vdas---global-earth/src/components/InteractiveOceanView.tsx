import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  BasinTarget,
  OceanVariable,
  OceanDepth,
  LayerToggles,
  SensorNode,
  OceanAnomaly,
  CurrentVector,
} from '../types';
import {
  OCEAN_ANOMALIES,
  CURRENT_VECTORS,
  VARIABLE_CONFIGS,
  DEPTH_LEVELS,
} from '../data/oceanData';
import {
  createArgoFloatModel,
  createUnderwaterGliderModel,
  createMooredBuoyModel,
} from './ocean3d/Probe3DModels';
import {
  createRealisticBathymetry,
  getSeafloorWorldY,
  BathymetryMeshBundle,
} from './ocean3d/BathymetricTerrain';
import { OceanControlsOverlay } from './OceanControlsOverlay';
import { ProbeDetailPanel } from './ProbeDetailPanel';
import { AnomalyDetailModal } from './AnomalyDetailModal';
import { GridSlice, VolumeSlice, oceanApi } from '../services/oceanApi';

interface InteractiveOceanViewProps {
  activeBasin: BasinTarget;
  probeNodes: SensorNode[];
  initialProbe: SensorNode | null;
  onReturnToGlobe: () => void;
}

// Helper: Generate crisp 3D Canvas Text Sprite
function createCanvasTextSprite(
  text: string,
  fgColor: string = '#00f0ff',
  bgColor: string = 'rgba(4, 19, 41, 0.85)',
  borderColor: string = 'rgba(0, 240, 255, 0.4)',
  fontSize: number = 24,
  width: number = 256,
  height: number = 64
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Sprite();

  // Rounded pill background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  const r = 8;
  ctx.moveTo(r, 0);
  ctx.lineTo(width - r, 0);
  ctx.quadraticCurveTo(width, 0, width, r);
  ctx.lineTo(width, height - r);
  ctx.quadraticCurveTo(width, height, width - r, height);
  ctx.lineTo(r, height);
  ctx.quadraticCurveTo(0, height, 0, height - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Typography
  ctx.fillStyle = fgColor;
  ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((width / height) * 0.18, 0.18, 1);
  return sprite;
}

// Helper: Create Glowing Perimeter Halo Ribbon Geometry
function createBorderRibbonGeometry(w: number, d: number, thickness: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  // 4 corners outer and inner
  const outer = [
    [-hw - thickness, -hd - thickness],
    [hw + thickness, -hd - thickness],
    [hw + thickness, hd + thickness],
    [-hw - thickness, hd + thickness],
  ];
  const inner = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];

  // Build quad ribbons around 4 sides
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    const baseIdx = i * 4;

    positions.push(inner[i][0], inner[i][1], 0);
    positions.push(outer[i][0], outer[i][1], 0);
    positions.push(inner[next][0], inner[next][1], 0);
    positions.push(outer[next][0], outer[next][1], 0);

    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    indices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// High-fidelity procedural slice texture generator for physical ocean temperature & salinity
function generateHighResSliceTexture(
  variable: OceanVariable,
  depth: OceanDepth,
  basin: BasinTarget
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const w = canvas.width;
  const h = canvas.height;

  // 1. Render scientific 2D scalar field
  // Color palette interpolation helpers
  const tempColors = [
    { t: 0.0, c: '#03071e' }, // < 6°C Deep abyssal
    { t: 0.15, c: '#1e1b4b' }, // 8°C
    { t: 0.3, c: '#0284c7' }, // 12°C
    { t: 0.45, c: '#06b6d4' }, // 16°C
    { t: 0.6, c: '#10b981' }, // 20°C
    { t: 0.72, c: '#eab308' }, // 24°C
    { t: 0.85, c: '#f97316' }, // 27°C
    { t: 1.0, c: '#dc2626' }, // 30°C+ Warm pool
  ];

  const salColors = [
    { t: 0.0, c: '#041329' }, // 31.5 PSU River plume
    { t: 0.2, c: '#083344' }, // 32.5 PSU
    { t: 0.4, c: '#0e7490' }, // 33.8 PSU
    { t: 0.6, c: '#059669' }, // 34.8 PSU
    { t: 0.75, c: '#10b981' }, // 35.5 PSU
    { t: 0.9, c: '#22d3ee' }, // 36.5 PSU High salinity
    { t: 1.0, c: '#a5f3fc' }, // 37.0 PSU
  ];

  const curColors = [
    { t: 0.0, c: '#020617' },
    { t: 0.3, c: '#1e1b4b' },
    { t: 0.6, c: '#4338ca' },
    { t: 0.8, c: '#00f0ff' },
    { t: 1.0, c: '#43ffbb' },
  ];

  const chloColors = [
    { t: 0.0, c: '#02120e' },
    { t: 0.25, c: '#064e3b' },
    { t: 0.5, c: '#047857' },
    { t: 0.75, c: '#10b981' },
    { t: 1.0, c: '#facc15' },
  ];

  const activePalette =
    variable === 'TEMPERATURE'
      ? tempColors
      : variable === 'SALINITY'
      ? salColors
      : variable === 'CURRENTS'
      ? curColors
      : chloColors;

  // Depth attenuation factor: values cool down / attenuate with depth
  const depthRatio = depth / 2000;

  // Base background fill with radial gradients representing ocean eddies and regional fronts
  ctx.fillStyle = activePalette[0].c;
  ctx.fillRect(0, 0, w, h);

  // Gradient 1: Regional North-South / East-West trend
  const mainGrad = ctx.createLinearGradient(0, 0, w, h);
  const colorShift = Math.max(0, 1 - depthRatio * 0.85);

  activePalette.forEach((stop) => {
    const adjustedStop = Math.max(0, Math.min(1, stop.t * colorShift + (1 - colorShift) * 0.1));
    mainGrad.addColorStop(adjustedStop, stop.c);
  });
  ctx.fillStyle = mainGrad;
  ctx.fillRect(0, 0, w, h);

  // Gradient 2: Cyclonic Eddy (Cold/Upwelling core)
  const eddyX = w * 0.38;
  const eddyY = h * 0.42;
  const eddyRadius = w * 0.35;
  const eddyGrad = ctx.createRadialGradient(eddyX, eddyY, 10, eddyX, eddyY, eddyRadius);
  if (variable === 'TEMPERATURE') {
    // Cold core eddy
    eddyGrad.addColorStop(0, depth <= 100 ? '#0284c7' : '#1e1b4b');
    eddyGrad.addColorStop(0.6, 'rgba(6, 182, 212, 0.4)');
    eddyGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else if (variable === 'SALINITY') {
    // Halocline eddy
    eddyGrad.addColorStop(0, '#0e7490');
    eddyGrad.addColorStop(0.6, 'rgba(5, 150, 105, 0.4)');
    eddyGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    eddyGrad.addColorStop(0, '#00f0ff');
    eddyGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }
  ctx.fillStyle = eddyGrad;
  ctx.beginPath();
  ctx.arc(eddyX, eddyY, eddyRadius, 0, Math.PI * 2);
  ctx.fill();

  // Gradient 3: Anticyclonic Warm Pool / High-Salinity Intrusion
  const warmX = w * 0.72;
  const warmY = h * 0.68;
  const warmRadius = w * 0.32;
  const warmGrad = ctx.createRadialGradient(warmX, warmY, 10, warmX, warmY, warmRadius);
  if (variable === 'TEMPERATURE') {
    warmGrad.addColorStop(0, depth <= 100 ? '#dc2626' : depth <= 300 ? '#f97316' : '#0284c7');
    warmGrad.addColorStop(0.7, 'rgba(234, 179, 8, 0.3)');
    warmGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else if (variable === 'SALINITY') {
    warmGrad.addColorStop(0, '#22d3ee');
    warmGrad.addColorStop(0.7, 'rgba(16, 185, 129, 0.3)');
    warmGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    warmGrad.addColorStop(0, '#43ffbb');
    warmGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }
  ctx.fillStyle = warmGrad;
  ctx.beginPath();
  ctx.arc(warmX, warmY, warmRadius, 0, Math.PI * 2);
  ctx.fill();

  // 2. Scientific Isotherm / Isohaline Contour Lines
  ctx.lineWidth = 1.8;
  const numContours = 7;
  for (let c = 1; c <= numContours; c++) {
    const rx = 120 + c * 52;
    const ry = 90 + c * 44;
    ctx.strokeStyle = c % 2 === 0 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 240, 255, 0.25)';
    ctx.setLineDash(c % 2 === 0 ? [] : [6, 6]);

    ctx.beginPath();
    ctx.ellipse(eddyX, eddyY, rx, ry, 0.25, 0, Math.PI * 2);
    ctx.stroke();

    // Isotherm / Isohaline numeric labels on contour lines
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    let labelText = '';
    if (variable === 'TEMPERATURE') {
      const baseT = depth === 0 ? 30 : depth <= 100 ? 25 : depth <= 400 ? 16 : 8;
      labelText = `${(baseT - c * 1.4).toFixed(1)}°C`;
    } else if (variable === 'SALINITY') {
      const baseS = depth === 0 ? 33.2 : 35.5;
      labelText = `${(baseS + (c - 3) * 0.3).toFixed(1)} PSU`;
    } else {
      labelText = `${(1.2 - c * 0.15).toFixed(2)} m/s`;
    }

    const labelAngle = 0.4 + c * 0.35;
    const lx = eddyX + Math.cos(labelAngle) * rx;
    const ly = eddyY + Math.sin(labelAngle) * ry;
    ctx.fillText(labelText, lx, ly);
  }

  // 3. Coordinate Grid Lines & Degrees Overlay
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
  ctx.lineWidth = 1.0;

  for (let gridX = 128; gridX < w; gridX += 192) {
    ctx.beginPath();
    ctx.moveTo(gridX, 0);
    ctx.lineTo(gridX, h);
    ctx.stroke();

    // Longitude tag
    const lonDeg = (80 + (gridX / w) * 16).toFixed(1);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`${lonDeg}°E`, gridX + 5, 22);
  }

  for (let gridY = 128; gridY < h; gridY += 192) {
    ctx.beginPath();
    ctx.moveTo(0, gridY);
    ctx.lineTo(w, gridY);
    ctx.stroke();

    // Latitude tag
    const latDeg = (20 - (gridY / h) * 16).toFixed(1);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`${latDeg}°N`, 25, gridY - 5);
  }
  ctx.setLineDash([]);

  // 4. Header Watermark Metadata Banner
  ctx.fillStyle = 'rgba(4, 19, 41, 0.85)';
  ctx.fillRect(16, h - 68, 480, 52);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, h - 68, 480, 52);

  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 15px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `INCOIS HYCOM ISOPYCNAL • ${variable} @ ${depth}m`,
    28,
    h - 44
  );

  ctx.fillStyle = '#b9cacb';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText(
    `Basin: ${basin.name} | Res: 1/12° | Datum: Hydrostatic Reference`,
    28,
    h - 26
  );

  // 5. Embedded Colorbar Scale in Lower Right Corner
  const barW = 260;
  const barH = 16;
  const barX = w - barW - 24;
  const barY = h - 42;

  const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  activePalette.forEach((stop) => {
    barGrad.addColorStop(stop.t, stop.c);
  });
  ctx.fillStyle = barGrad;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1.0;
  ctx.strokeRect(barX, barY, barW, barH);

  // Colorbar labels
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `MIN: ${VARIABLE_CONFIGS[variable].min} ${VARIABLE_CONFIGS[variable].unit}`,
    barX,
    barY - 6
  );
  ctx.textAlign = 'right';
  ctx.fillText(
    `MAX: ${VARIABLE_CONFIGS[variable].max} ${VARIABLE_CONFIGS[variable].unit}`,
    barX + barW,
    barY - 6
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

export const InteractiveOceanView: React.FC<InteractiveOceanViewProps> = ({
  activeBasin,
  probeNodes,
  initialProbe,
  onReturnToGlobe,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Scene Root Groups
  const oceanGroupRef = useRef<THREE.Group | null>(null);
  const volumeBoxGroupRef = useRef<THREE.Group | null>(null);
  const depthScaleGroupRef = useRef<THREE.Group | null>(null);
  const sliceMeshRef = useRef<THREE.Mesh | null>(null);
  const sliceHaloRef = useRef<THREE.Mesh | null>(null);
  const sliceEdgeTagRef = useRef<THREE.Sprite | null>(null);
  const activeDepthPointerRef = useRef<THREE.Sprite | null>(null);
  const upperVolumeMeshRef = useRef<THREE.Mesh | null>(null);
  const lowerVolumeMeshRef = useRef<THREE.Mesh | null>(null);
  const waterSurfaceMeshRef = useRef<THREE.Mesh | null>(null);
  const seafloorMeshRef = useRef<THREE.Mesh | null>(null);
  const bathymetryBundleRef = useRef<BathymetryMeshBundle | null>(null);
  const currentsGroupRef = useRef<THREE.Group | null>(null);
  const probesGroupRef = useRef<THREE.Group | null>(null);
  const probeRoutesGroupRef = useRef<THREE.Group | null>(null);
  const anomaliesGroupRef = useRef<THREE.Group | null>(null);

  // Controls state
  const [activeVariable, setActiveVariable] = useState<OceanVariable>('TEMPERATURE');
  const [activeDepth, setActiveDepth] = useState<OceanDepth>(50);
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(2.2);
  const [upperVolumeMode, setUpperVolumeMode] = useState<'semi-transparent' | 'hidden'>('semi-transparent');
  const [isPlayingTime, setIsPlayingTime] = useState<boolean>(true);
  const [simTimeStep, setSimTimeStep] = useState<number>(0);
  const [liveSlice, setLiveSlice] = useState<GridSlice | null>(null);
  const [liveVolume, setLiveVolume] = useState<VolumeSlice | null>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'live' | 'fallback'>('loading');

  const [layerToggles, setLayerToggles] = useState<LayerToggles>({
    currents: true,
    probes: true,
    anomalies: true,
    bathymetryMesh: true,
    waterSurface: true,
    seafloorContours: true,
  });

  // Selected Probe & Anomaly
  const [selectedProbe, setSelectedProbe] = useState<SensorNode | null>(initialProbe);
  const [selectedAnomaly, setSelectedAnomaly] = useState<OceanAnomaly | null>(null);

  useEffect(() => {
    setSelectedProbe(initialProbe);
  }, [initialProbe?.id]);

  useEffect(() => {
    if (!selectedProbe) return;
    const currentProbe = probeNodes.find((probe) => probe.id === selectedProbe.id);
    if (currentProbe) setSelectedProbe(currentProbe);
  }, [probeNodes, selectedProbe]);

  // Hovered Current Vector
  const [hoveredVector, setHoveredVector] = useState<CurrentVector | null>(null);
  const [hoveredVectorScreenPos, setHoveredVectorScreenPos] = useState<{ x: number; y: number } | null>(null);

  // Controls State
  const controlsRef = useRef<OrbitControls | null>(null);
  const flyToTargetRef = useRef<THREE.Vector3 | null>(null);
  const flyToPosRef = useRef<THREE.Vector3 | null>(null);

  // Current slice Y position for smooth animation
  const currentSliceYRef = useRef(0);
  const targetSliceYRef = useRef(0);

  // Dynamic box dimensions
  const slabWidth = 4.6;
  const slabDepth = 4.6;
  const baseBoxHeight = 1.9;

  // Filter sensor nodes and anomalies relevant to this basin
  const basinProbes = useMemo(() => {
    const anchor = selectedProbe || initialProbe || probeNodes.find((probe) => probe.basin === activeBasin.name);
    if (!anchor) return [];
    const distanceKm = (first: SensorNode, second: SensorNode) => {
      const lat = ((first.lat - second.lat) * Math.PI) / 180;
      const lon = ((first.lon - second.lon) * Math.PI) / 180;
      const meanLat = (((first.lat + second.lat) / 2) * Math.PI) / 180;
      return 6371 * Math.sqrt(lat * lat + Math.cos(meanLat) * Math.cos(meanLat) * lon * lon);
    };
    return probeNodes.filter(
      (n) => distanceKm(n, anchor) <= 1
    );
  }, [activeBasin, initialProbe, probeNodes, selectedProbe]);

  const basinAnomalies = useMemo(() => {
    return OCEAN_ANOMALIES.filter(
      (a) =>
        a.basin.toLowerCase().includes(activeBasin.name.toLowerCase()) ||
        activeBasin.name.toLowerCase().includes('ocean')
    );
  }, [activeBasin]);

  useEffect(() => {
    const variableMap: Record<OceanVariable, string> = {
      TEMPERATURE: 'temperature',
      SALINITY: 'salinity',
      CURRENTS: 'currents',
      CHLOROPHYLL: 'chlorophyll',
    };
    const bounds = activeBasin.bounds;
    const params = {
      source: 'copernicus_glorys',
      variable: variableMap[activeVariable],
      depth_m: activeDepth,
      west: bounds?.minLon ?? 30,
      south: bounds?.minLat ?? -10,
      east: bounds?.maxLon ?? 100,
      north: bounds?.maxLat ?? 30,
    };

    setModelStatus('loading');
    setLiveSlice(null);
    setLiveVolume(null);
    Promise.all([
      oceanApi.getSlice(params),
      oceanApi.getVolume({ ...params, depth_min_m: 0, depth_max_m: 1000 }),
    ])
      .then(([slice, volume]) => {
        setLiveSlice(slice);
        setLiveVolume(volume);
        setModelStatus('live');
      })
      .catch(() => setModelStatus('fallback'));
  }, [activeBasin, activeDepth, activeVariable]);

  // Handle Layer Toggle
  const handleToggleLayer = (key: keyof LayerToggles) => {
    setLayerToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Target slice Y calculation based on depth (0 to 2000m) and vertical exaggeration
  useEffect(() => {
    const totalHeight = baseBoxHeight * (verticalExaggeration / 2.0);
    const depthRatio = activeDepth / 2000;
    targetSliceYRef.current = -depthRatio * totalHeight;
  }, [activeDepth, verticalExaggeration]);

  // Generate high-resolution slice texture whenever activeVariable, activeDepth, or activeBasin changes
  const sliceTexture = useMemo(() => {
    return generateHighResSliceTexture(activeVariable, activeDepth, activeBasin);
  }, [activeVariable, activeDepth, activeBasin]);

  // Update slice plane material when texture changes
  useEffect(() => {
    if (sliceMeshRef.current) {
      const mat = sliceMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.map = sliceTexture;
      mat.needsUpdate = true;
    }
  }, [sliceTexture]);

  // Update 3D Floating tags when depth changes
  useEffect(() => {
    if (sliceEdgeTagRef.current) {
      const newTag = createCanvasTextSprite(
        activeDepth === 0 ? 'DEPTH: 0m (SURFACE)' : `DEPTH: ${activeDepth}m`,
        '#00f0ff',
        'rgba(4, 19, 41, 0.9)',
        '#00f0ff',
        22,
        220,
        54
      );
      sliceEdgeTagRef.current.material.map = newTag.material.map;
      sliceEdgeTagRef.current.material.needsUpdate = true;
    }

    if (activeDepthPointerRef.current) {
      const newPointer = createCanvasTextSprite(
        `▶ ${activeDepth}m`,
        '#43ffbb',
        'rgba(4, 19, 41, 0.9)',
        '#43ffbb',
        24,
        180,
        50
      );
      activeDepthPointerRef.current.material.map = newPointer.material.map;
      activeDepthPointerRef.current.material.needsUpdate = true;
    }
  }, [activeDepth]);

  // Update upper volume visibility based on mode
  useEffect(() => {
    if (upperVolumeMeshRef.current) {
      const mat = upperVolumeMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = upperVolumeMode === 'hidden' ? 0.0 : 0.08;
      mat.needsUpdate = true;
    }
  }, [upperVolumeMode]);

  // Main Three.js Scene Setup for 3D Ocean View
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / height;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010e24);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(0, -0.2, 7.8);
    cameraRef.current = camera;

    // 3. Renderer with ACES Filmic Tone Mapping
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.12;
    controls.maxDistance = 26.0;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI - 0.08;
    controls.target.set(0, -0.6, 0);
    controls.update();
    controls.addEventListener('start', () => {
      flyToTargetRef.current = null;
      flyToPosRef.current = null;
    });
    controlsRef.current = controls;

    // 4. Ocean Root Group
    const oceanGroup = new THREE.Group();
    scene.add(oceanGroup);
    oceanGroupRef.current = oceanGroup;

    // 5. Realistic Ocean Water Surface Plane Mesh (Y = 0) with subtle wave ripples
    const surfaceGeo = new THREE.PlaneGeometry(slabWidth, slabDepth, 64, 64);
    surfaceGeo.rotateX(-Math.PI / 2);
    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x0088b3,
      roughness: 0.12,
      metalness: 0.25,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.position.y = 0;
    oceanGroup.add(surfaceMesh);
    waterSurfaceMeshRef.current = surfaceMesh;

    // Water Surface crisp boundary line
    const surfacePerimeterGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-slabWidth / 2, 0, -slabDepth / 2),
      new THREE.Vector3(slabWidth / 2, 0, -slabDepth / 2),
      new THREE.Vector3(slabWidth / 2, 0, slabDepth / 2),
      new THREE.Vector3(-slabWidth / 2, 0, slabDepth / 2),
      new THREE.Vector3(-slabWidth / 2, 0, -slabDepth / 2),
    ]);
    const surfacePerimeterMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.7,
    });
    const surfacePerimeter = new THREE.Line(surfacePerimeterGeo, surfacePerimeterMat);
    surfaceMesh.add(surfacePerimeter);

    // 6. Dynamic Volumetric Ocean Bounding Frame & Side Grid Lines
    const volumeBoxGroup = new THREE.Group();
    oceanGroup.add(volumeBoxGroup);
    volumeBoxGroupRef.current = volumeBoxGroup;

    // 7. Depth Scale Post & Ruler on the Side
    const depthScaleGroup = new THREE.Group();
    oceanGroup.add(depthScaleGroup);
    depthScaleGroupRef.current = depthScaleGroup;

    // 8. Upper Ocean Volume Mesh (Volume above slicing plane - semi-transparent / hidden)
    const upperVolumeGeo = new THREE.BoxGeometry(slabWidth, 1, slabDepth);
    const upperVolumeMat = new THREE.MeshStandardMaterial({
      color: 0x042444,
      transparent: true,
      opacity: upperVolumeMode === 'hidden' ? 0.0 : 0.08,
      roughness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const upperVolumeMesh = new THREE.Mesh(upperVolumeGeo, upperVolumeMat);
    oceanGroup.add(upperVolumeMesh);
    upperVolumeMeshRef.current = upperVolumeMesh;

    // 9. Lower Ocean Volume Mesh (Volume below slicing plane - deep oceanic navy)
    const lowerVolumeGeo = new THREE.BoxGeometry(slabWidth, 1, slabDepth);
    const lowerVolumeMat = new THREE.MeshStandardMaterial({
      color: 0x011a3b,
      transparent: true,
      opacity: 0.35,
      roughness: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const lowerVolumeMesh = new THREE.Mesh(lowerVolumeGeo, lowerVolumeMat);
    oceanGroup.add(lowerVolumeMesh);
    lowerVolumeMeshRef.current = lowerVolumeMesh;

    // 10. Realistic 3D Bathymetric Seafloor (Displaced Terrain, Ridges, Valleys, Trenches, Geological Skirts, Optional Contours)
    const totalBoxH = baseBoxHeight * (verticalExaggeration / 2.0);
    const bathymetryBundle = createRealisticBathymetry(
      slabWidth,
      slabDepth,
      totalBoxH,
      verticalExaggeration,
      activeBasin.id
    );
    bathymetryBundle.setContoursVisible(layerToggles.seafloorContours);
    bathymetryBundle.setTerrainVisible(layerToggles.bathymetryMesh);
    oceanGroup.add(bathymetryBundle.rootGroup);
    bathymetryBundleRef.current = bathymetryBundle;
    seafloorMeshRef.current = bathymetryBundle.terrainMesh;

    // 11. Sharp, Highly Visible Horizontal Slicing Plane Mesh
    const sliceGeo = new THREE.PlaneGeometry(slabWidth * 0.995, slabDepth * 0.995, 1, 1);
    sliceGeo.rotateX(-Math.PI / 2);
    const sliceMat = new THREE.MeshStandardMaterial({
      map: sliceTexture,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      roughness: 0.22,
      metalness: 0.1,
    });
    const sliceMesh = new THREE.Mesh(sliceGeo, sliceMat);
    sliceMesh.position.y = 0;
    oceanGroup.add(sliceMesh);
    sliceMeshRef.current = sliceMesh;

    // Glowing edge on the slicing plane: primary crisp neon line
    const slicePerimeterGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-slabWidth * 0.4975, 0, -slabDepth * 0.4975),
      new THREE.Vector3(slabWidth * 0.4975, 0, -slabDepth * 0.4975),
      new THREE.Vector3(slabWidth * 0.4975, 0, slabDepth * 0.4975),
      new THREE.Vector3(-slabWidth * 0.4975, 0, slabDepth * 0.4975),
      new THREE.Vector3(-slabWidth * 0.4975, 0, -slabDepth * 0.4975),
    ]);
    const slicePerimeterMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 3,
    });
    const sliceLine = new THREE.Line(slicePerimeterGeo, slicePerimeterMat);
    sliceMesh.add(sliceLine);

    // Glowing edge halo ribbon around the perimeter with additive blending
    const haloGeo = createBorderRibbonGeometry(slabWidth * 0.995, slabDepth * 0.995, 0.08);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    sliceMesh.add(haloMesh);
    sliceHaloRef.current = haloMesh;

    // Corner L-brackets on slicing plane
    const cornerSize = 0.22;
    const hw = slabWidth * 0.4975;
    const hd = slabDepth * 0.4975;
    const corners = [
      [[-hw, 0, -hd + cornerSize], [-hw, 0, -hd], [-hw + cornerSize, 0, -hd]],
      [[hw - cornerSize, 0, -hd], [hw, 0, -hd], [hw, 0, -hd + cornerSize]],
      [[hw, 0, hd - cornerSize], [hw, 0, hd], [hw - cornerSize, 0, hd]],
      [[-hw + cornerSize, 0, hd], [-hw, 0, hd], [-hw, 0, hd - cornerSize]],
    ];
    corners.forEach((pts) => {
      const cGeo = new THREE.BufferGeometry().setFromPoints(
        pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      );
      const cMat = new THREE.LineBasicMaterial({ color: 0x43ffbb, linewidth: 2 });
      const cLine = new THREE.Line(cGeo, cMat);
      sliceMesh.add(cLine);
    });

    // 3D Depth Tag attached directly to the slicing plane's front edge
    const sliceEdgeTag = createCanvasTextSprite(
      activeDepth === 0 ? 'DEPTH: 0m (SURFACE)' : `DEPTH: ${activeDepth}m`,
      '#00f0ff',
      'rgba(4, 19, 41, 0.9)',
      '#00f0ff',
      22,
      220,
      54
    );
    sliceEdgeTag.position.set(0, 0.08, hd + 0.18);
    sliceMesh.add(sliceEdgeTag);
    sliceEdgeTagRef.current = sliceEdgeTag;

    // Active Depth Glowing Pointer on Side Ruler
    const activePointer = createCanvasTextSprite(
      `▶ ${activeDepth}m`,
      '#43ffbb',
      'rgba(4, 19, 41, 0.9)',
      '#43ffbb',
      24,
      180,
      50
    );
    activePointer.position.set(-hw - 0.4, 0, hd + 0.05);
    oceanGroup.add(activePointer);
    activeDepthPointerRef.current = activePointer;

    // 12. Ocean Currents Animated Vector Flow Field Group
    const currentsGroup = new THREE.Group();
    oceanGroup.add(currentsGroup);
    currentsGroupRef.current = currentsGroup;

    CURRENT_VECTORS.forEach((vec) => {
      const nx = ((vec.lon - 60) / 38) * 3.4 - 1.7;
      const nz = -(((vec.lat - 0) / 24) * 3.4 - 1.7);
      const ny = -0.15;

      const arrowGroup = new THREE.Group();
      arrowGroup.position.set(nx, ny, nz);

      const shaftLen = 0.28 * Math.max(0.6, vec.speed);
      const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, shaftLen, 8);
      shaftGeo.rotateZ(Math.PI / 2);
      const shaftMat = new THREE.MeshBasicMaterial({
        color: vec.speed > 1.0 ? 0x00f0ff : 0x43ffbb,
      });
      const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
      shaftMesh.position.x = shaftLen / 2;
      arrowGroup.add(shaftMesh);

      const coneGeo = new THREE.ConeGeometry(0.035, 0.09, 8);
      coneGeo.rotateZ(-Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        color: vec.speed > 1.0 ? 0x00f0ff : 0x43ffbb,
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.x = shaftLen;
      arrowGroup.add(coneMesh);

      const rad = (vec.directionDeg * Math.PI) / 180;
      arrowGroup.rotation.y = -rad + Math.PI / 2;
      arrowGroup.name = `current-vec-${vec.id}`;
      arrowGroup.userData = { vector: vec, baseNormY: -0.15 };

      currentsGroup.add(arrowGroup);
    });

    // 13. Underwater Probes Array (Argo Floats, Gliders, Moored Buoys)
    const probesGroup = new THREE.Group();
    oceanGroup.add(probesGroup);
    probesGroupRef.current = probesGroup;
    const probeRoutesGroup = new THREE.Group();
    oceanGroup.add(probeRoutesGroup);
    probeRoutesGroupRef.current = probeRoutesGroup;

    basinProbes.forEach((probe, idx) => {
      // Calculate realistic geographic position within the 3D volume slab
      const anchor = selectedProbe || initialProbe || basinProbes[0] || probe;
      const normX = Math.max(0.08, Math.min(0.92, 0.5 + (probe.lon - anchor.lon) / 0.02));
      const normZ = Math.max(0.08, Math.min(0.92, 0.5 + (probe.lat - anchor.lat) / 0.02));

      const px = (normX - 0.5) * (slabWidth * 0.82);
      const pz = -((normZ - 0.5) * (slabDepth * 0.82));
      const depthMeters = Math.min(2000, Math.abs(probe.depth));
      const baseNormY = -(depthMeters / 2000);

      // Create realistic model based on probe type
      let probeMeshGroup: THREE.Group;
      if (probe.type === 'ARGO') {
        probeMeshGroup = createArgoFloatModel(probe);
      } else if (probe.type === 'GLIDER') {
        probeMeshGroup = createUnderwaterGliderModel(probe);
      } else {
        probeMeshGroup = createMooredBuoyModel(probe);
      }

      const totalH = baseBoxHeight * (verticalExaggeration / 2.0);
      const seafloorY = getSeafloorWorldY(
        px,
        pz,
        slabWidth,
        slabDepth,
        totalH,
        verticalExaggeration,
        activeBasin.id
      );
      const nominalY = baseNormY * totalH;

      // Gliders and Argo floats sit naturally on or above the realistic bathymetric terrain
      const safeClearance = probe.type === 'BPR' || (probe.type === 'OMNI' && depthMeters > 700) ? 0.06 : 0.16;
      const actualY = Math.max(seafloorY + safeClearance, nominalY);

      probeMeshGroup.position.set(px, actualY, pz);
      probeMeshGroup.name = `probe-${probe.id}`;
      probeMeshGroup.userData = {
        probe,
        baseNormY,
        nominalY: actualY,
        seafloorY,
        px,
        pz,
        type: probe.type,
      };

      // Add full depth datum cable: surface -> probe -> local bathymetric seabed
      const datumPoints = [
        new THREE.Vector3(0, -actualY, 0), // surface
        new THREE.Vector3(0, 0, 0),         // probe position
        new THREE.Vector3(0, seafloorY - actualY, 0), // anchor on seafloor bed
      ];
      const datumGeo = new THREE.BufferGeometry().setFromPoints(datumPoints);
      const datumMat = new THREE.LineDashedMaterial({
        color: probe.type === 'GLIDER' ? 0xffb703 : 0x00f0ff,
        dashSize: 0.05,
        gapSize: 0.04,
        transparent: true,
        opacity: 0.4,
      });
      const datumLine = new THREE.Line(datumGeo, datumMat);
      datumLine.computeLineDistances();
      datumLine.name = 'datum-line';
      probeMeshGroup.add(datumLine);

      // Add a heavy seabed mooring anchor sinker weight on the terrain
      const anchorGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.025, 8);
      const anchorMat = new THREE.MeshStandardMaterial({
        color: 0x1f2e42,
        roughness: 0.88,
        metalness: 0.35,
      });
      const anchorMesh = new THREE.Mesh(anchorGeo, anchorMat);
      anchorMesh.position.set(0, seafloorY - actualY + 0.012, 0);
      anchorMesh.name = 'seafloor-anchor';
      probeMeshGroup.add(anchorMesh);

      probesGroup.add(probeMeshGroup);

      const direction = ((probe.currentDirection ?? probe.windDirection ?? 0) * Math.PI) / 180;
      const routeLength = 0.35 + Math.min(0.55, (probe.currentSpeed ?? probe.windSpeed ?? 0.1) * 1.2);
      const directionX = Math.sin(direction);
      const directionZ = -Math.cos(direction);
      const routeY = actualY + 0.025;
      const routeGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(px - directionX * 0.18, routeY, pz - directionZ * 0.18),
        new THREE.Vector3(px + directionX * routeLength, routeY, pz + directionZ * routeLength),
      ]);
      const routeMaterial = new THREE.LineDashedMaterial({
        color: probe.type === 'GLIDER' ? 0xffb703 : 0x00f0ff,
        dashSize: 0.07,
        gapSize: 0.045,
        transparent: true,
        opacity: 0.75,
      });
      const routeLine = new THREE.Line(routeGeometry, routeMaterial);
      routeLine.computeLineDistances();
      routeLine.name = `probe-route-${probe.id}`;
      probeRoutesGroup.add(routeLine);

      const arrowGeometry = new THREE.ConeGeometry(0.045, 0.13, 8);
      arrowGeometry.rotateX(Math.PI / 2);
      const routeArrow = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({
        color: probe.type === 'GLIDER' ? 0xffb703 : 0x00f0ff,
        transparent: true,
        opacity: 0.9,
      }));
      routeArrow.position.set(px + directionX * routeLength, routeY, pz + directionZ * routeLength);
      routeArrow.rotation.y = direction;
      routeArrow.name = `probe-route-arrow-${probe.id}`;
      probeRoutesGroup.add(routeArrow);
    });

    // 14. Glowing Anomalies Array (Heatwaves, Eddies, Plumes)
    const anomaliesGroup = new THREE.Group();
    oceanGroup.add(anomaliesGroup);
    anomaliesGroupRef.current = anomaliesGroup;

    basinAnomalies.forEach((anom) => {
      const ax = ((anom.lon - 60) / 38) * 3.4 - 1.7;
      const az = -(((anom.lat - 0) / 24) * 3.4 - 1.7);
      const baseNormY = -0.18;

      const anomGroup = new THREE.Group();
      anomGroup.position.set(ax, baseNormY * baseBoxHeight, az);
      anomGroup.name = `anomaly-${anom.id}`;
      anomGroup.userData = { anomaly: anom, baseNormY };

      const anomRingGeo = new THREE.RingGeometry(0.24, 0.3, 32);
      anomRingGeo.rotateX(-Math.PI / 2);
      const anomRingMat = new THREE.MeshBasicMaterial({
        color: anom.type === 'HEATWAVE' ? 0xff4d6d : anom.type === 'UPWELLING' ? 0x00f0ff : 0xffb703,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      });
      const anomRingMesh = new THREE.Mesh(anomRingGeo, anomRingMat);
      anomRingMesh.name = 'anom-ring';
      anomGroup.add(anomRingMesh);

      anomaliesGroup.add(anomGroup);
    });

    // 15. Lighting
    const ambLight = new THREE.AmbientLight(0x0c2748, 1.5);
    scene.add(ambLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4.5, 6.0, 3.5);
    scene.add(keyLight);

    const cyanSubLight = new THREE.DirectionalLight(0x00f0ff, 1.4);
    cyanSubLight.position.set(-3.5, -3.5, -2.5);
    scene.add(cyanSubLight);

    const seabedFillLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
    seabedFillLight.position.set(2.5, -2.0, 3.0);
    scene.add(seabedFillLight);

    // 16. Resize Handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      if (w <= 0 || h <= 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 17. Animation Loop
    let animationFrameId: number;
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const elapsed = (now - startTime) * 0.001;

      // Smooth horizontal slicing plane animation (Lerp)
      currentSliceYRef.current += (targetSliceYRef.current - currentSliceYRef.current) * 0.12;
      const currentSliceY = currentSliceYRef.current;

      // Position slicing plane
      if (sliceMeshRef.current) {
        sliceMeshRef.current.position.y = currentSliceY;
      }

      // Slicing plane edge halo pulse effect
      if (sliceHaloRef.current) {
        (sliceHaloRef.current.material as THREE.MeshBasicMaterial).opacity =
          0.6 + 0.25 * Math.sin(elapsed * 4);
      }

      // Update active depth pointer Y position to track slicing plane
      if (activeDepthPointerRef.current) {
        activeDepthPointerRef.current.position.y = currentSliceY;
      }

      // Update Upper and Lower Ocean Volume Meshes
      const totalBoxH = baseBoxHeight * (verticalExaggeration / 2.0);
      const upperH = Math.max(0.001, Math.abs(currentSliceY));
      const lowerH = Math.max(0.001, totalBoxH - Math.abs(currentSliceY));

      if (upperVolumeMeshRef.current) {
        upperVolumeMeshRef.current.scale.set(1, upperH, 1);
        upperVolumeMeshRef.current.position.y = currentSliceY / 2;
        // Semi-transparent or hidden based on upperVolumeMode and depth
        upperVolumeMeshRef.current.visible =
          activeDepth > 0 && (upperVolumeMode === 'semi-transparent' || upperVolumeMode === 'hidden');
      }

      if (lowerVolumeMeshRef.current) {
        lowerVolumeMeshRef.current.scale.set(1, lowerH, 1);
        lowerVolumeMeshRef.current.position.y = (currentSliceY - totalBoxH) / 2;
        lowerVolumeMeshRef.current.visible = true;
      }

      // Realistic Ocean Water Surface subtle multi-frequency wave ripples
      if (waterSurfaceMeshRef.current && layerToggles.waterSurface) {
        const surfPos = waterSurfaceMeshRef.current.geometry.attributes.position;
        for (let i = 0; i < surfPos.count; i++) {
          const u = surfPos.getX(i);
          const v = surfPos.getZ(i);
          const w1 = Math.sin(u * 3.4 + elapsed * 2.3) * 0.018;
          const w2 = Math.cos(v * 2.9 + elapsed * 1.8) * 0.014;
          const w3 = Math.sin((u + v) * 2.1 + elapsed * 3.1) * 0.008;
          surfPos.setY(i, w1 + w2 + w3);
        }
        surfPos.needsUpdate = true;
      }

      // Float and pulse underwater probes
      if (probesGroupRef.current && layerToggles.probes) {
        probesGroupRef.current.children.forEach((probeGroup, idx) => {
          const nominalY = (probeGroup.userData.nominalY !== undefined
            ? probeGroup.userData.nominalY
            : (probeGroup.userData.baseNormY || 0) * totalBoxH) as number;
          const seafloorY = (probeGroup.userData.seafloorY || -totalBoxH) as number;
          const probeType = probeGroup.userData.type as string;

          // Subtle floating animation:
          // Argo floats gently bob up-down with buoyancy breathing and slight yaw drift
          // Gliders have subtle hydrodynamic glide pitching and rolling motion
          if (probeType === 'GLIDER') {
            const floatOffset = Math.sin(elapsed * 1.6 + idx * 1.2) * 0.018;
            probeGroup.position.y = Math.max(seafloorY + 0.12, nominalY + floatOffset);

            const gliderBody = probeGroup.getObjectByName('glider-body-group');
            if (gliderBody) {
              gliderBody.rotation.z = 0.20 + Math.sin(elapsed * 1.4 + idx) * 0.03;
            }
          } else {
            // Argo float gentle rhythmic vertical bobbing and gentle orientation drift
            const floatOffset = Math.sin(elapsed * 1.8 + idx * 1.3) * 0.022;
            probeGroup.position.y = Math.max(seafloorY + 0.12, nominalY + floatOffset);
            probeGroup.rotation.y = Math.sin(elapsed * 0.4 + idx) * 0.08;
          }

          // Antenna beacon blinking strobe pulse
          const beacon = probeGroup.getObjectByName('antenna-beacon');
          if (beacon) {
            const beaconPulse = 0.75 + 0.25 * Math.sin(elapsed * 5.0 + idx * 2.0);
            beacon.scale.set(beaconPulse, beaconPulse, beaconPulse);
          }

          // Expanding soft sonar / telemetry ring pulse 1
          const ring1 = probeGroup.getObjectByName('pulse-ring');
          if (ring1) {
            const pulseProgress = ((elapsed * 0.75 + idx * 0.35) % 1.0);
            const scale = 1.0 + pulseProgress * 1.6;
            ring1.scale.set(scale, scale, 1);
            const mat = (ring1 as THREE.Mesh).material as THREE.MeshBasicMaterial;
            if (mat) {
              mat.opacity = (1.0 - pulseProgress) * 0.75;
            }
          }

          // Expanding soft sonar / telemetry ring pulse 2
          const ring2 = probeGroup.getObjectByName('pulse-ring-2');
          if (ring2) {
            const pulseProgress2 = ((elapsed * 0.75 + idx * 0.35 + 0.5) % 1.0);
            const scale2 = 1.0 + pulseProgress2 * 2.0;
            ring2.scale.set(scale2, scale2, 1);
            const mat2 = (ring2 as THREE.Mesh).material as THREE.MeshBasicMaterial;
            if (mat2) {
              mat2.opacity = (1.0 - pulseProgress2) * 0.45;
            }
          }
        });
      }

      // Animate glowing anomalies
      if (anomaliesGroupRef.current && layerToggles.anomalies) {
        anomaliesGroupRef.current.children.forEach((anomGroup, idx) => {
          const baseNormY = (anomGroup.userData.baseNormY || 0) as number;
          anomGroup.position.y = baseNormY * totalBoxH;

          const ring = anomGroup.getObjectByName('anom-ring');
          const core = anomGroup.getObjectByName('anom-core');
          if (ring) {
            const scale = 1 + Math.sin(elapsed * 2.5 + idx) * 0.18;
            ring.scale.set(scale, scale, 1);
          }
          if (core) {
            core.rotation.y += 0.02;
            core.rotation.x += 0.01;
          }
        });
      }

      // Animate current flow vectors if simulation is active
      if (currentsGroupRef.current && isPlayingTime && layerToggles.currents) {
        currentsGroupRef.current.children.forEach((arrow, i) => {
          const vec = arrow.userData.vector as CurrentVector;
          if (vec) {
            const speedWave = 1 + Math.sin(elapsed * 2.2 + i * 0.5) * 0.15;
            arrow.scale.set(speedWave, speedWave, speedWave);
          }
        });
      }

      // Keep panning and orbiting below the surface while preserving the current
      // target depth and camera distance.
      controls.target.y = Math.min(controls.target.y, -0.02);
      const cameraDistance = camera.position.distanceTo(controls.target);
      const surfacePolarAngle = Math.acos(
        THREE.MathUtils.clamp(-controls.target.y / Math.max(cameraDistance, 0.12), -1, 1)
      );
      controls.minPolarAngle = Math.max(0.08, surfacePolarAngle);
      controls.update();

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      controls.dispose();
      renderer.dispose();
    };
  }, [activeBasin, basinProbes, basinAnomalies]);

  // Rebuild Dynamic Bounding Frame & Depth Scale when verticalExaggeration changes
  useEffect(() => {
    const volumeBoxGroup = volumeBoxGroupRef.current;
    const depthScaleGroup = depthScaleGroupRef.current;
    const seafloorMesh = seafloorMeshRef.current;
    if (!volumeBoxGroup || !depthScaleGroup || !seafloorMesh) return;

    // Clear previous children
    while (volumeBoxGroup.children.length > 0) {
      const c = volumeBoxGroup.children[0];
      volumeBoxGroup.remove(c);
    }
    while (depthScaleGroup.children.length > 0) {
      const c = depthScaleGroup.children[0];
      depthScaleGroup.remove(c);
    }

    const totalHeight = baseBoxHeight * (verticalExaggeration / 2.0);
    const hw = slabWidth / 2;
    const hd = slabDepth / 2;

    // 1. Visible 3D Ocean Volume Wireframe Bounds
    // 12 outer edge lines
    const wirePoints: THREE.Vector3[] = [];

    // 4 Top edges (y = 0)
    wirePoints.push(new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(hw, 0, -hd));
    wirePoints.push(new THREE.Vector3(hw, 0, -hd), new THREE.Vector3(hw, 0, hd));
    wirePoints.push(new THREE.Vector3(hw, 0, hd), new THREE.Vector3(-hw, 0, hd));
    wirePoints.push(new THREE.Vector3(-hw, 0, hd), new THREE.Vector3(-hw, 0, -hd));

    // 4 Bottom edges (y = -totalHeight)
    wirePoints.push(new THREE.Vector3(-hw, -totalHeight, -hd), new THREE.Vector3(hw, -totalHeight, -hd));
    wirePoints.push(new THREE.Vector3(hw, -totalHeight, -hd), new THREE.Vector3(hw, -totalHeight, hd));
    wirePoints.push(new THREE.Vector3(hw, -totalHeight, hd), new THREE.Vector3(-hw, -totalHeight, hd));
    wirePoints.push(new THREE.Vector3(-hw, -totalHeight, hd), new THREE.Vector3(-hw, -totalHeight, -hd));

    // 4 Vertical corner posts
    wirePoints.push(new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(-hw, -totalHeight, -hd));
    wirePoints.push(new THREE.Vector3(hw, 0, -hd), new THREE.Vector3(hw, -totalHeight, -hd));
    wirePoints.push(new THREE.Vector3(hw, 0, hd), new THREE.Vector3(hw, -totalHeight, hd));
    wirePoints.push(new THREE.Vector3(-hw, 0, hd), new THREE.Vector3(-hw, -totalHeight, hd));

    const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
    });
    const wireSegments = new THREE.LineSegments(wireGeo, wireMat);
    volumeBoxGroup.add(wireSegments);

    // Horizontal grid lines on the 4 vertical faces at exact depths
    DEPTH_LEVELS.forEach((d) => {
      const y = -(d / 2000) * totalHeight;
      const facePoints: THREE.Vector3[] = [
        new THREE.Vector3(-hw, y, -hd),
        new THREE.Vector3(hw, y, -hd),
        new THREE.Vector3(hw, y, hd),
        new THREE.Vector3(-hw, y, hd),
        new THREE.Vector3(-hw, y, -hd),
      ];
      const faceGeo = new THREE.BufferGeometry().setFromPoints(facePoints);
      const faceMat = new THREE.LineBasicMaterial({
        color: d === 0 ? 0x00f0ff : 0x00a8cc,
        transparent: true,
        opacity: d === 0 ? 0.6 : 0.18,
      });
      const faceLine = new THREE.Line(faceGeo, faceMat);
      volumeBoxGroup.add(faceLine);
    });

    // 2. Depth Scale on the Side (Front-Left corner post)
    const rulerX = -hw - 0.08;
    const rulerZ = hd + 0.08;

    // Vertical ruler spine line
    const rulerSpineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(rulerX, 0.05, rulerZ),
      new THREE.Vector3(rulerX, -totalHeight - 0.05, rulerZ),
    ]);
    const rulerSpineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      linewidth: 2,
    });
    const rulerSpine = new THREE.Line(rulerSpineGeo, rulerSpineMat);
    depthScaleGroup.add(rulerSpine);

    // Major Depth Ticks & 3D Text Sprites
    DEPTH_LEVELS.forEach((d) => {
      const y = -(d / 2000) * totalHeight;

      // Major Tick mark
      const tickGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(rulerX, y, rulerZ),
        new THREE.Vector3(rulerX - 0.16, y, rulerZ),
      ]);
      const tickMat = new THREE.LineBasicMaterial({
        color: 0x43ffbb,
        transparent: true,
        opacity: 0.9,
        linewidth: 2,
      });
      const tickLine = new THREE.Line(tickGeo, tickMat);
      depthScaleGroup.add(tickLine);

      // 3D Text Label
      const labelText = d === 0 ? '0m (Surface)' : `${d}m`;
      const labelSprite = createCanvasTextSprite(
        labelText,
        d === 0 ? '#00f0ff' : '#d6e3ff',
        'rgba(4, 19, 41, 0.88)',
        d === 0 ? '#00f0ff' : 'rgba(0, 240, 255, 0.3)',
        20,
        190,
        48
      );
      labelSprite.position.set(rulerX - 0.38, y, rulerZ);
      depthScaleGroup.add(labelSprite);
    });

    // Minor tick marks every 25m
    for (let m = 25; m < 2000; m += 25) {
      if (DEPTH_LEVELS.includes(m as OceanDepth)) continue;
      const y = -(m / 1000) * totalHeight;
      const minorTickGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(rulerX, y, rulerZ),
        new THREE.Vector3(rulerX - 0.08, y, rulerZ),
      ]);
      const minorTickMat = new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.35,
      });
      const minorTickLine = new THREE.Line(minorTickGeo, minorTickMat);
      depthScaleGroup.add(minorTickLine);
    }

    // 3. Update Seafloor Bathymetry Mesh, Terrain Displacement, Geological Skirts, and Contours
    if (bathymetryBundleRef.current) {
      bathymetryBundleRef.current.updateHeightAndExaggeration(totalHeight, verticalExaggeration);
    }

    // 4. Update Probes & Mooring Datum Cables to track new bathymetry height dynamically
    if (probesGroupRef.current) {
      probesGroupRef.current.children.forEach((probeGroup) => {
        const px = probeGroup.userData.px as number;
        const pz = probeGroup.userData.pz as number;
        const baseNormY = (probeGroup.userData.baseNormY || -0.5) as number;
        const probe = probeGroup.userData.probe as SensorNode;

        const seafloorY = getSeafloorWorldY(
          px,
          pz,
          slabWidth,
          slabDepth,
          totalHeight,
          verticalExaggeration,
          activeBasin.id
        );
        const nominalY = baseNormY * totalHeight;
        const depthMeters = Math.min(2000, Math.abs(probe.depth));
        const safeClearance = probe.type === 'BPR' || (probe.type === 'OMNI' && depthMeters > 700) ? 0.06 : 0.16;
        const actualY = Math.max(seafloorY + safeClearance, nominalY);

        probeGroup.position.set(px, actualY, pz);
        probeGroup.userData.nominalY = actualY;
        probeGroup.userData.seafloorY = seafloorY;

        // Recompute datum line
        const datumLine = probeGroup.getObjectByName('datum-line') as THREE.Line;
        if (datumLine) {
          const datumPoints = [
            new THREE.Vector3(0, -actualY, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, seafloorY - actualY, 0),
          ];
          datumLine.geometry.setFromPoints(datumPoints);
          datumLine.computeLineDistances();
        }

        // Recompute anchor position
        const anchor = probeGroup.getObjectByName('seafloor-anchor') as THREE.Mesh;
        if (anchor) {
          anchor.position.set(0, seafloorY - actualY + 0.012, 0);
        }
      });
    }

  }, [verticalExaggeration, activeBasin]);

  // Handle Layer Visibility changes on existing meshes
  useEffect(() => {
    if (currentsGroupRef.current) currentsGroupRef.current.visible = layerToggles.currents;
    if (probesGroupRef.current) probesGroupRef.current.visible = layerToggles.probes;
    if (probeRoutesGroupRef.current) probeRoutesGroupRef.current.visible = layerToggles.probes;
    if (anomaliesGroupRef.current) anomaliesGroupRef.current.visible = layerToggles.anomalies;
    if (waterSurfaceMeshRef.current) waterSurfaceMeshRef.current.visible = layerToggles.waterSurface;
    if (bathymetryBundleRef.current) {
      bathymetryBundleRef.current.setTerrainVisible(layerToggles.bathymetryMesh);
      bathymetryBundleRef.current.setContoursVisible(layerToggles.seafloorContours);
    }
  }, [layerToggles]);

  // Simulation Time Tick
  useEffect(() => {
    if (!isPlayingTime) return;
    const interval = setInterval(() => {
      setSimTimeStep((prev) => (prev + 1) % 48);
    }, 1800);
    return () => clearInterval(interval);
  }, [isPlayingTime]);

  // Smooth Focus on Probe click
  const handleFocusProbe = (probe: SensorNode) => {
    const currentProbe = probeNodes.find((node) => node.id === probe.id) || probe;
    setSelectedProbe(currentProbe);

    const bounds = activeBasin.bounds || {
      minLat: 5.0,
      maxLat: 22.0,
      minLon: 80.0,
      maxLon: 98.0,
    };
    const lonSpan = Math.max(1.0, bounds.maxLon - bounds.minLon);
    const latSpan = Math.max(1.0, bounds.maxLat - bounds.minLat);

    const normX = Math.max(0.08, Math.min(0.92, (currentProbe.lon - bounds.minLon) / lonSpan));
    const normZ = Math.max(0.08, Math.min(0.92, (currentProbe.lat - bounds.minLat) / latSpan));

    const px = (normX - 0.5) * (slabWidth * 0.82);
    const pz = -((normZ - 0.5) * (slabDepth * 0.82));
    const totalHeight = baseBoxHeight * (verticalExaggeration / 2.0);
    const seafloorY = getSeafloorWorldY(px, pz, slabWidth, slabDepth, totalHeight, verticalExaggeration, activeBasin.id);
    const nominalY = -(Math.min(2000, Math.abs(currentProbe.depth)) / 2000) * totalHeight;
    const depthMeters = Math.min(2000, Math.abs(currentProbe.depth));
    const safeClearance = currentProbe.type === 'BPR' || (currentProbe.type === 'OMNI' && depthMeters > 700) ? 0.06 : 0.16;
    const py = Math.max(seafloorY + safeClearance, nominalY);

    const controls = controlsRef.current;
    if (!controls) return;

    // Focus at the probe's depth and approach it from underwater.
    const focusTarget = new THREE.Vector3(px, py, pz);
    controls.target.copy(focusTarget);
    cameraRef.current?.position.copy(focusTarget).add(new THREE.Vector3(1.45, 0.45, 1.45));
    controls.update();
  };

  // Click & Hover Raycaster handling
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!cameraRef.current || !sceneRef.current || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    if (probesGroupRef.current && layerToggles.probes) {
      const probeHits = raycaster.intersectObjects(probesGroupRef.current.children, true);
      if (probeHits.length > 0) {
        let obj: THREE.Object3D | null = probeHits[0].object;
        while (obj && !obj.userData.probe) {
          obj = obj.parent;
        }
        if (obj && obj.userData.probe) {
          handleFocusProbe(obj.userData.probe);
          return;
        }
      }
    }

    if (anomaliesGroupRef.current && layerToggles.anomalies) {
      const anomHits = raycaster.intersectObjects(anomaliesGroupRef.current.children, true);
      if (anomHits.length > 0) {
        let obj: THREE.Object3D | null = anomHits[0].object;
        while (obj && !obj.userData.anomaly) {
          obj = obj.parent;
        }
        if (obj && obj.userData.anomaly) {
          setSelectedAnomaly(obj.userData.anomaly);
          return;
        }
      }
    }
  };

  // Hover detection for current flow vectors
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!cameraRef.current || !currentsGroupRef.current || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    if (layerToggles.currents) {
      const hits = raycaster.intersectObjects(currentsGroupRef.current.children, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.vector) obj = obj.parent;
        if (obj && obj.userData.vector) {
          setHoveredVector(obj.userData.vector);
          setHoveredVectorScreenPos({ x: e.clientX, y: e.clientY });
          return;
        }
      }
    }
    setHoveredVector(null);
    setHoveredVectorScreenPos(null);
  };

  return (
    <div
      ref={mountRef}
      onMouseMove={handleCanvasMouseMove}
      onContextMenu={(e) => e.preventDefault()}
      onClick={handleCanvasClick}
      className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-[#010e24] cursor-grab active:cursor-grabbing select-none"
    >
      {/* Three.js Canvas Container */}
      <div ref={canvasContainerRef} className="absolute inset-0 z-0" />

      {/* Floating Hover Tooltip for Current Flow Vector */}
      {hoveredVector && hoveredVectorScreenPos && (
        <div
          style={{
            left: `${hoveredVectorScreenPos.x + 15}px`,
            top: `${hoveredVectorScreenPos.y - 45}px`,
          }}
          className="fixed z-40 pointer-events-none bg-[#0d1c32]/95 backdrop-blur-xl border border-[#00f0ff]/40 px-3 py-2 rounded-xl shadow-2xl font-mono text-xs text-[#dbfcff]"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-ping"></span>
            <span className="font-bold text-[#00f0ff]">{hoveredVector.id.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <span className="text-[#b9cacb]">CURRENT SPEED:</span>
            <span className="font-bold text-[#43ffbb]">{hoveredVector.speed.toFixed(2)} m/s</span>
            <span className="text-[#b9cacb]">FLOW HEADING:</span>
            <span className="font-bold text-white">{hoveredVector.directionDeg}°</span>
            <span className="text-[#b9cacb]">DEPTH SLICE:</span>
            <span className="font-bold text-[#00f0ff]">{activeDepth}m</span>
          </div>
        </div>
      )}

      {/* Probe Detail Sliding Drawer */}
      {selectedProbe && (
        <div onClick={(event) => event.stopPropagation()}>
          <ProbeDetailPanel
            probe={selectedProbe}
            onClose={() => setSelectedProbe(null)}
            activeDepth={activeDepth}
            onSelectDepth={setActiveDepth}
            onAlignSliceToProbe={(d) => {
              setActiveDepth(d as OceanDepth);
            }}
          />
        </div>
      )}

      {/* Anomaly Detail Modal */}
      {selectedAnomaly && (
        <AnomalyDetailModal
          anomaly={selectedAnomaly}
          onClose={() => setSelectedAnomaly(null)}
        />
      )}

      {/* Subtle Bottom Navigation Tip */}
      <div className="absolute bottom-1 left-4 font-mono text-[10px] text-[#b9cacb]/60 pointer-events-none z-10 hidden sm:block">
        Left-Click + Drag to Orbit • Right-Click + Drag to Pan • Scroll to Zoom • Depth Buttons/Slider to Animate Slice Plane
      </div>
    </div>
  );
};
