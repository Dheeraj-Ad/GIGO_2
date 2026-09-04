export interface BackendHealth {
  status: string;
  service: string;
}

export interface ModelSource {
  key: string;
  label: string;
  type: string;
  kind: string;
  variables: string[];
  default_bbox: number[];
  auth_required: boolean;
}

export interface ModelVariable {
  key: string;
  label: string;
  units: string;
  cf_standard_name: string;
  default_range: [number, number];
  default_colormap: string;
  log_scale: boolean;
  available_sources: string[];
}

export interface GridSlice {
  variable: string;
  units: string;
  time: string | null;
  depth_m: number | null;
  lon: number[];
  lat: number[];
  values: Array<Array<number | null>>;
  value_range: [number, number];
  colormap: string;
}

export interface VolumeSlice {
  variable: string;
  units: string;
  time: string | null;
  depths_m: number[];
  lon: number[];
  lat: number[];
  values: Array<Array<Array<number | null>>>;
  value_range: [number, number];
  colormap: string;
}

export interface ArgoFloatSummary {
  platform_number: string;
  dac: string;
  lon: number;
  lat: number;
  last_profile_time: string;
  n_profiles: number;
  status: 'active' | 'inactive' | 'unknown';
}

export interface ArgoProfile {
  platform_number: string;
  cycle_number: number;
  time: string;
  lon: number;
  lat: number;
  pressure_db: number[];
  variables: Record<string, Array<number | null>>;
  variable_units: Record<string, string>;
}

export interface GliderSummary {
  glider_id: string;
  deployment_name: string;
  file_path: string;
  lon: number;
  lat: number;
  last_fix_time: string;
  trajectory_points: number;
  status: 'active' | 'inactive' | 'unknown';
}

export interface GliderTrajectory {
  glider_id: string;
  lon: number[];
  lat: number[];
  time: string[];
  depth_m: Array<number | null> | null;
}

export interface GliderProfile {
  glider_id: string;
  profile_index: number;
  time: string;
  lon: number;
  lat: number;
  depth_m: number[];
  variables: Record<string, Array<number | null>>;
  variable_units: Record<string, string>;
}

export interface ColorScale {
  name: string;
  stops: string[];
  description: string;
}

export interface DomainConfig {
  bbox: { west: number; south: number; east: number; north: number };
  [key: string]: unknown;
}

export interface GNewsArticle {
  title: string;
  description: string | null;
  url: string;
  image: string | null;
  publishedAt: string;
  source: {
    name: string;
    url: string;
  };
}

const gnewsApiKey = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env?.VITE_GNEWS_API_KEY;

export const hasGNewsApiKey = Boolean(gnewsApiKey);

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const oceanApi = {
  health: () => get<BackendHealth>('/api/health'),
  listSources: () => get<ModelSource[]>('/api/v1/model/sources'),
  listVariables: () => get<ModelVariable[]>('/api/v1/model/variables'),
  getSlice: (params: Record<string, string | number>) =>
    get<GridSlice>(`/api/v1/model/slice?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  getVolume: (params: Record<string, string | number>) =>
    get<VolumeSlice>(`/api/v1/model/volume?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  listArgoFloats: (params: Record<string, string | number> = {}) =>
    get<ArgoFloatSummary[]>(`/api/v1/argo/floats?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  getArgoProfile: (platformNumber: string, params: Record<string, string | number> = {}) =>
    get<ArgoProfile>(`/api/v1/argo/profile/${encodeURIComponent(platformNumber)}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  listGliderDeployments: (params: Record<string, string | number> = {}) =>
    get<GliderSummary[]>(`/api/v1/glider/deployments?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  getGliderTrajectory: (gliderId: string, filePath: string) =>
    get<GliderTrajectory>(`/api/v1/glider/trajectory/${encodeURIComponent(gliderId)}?file_path=${encodeURIComponent(filePath)}`),
  getGliderProfiles: (gliderId: string, filePath: string, maxProfiles = 50) =>
    get<GliderProfile[]>(`/api/v1/glider/profiles/${encodeURIComponent(gliderId)}?file_path=${encodeURIComponent(filePath)}&max_profiles=${maxProfiles}`),
  listColorscales: () => get<ColorScale[]>('/api/v1/colorscales'),
  getDomain: () => get<DomainConfig>('/api/v1/domain'),
  getMarineNews: async (
    query = '("Indian Ocean" OR "Bay of Bengal" OR "Arabian Sea" OR Andaman) AND ("ocean probe" OR "Argo float" OR glider OR "bottom pressure recorder" OR seismometer OR seismic OR tsunami OR earthquake)'
  ) => {
    if (!gnewsApiKey) return [] as GNewsArticle[];

    const params = new URLSearchParams({
      q: query,
      lang: 'en',
      max: '8',
      sortby: 'publishedAt',
      token: gnewsApiKey,
    });
    const response = await fetch(`/gnews/search?${params}`);
    if (!response.ok) throw new Error(`GNews request failed: ${response.status}`);
    const payload = (await response.json()) as { articles?: GNewsArticle[] };
    return payload.articles ?? [];
  },
};