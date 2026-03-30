export interface Alert {
  id?: string;
  type: string;
  cities: string[];
  instructions?: string;
  receivedAt?: number; // Unix ms timestamp set by the poller at emission time
}

export interface CityEntry {
  id: number;
  name: string;
  zone: string;
  countdown: number;
  lat: number;
  lng: number;
  value: string;
}

export type PolygonCoords = [number, number][];
export type PolygonsMap = Record<string, PolygonCoords>;
