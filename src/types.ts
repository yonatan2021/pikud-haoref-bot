export interface Alert {
  id?: string;
  type: string;
  cities: string[];
  instructions?: string;
}

export interface CityEntry {
  id: number;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  value: string;
}

export type PolygonCoords = [number, number][];
export type PolygonsMap = Record<string, PolygonCoords>;
