import { SensorNode } from '../types';

const csvNumber = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function parseProbeCsv(csv: string): SensorNode[] {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  if (!headerLine) return [];
  const headers = headerLine.split(',');

  return lines.filter(Boolean).map((line) => {
    const values = line.split(',');
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    const depth = csvNumber(row.depth);

    return {
      id: row.id,
      name: `${row.type} ${row.id.replace(`${row.type}-`, '')}`,
      type: row.type as SensorNode['type'],
      lat: csvNumber(row.latitude),
      lon: csvNumber(row.longitude),
      depth,
      sst: csvNumber(row.temperature),
      salinity: csvNumber(row.salinity),
      chlorophyll: csvNumber(row.chlorophyll),
      humidity: csvNumber(row.humidity),
      pressure: csvNumber(row.pressure),
      status: row.status as SensorNode['status'],
      basin: row.basin,
      battery: csvNumber(row.battery),
      windDirection: csvNumber(row.current_direction),
      windSpeed: csvNumber(row.current_speed),
      currentDirection: csvNumber(row.current_direction),
      currentSpeed: csvNumber(row.current_speed),
      heading: csvNumber(row.current_direction),
      speedKnots: csvNumber(row.current_speed) * 1.94,
    };
  });
}

export async function loadProbeCsv(): Promise<SensorNode[]> {
  const response = await fetch('/data/probes.csv');
  if (!response.ok) throw new Error(`Probe CSV request failed: ${response.status}`);
  return parseProbeCsv(await response.text());
}