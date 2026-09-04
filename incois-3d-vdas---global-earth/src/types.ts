export type ViewMode = 'satellite-globe' | 'interactive-ocean';

export type OceanDepth = 0 | 50 | 100 | 200 | 500 | 1000 | 1500 | 2000;

export type OceanVariable = 'TEMPERATURE' | 'SALINITY' | 'CURRENTS' | 'CHLOROPHYLL';

export interface DepthProfileLevel {
  depth: number;
  temperature: number; // °C
  salinity: number; // PSU
  chlorophyll: number; // mg/m³
  pressure: number; // dbar
}

export interface BasinTarget {
  id: string;
  name: string;
  zone: string;
  subtext: string;
  lat: number;
  lon: number;
  status: string;
  locked?: boolean;
  activeFloats: number;
  sst: number;
  sstAnomaly: string;
  salinity: number;
  waveHeight: number;
  wavePeriod: string;
  flowVelocity: number;
  flowHeading: string;
  depth: number;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

export interface SensorNode {
  id: string;
  name: string;
  type: 'ARGO' | 'GLIDER' | 'OMNI' | 'RAMA' | 'BPR' | 'DRIFTER';
  lat: number;
  lon: number;
  depth: number;
  sst: number;
  salinity: number;
  chlorophyll: number;
  humidity?: number;
  pressure: number;
  status: 'Active' | 'ONLINE' | 'TRANSMITTING' | 'CALIBRATING' | 'DRIFTING';
  lastPing?: string;
  depthProfile?: DepthProfileLevel[];
  basin: string;
  battery: number;
  heading?: number;
  speedKnots?: number;
  windDirection?: number;
  windSpeed?: number;
  currentDirection?: number;
  currentSpeed?: number;
}

export interface OceanAnomaly {
  id: string;
  name: string;
  type: 'HEATWAVE' | 'CYCLONIC_EDDY' | 'ANTICYCLONIC_EDDY' | 'LOW_SALINITY_PLUME' | 'UPWELLING';
  lat: number;
  lon: number;
  depthRange: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  deltaValue: string;
  affectedAreaKm2: number;
  detectedDate: string;
  basin: string;
  summary: string;
  advisory: string;
}

export interface CurrentVector {
  id: string;
  lat: number;
  lon: number;
  u: number; // Eastward velocity m/s
  v: number; // Northward velocity m/s
  speed: number; // Magnitude m/s
  directionDeg: number;
}

export interface LayerToggles {
  currents: boolean;
  probes: boolean;
  anomalies: boolean;
  bathymetryMesh: boolean;
  waterSurface: boolean;
  seafloorContours: boolean;
}

export interface OpticsSettings {
  projection: 'PERSPECTIVE' | 'ORTHOGRAPHIC';
  bathymetryExaggeration: number;
  dayNightTerminator: boolean;
  cloudCover: boolean;
  opticalMagnification: number;
}

export interface SatelliteTrack {
  id: string;
  name: string;
  role: string;
  altitudeKm: number;
  speedKmS: number;
  status: string;
  color: string;
}

export interface EarlyWarningAlert {
  id: string;
  type: 'TSUNAMI' | 'CYCLONE' | 'STORM_SURGE' | 'HIGH_SWELL';
  level: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  region: string;
  source: string;
  details: string;
  timestamp: string;
  status: string;
}

export type NavigationScreen = 
  | 'globe-overview'
  | 'volumetric-ocean'
  | 'probe-telemetry'
  | 'anomaly-alerts';
