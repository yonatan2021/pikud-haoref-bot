import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { ZonePicker } from './ZonePicker';

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

interface Preset {
  name: string;
  cities: CityResult[];
}

const PRESETS_KEY = 'city-presets';
const MAX_PRESETS = 10;

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PRESETS) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]): void {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
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
  const [mode, setMode] = useState<'search' | 'zone'>('search');
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const presetRef = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<CityResult[]>({
    queryKey: ['city-search', debouncedQuery],
    queryFn: () => api.get<CityResult[]>(`/api/messages/cities?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length >= 2 && mode === 'search',
  });

  // Filter out already-selected cities
  const selectedNames = useMemo(() => new Set(selected.map((c) => c.name)), [selected]);
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

  const handleAddAll = useCallback(() => {
    const available = maxCities - selected.length;
    if (available <= 0) {
      toast.error(`הגעת לגבול ${maxCities} ערים`);
      return;
    }
    const toAdd = filteredResults.slice(0, available);
    if (toAdd.length < filteredResults.length) {
      toast(`נוספו ${toAdd.length} מתוך ${filteredResults.length} תוצאות (מגבלת ${maxCities})`, {
        icon: '⚠️',
      });
    }
    onChange([...selected, ...toAdd]);
    setQuery('');
    setDropdownOpen(false);
  }, [selected, filteredResults, maxCities, onChange]);

  const handleRemove = useCallback(
    (name: string) => {
      onChange(selected.filter((c) => c.name !== name));
    },
    [selected, onChange],
  );

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  // Preset management
  const handleSavePreset = useCallback(() => {
    if (selected.length === 0) {
      toast.error('אין ערים לשמירה');
      return;
    }
    const name = prompt('שם הפריסט:');
    if (!name || name.trim() === '') return;

    const updated = [{ name: name.trim(), cities: selected }, ...presets].slice(0, MAX_PRESETS);
    setPresets(updated);
    savePresets(updated);
    toast.success(`נשמר: ${name.trim()}`);
  }, [selected, presets]);

  const handleLoadPreset = useCallback(
    (preset: Preset) => {
      onChange(preset.cities.slice(0, maxCities));
      setPresetDropdownOpen(false);
    },
    [onChange, maxCities],
  );

  const handleDeletePreset = useCallback(
    (presetName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = presets.filter((p) => p.name !== presetName);
      setPresets(updated);
      savePresets(updated);
    },
    [presets],
  );

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setPresetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const atLimit = selected.length >= maxCities;
  const nearLimit = selected.length >= maxCities - 5 && !atLimit;

  return (
    <div ref={containerRef}>
      {/* Header: label + count + presets */}
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm text-text-secondary">ערים לסימולציה</label>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="text-xs text-text-muted">
              {selected.length}/{maxCities}
            </span>
          )}
          {/* Preset dropdown */}
          <div className="relative" ref={presetRef}>
            <button
              type="button"
              onClick={() => setPresetDropdownOpen((v) => !v)}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
              title="פריסטים"
            >
              ★
            </button>
            {presetDropdownOpen && (
              <div className="absolute z-50 top-full mt-1 left-0 bg-surface border border-border
                              rounded-lg shadow-xl min-w-[180px] overflow-hidden">
                {presets.length === 0 ? (
                  <p className="text-xs text-text-muted px-3 py-2">אין פריסטים שמורים</p>
                ) : (
                  presets.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleLoadPreset(preset)}
                      className="w-full text-start px-3 py-1.5 text-sm text-text-primary
                                 hover:bg-white/5 transition-colors flex items-center justify-between"
                    >
                      <span>{preset.name} ({preset.cities.length})</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleDeletePreset(preset.name, e)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleDeletePreset(preset.name, e as unknown as React.MouseEvent); }}
                        className="text-text-muted hover:text-red-400 text-xs"
                      >
                        ×
                      </span>
                    </button>
                  ))
                )}
                <div className="border-t border-border">
                  <button
                    type="button"
                    onClick={handleSavePreset}
                    disabled={selected.length === 0}
                    className="w-full text-start px-3 py-1.5 text-xs text-blue hover:bg-white/5
                               disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    + שמור מצב נוכחי
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected chips + bulk clear */}
      {selected.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-1.5">
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
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs text-text-muted hover:text-red-400 transition-colors mt-1"
          >
            נקה הכל
          </button>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            mode === 'search'
              ? 'bg-amber/15 text-amber'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          חיפוש עיר
        </button>
        <button
          type="button"
          onClick={() => setMode('zone')}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            mode === 'zone'
              ? 'bg-amber/15 text-amber'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          בחירה לפי אזור
        </button>
      </div>

      {/* Search mode */}
      {mode === 'search' && (
        <div className="relative">
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
              {/* Add all results button */}
              {filteredResults.length > 1 && (
                <button
                  type="button"
                  onClick={handleAddAll}
                  className="w-full text-center px-3 py-2 text-xs text-blue
                             hover:bg-white/5 border-t border-border transition-colors"
                >
                  הוסף את כל התוצאות ({filteredResults.length})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Zone mode */}
      {mode === 'zone' && (
        <ZonePicker selected={selected} onChange={onChange} maxCities={maxCities} />
      )}
    </div>
  );
}
