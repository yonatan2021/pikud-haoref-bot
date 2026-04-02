import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import type { CityResult } from './CityMultiSelect';

interface ZoneCity {
  name: string;
  zone: string;
  countdown: number;
}

interface ZoneData {
  name: string;
  cityCount: number;
  cities: ZoneCity[];
}

interface SuperRegionData {
  name: string;
  zones: ZoneData[];
}

interface ZonesResponse {
  superRegions: SuperRegionData[];
}

interface ZonePickerProps {
  selected: CityResult[];
  onChange: (cities: CityResult[]) => void;
  maxCities: number;
}

export function ZonePicker({ selected, onChange, maxCities }: ZonePickerProps) {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<ZonesResponse>({
    queryKey: ['zones-hierarchy'],
    queryFn: () => api.get<ZonesResponse>('/api/messages/zones'),
    staleTime: Infinity,
  });

  const selectedNames = useMemo(() => new Set(selected.map((c) => c.name)), [selected]);

  const getZoneStatus = useCallback(
    (zone: ZoneData): 'none' | 'partial' | 'all' => {
      if (zone.cities.length === 0) return 'none';
      const selectedInZone = zone.cities.filter((c) => selectedNames.has(c.name)).length;
      if (selectedInZone === 0) return 'none';
      if (selectedInZone === zone.cities.length) return 'all';
      return 'partial';
    },
    [selectedNames],
  );

  const handleToggleRegion = useCallback((regionName: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionName)) {
        next.delete(regionName);
      } else {
        next.add(regionName);
      }
      return next;
    });
  }, []);

  const handleAddZone = useCallback(
    (zone: ZoneData) => {
      const newCities = zone.cities.filter((c) => !selectedNames.has(c.name));
      if (newCities.length === 0) return;

      const available = maxCities - selected.length;
      if (available <= 0) {
        toast.error(`הגעת לגבול ${maxCities} ערים`);
        return;
      }

      const toAdd = newCities.slice(0, available);
      if (toAdd.length < newCities.length) {
        toast(`נוספו ${toAdd.length} מתוך ${newCities.length} ערים (מגבלת ${maxCities})`, {
          icon: '⚠️',
        });
      }

      const mapped: CityResult[] = toAdd.map((c) => ({
        name: c.name,
        zone: c.zone,
        countdown: c.countdown,
      }));
      onChange([...selected, ...mapped]);
    },
    [selected, selectedNames, maxCities, onChange],
  );

  const handleRemoveZone = useCallback(
    (zone: ZoneData) => {
      const zoneNames = new Set(zone.cities.map((c) => c.name));
      onChange(selected.filter((c) => !zoneNames.has(c.name)));
    },
    [selected, onChange],
  );

  if (isLoading) {
    return (
      <div className="text-sm text-text-muted text-center py-4">טוען אזורים...</div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-h-[300px] overflow-y-auto space-y-1">
      {data.superRegions.map((sr) => {
        const isExpanded = expandedRegions.has(sr.name);
        return (
          <div key={sr.name}>
            {/* Super-region header */}
            <button
              type="button"
              onClick={() => handleToggleRegion(sr.name)}
              className="w-full flex items-center justify-between px-2 py-1.5
                         text-sm font-medium text-text-primary hover:bg-white/5
                         rounded-lg transition-colors"
            >
              <span>{sr.name}</span>
              <span className="text-text-muted text-xs">
                {isExpanded ? '▾' : '◂'} {sr.zones.length} אזורים
              </span>
            </button>

            {/* Zones list */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pr-3 space-y-0.5">
                    {sr.zones.map((zone) => {
                      const status = getZoneStatus(zone);
                      return (
                        <div
                          key={zone.name}
                          className="flex items-center justify-between px-2 py-1.5
                                     text-sm rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {/* Status indicator */}
                            <span className="w-4 text-center text-xs">
                              {status === 'all' && (
                                <span className="text-green">✓</span>
                              )}
                              {status === 'partial' && (
                                <span className="text-amber">◐</span>
                              )}
                            </span>
                            <span className="text-text-primary">{zone.name}</span>
                            <span className="text-text-muted text-xs">
                              {zone.cityCount} ערים
                            </span>
                          </div>

                          {/* Add/Remove button */}
                          {status === 'all' ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveZone(zone)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                              הסר
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddZone(zone)}
                              className="text-xs text-blue hover:text-blue/80 transition-colors"
                            >
                              {status === 'partial' ? 'השלם' : 'הוסף'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
