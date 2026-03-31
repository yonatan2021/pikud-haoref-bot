import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export interface CityResult {
  name: string;
  zone?: string;
  countdown?: number;
}

interface CityMultiSelectProps {
  selected: CityResult[];
  onChange: (cities: CityResult[]) => void;
  maxCities?: number;
}

function useDebounce(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function CityMultiSelect({ selected, onChange, maxCities = 50 }: CityMultiSelectProps) {
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<CityResult[]>({
    queryKey: ['city-search', debouncedQuery],
    queryFn: () => api.get<CityResult[]>(`/api/messages/cities?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length >= 2,
  });

  // Filter out already-selected cities
  const selectedNames = new Set(selected.map((c) => c.name));
  const filteredResults = results.filter((c) => !selectedNames.has(c.name));

  const handleSelect = useCallback(
    (city: CityResult) => {
      if (selected.length >= maxCities) return;
      onChange([...selected, city]);
      setQuery('');
      setDropdownOpen(false);
    },
    [selected, maxCities, onChange],
  );

  const handleRemove = useCallback(
    (name: string) => {
      onChange(selected.filter((c) => c.name !== name));
    },
    [selected, onChange],
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const atLimit = selected.length >= maxCities;
  const nearLimit = selected.length >= maxCities - 5 && !atLimit;

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-sm text-text-secondary mb-1">ערים לסימולציה</label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((city) => (
            <span
              key={city.name}
              className="inline-flex items-center gap-1 bg-surface border border-border
                         rounded-full px-2.5 py-0.5 text-xs text-text-primary"
            >
              {city.name}
              {city.countdown != null && city.countdown > 0 && (
                <span className="text-text-muted">⏱{city.countdown}שנ׳</span>
              )}
              <button
                type="button"
                onClick={() => handleRemove(city.name)}
                className="text-text-muted hover:text-red-400 transition-colors mr-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
        onFocus={() => setDropdownOpen(true)}
        placeholder={atLimit ? `הגעת לגבול ${maxCities} ערים` : 'חפש עיר...'}
        disabled={atLimit}
        className="w-full bg-base border border-border rounded-lg px-3 py-2
                   text-sm text-text-primary placeholder:text-text-muted
                   focus:outline-none focus:border-amber/50
                   disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Warning near limit */}
      {nearLimit && (
        <p className="text-xs text-amber mt-1">
          קרוב לגבול {maxCities} ערים ({selected.length}/{maxCities})
        </p>
      )}

      {/* Dropdown */}
      {dropdownOpen && filteredResults.length > 0 && debouncedQuery.length >= 2 && (
        <div className="absolute z-40 top-full mt-1 w-full bg-surface border border-border
                        rounded-lg shadow-xl max-h-[200px] overflow-y-auto">
          {filteredResults.map((city) => (
            <button
              key={city.name}
              type="button"
              onClick={() => handleSelect(city)}
              className="w-full text-start px-3 py-2 text-sm text-text-primary
                         hover:bg-white/5 transition-colors flex items-center justify-between"
            >
              <span>{city.name}</span>
              <span className="text-text-muted text-xs">
                {city.zone}
                {city.countdown != null && city.countdown > 0 && ` · ⏱${city.countdown}שנ׳`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
