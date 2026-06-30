import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Terminverwaltung, Kundenverwaltung, Monteurdaten } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

/** Dashboard data + the OPTIMISTIC-WRITE API.
 *
 *  The per-entity setters (`set<Entity>`) are exported for exactly one job:
 *  optimistic updates on drag writes (onEventDrop / onEventResize /
 *  onCardMove). Call the setter FIRST — the bar/card lands instantly — then
 *  fire the PATCH in the background and call `fetchAll()` ONLY in the catch.
 *  Never await the PATCH before updating state (the UI freezes for the full
 *  round-trip on every drag) and never refetch after a successful write.
 *  There is no other mechanism (no `__optimistic`, no `mutate`).
 */
export function useDashboardData() {
  const [terminverwaltung, setTerminverwaltung] = useState<Terminverwaltung[]>([]);
  const [kundenverwaltung, setKundenverwaltung] = useState<Kundenverwaltung[]>([]);
  const [monteurdaten, setMonteurdaten] = useState<Monteurdaten[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [terminverwaltungData, kundenverwaltungData, monteurdatenData] = await Promise.all([
        LivingAppsService.getTerminverwaltung(),
        LivingAppsService.getKundenverwaltung(),
        LivingAppsService.getMonteurdaten(),
      ]);
      setTerminverwaltung(terminverwaltungData);
      setKundenverwaltung(kundenverwaltungData);
      setMonteurdaten(monteurdatenData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [terminverwaltungData, kundenverwaltungData, monteurdatenData] = await Promise.all([
          LivingAppsService.getTerminverwaltung(),
          LivingAppsService.getKundenverwaltung(),
          LivingAppsService.getMonteurdaten(),
        ]);
        setTerminverwaltung(terminverwaltungData);
        setKundenverwaltung(kundenverwaltungData);
        setMonteurdaten(monteurdatenData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const kundenverwaltungMap = useMemo(() => {
    const m = new Map<string, Kundenverwaltung>();
    kundenverwaltung.forEach(r => m.set(r.record_id, r));
    return m;
  }, [kundenverwaltung]);

  const monteurdatenMap = useMemo(() => {
    const m = new Map<string, Monteurdaten>();
    monteurdaten.forEach(r => m.set(r.record_id, r));
    return m;
  }, [monteurdaten]);

  return { terminverwaltung, setTerminverwaltung, kundenverwaltung, setKundenverwaltung, monteurdaten, setMonteurdaten, loading, error, fetchAll, kundenverwaltungMap, monteurdatenMap };
}