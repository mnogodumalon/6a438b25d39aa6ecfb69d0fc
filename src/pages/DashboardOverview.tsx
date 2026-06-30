import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichTerminverwaltung } from '@/lib/enrich';
import type { EnrichedTerminverwaltung } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDateTime, lookupKey } from '@/lib/formatters';
import { useState, useMemo, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { IconAlertCircle, IconTool, IconRefresh, IconCheck, IconCalendar, IconMapPin, IconClock, IconAlertTriangle, IconCircleCheck, IconPlus, IconUsers } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { de } from 'date-fns/locale';
import { format, parseISO, isToday, startOfWeek, endOfWeek, isWithinInterval, isBefore, startOfDay } from 'date-fns';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  RecordOverlay,
  RecordHeader,
  RecordSection,
  RecordField,
  RecordAttachments,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import {
  CalendarWidget,
  type CalendarEvent,
  type CalendarTone,
} from '@/components/widgets/CalendarWidget';
import {
  MapWidget,
  MapRouteLinks,
  type MapMarker,
} from '@/components/widgets/MapWidget';
import { useClock, gruss, namen, ENTRANCE, entranceDelay, undoToast } from '@/lib/polish';
import { TerminverwaltungDialog } from '@/components/dialogs/TerminverwaltungDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import { AI_PHOTO_LOCATION } from '@/config/ai-features';

const APPGROUP_ID = '6a438b25d39aa6ecfb69d0fc';
const REPAIR_ENDPOINT = '/claude/build/repair';
const EVENT_PREFIX = 'termin';

function terminIdOf(ev: CalendarEvent): string {
  return ev.id.split(':')[1] ?? '';
}
function markerIdOf(marker: MapMarker): string {
  return marker.id.split(':')[1] ?? '';
}

function toneForTermin(t: EnrichedTerminverwaltung): CalendarTone {
  if (t.fields.erledigt) return 'success';
  const art = lookupKey(t.fields.auftragsart);
  if (art === 'notdienst') return 'destructive';
  if (art === 'reparatur') return 'warning';
  return 'primary';
}

export default function DashboardOverview() {
  const {
    terminverwaltung, setTerminverwaltung,
    kundenverwaltung, monteurdaten,
    kundenverwaltungMap, monteurdatenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<{ type: string; id: string }>();

  const [filter, setFilter] = useState<'all' | 'heute' | 'offen' | 'notdienst'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<Partial<EnrichedTerminverwaltung['fields']> | undefined>();
  const [editRecord, setEditRecord] = useState<EnrichedTerminverwaltung | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [mapView, setMapView] = useState(false);

  const enriched = useMemo(
    () => enrichTerminverwaltung(terminverwaltung, { kundenverwaltungMap, monteurdatenMap }),
    [terminverwaltung, kundenverwaltungMap, monteurdatenMap]
  );

  // Heute & Woche
  const today = startOfDay(clock);
  const weekStart = startOfWeek(clock, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(clock, { weekStartsOn: 1 });

  const heute = useMemo(
    () => enriched.filter(t => t.fields.termin_datum && isToday(parseISO(t.fields.termin_datum))),
    [enriched]
  );
  const dieseWoche = useMemo(
    () => enriched.filter(t => t.fields.termin_datum && isWithinInterval(parseISO(t.fields.termin_datum), { start: weekStart, end: weekEnd })),
    [enriched, weekStart, weekEnd]
  );
  const offen = useMemo(
    () => enriched.filter(t => !t.fields.erledigt),
    [enriched]
  );
  const notdienste = useMemo(
    () => enriched.filter(t => lookupKey(t.fields.auftragsart) === 'notdienst' && !t.fields.erledigt),
    [enriched]
  );
  const ueberfaellig = useMemo(
    () => enriched.filter(t =>
      !t.fields.erledigt &&
      t.fields.termin_datum &&
      isBefore(parseISO(t.fields.termin_datum), today)
    ),
    [enriched, today]
  );

  // Kalender-Events
  const events = useMemo((): CalendarEvent[] => {
    const base = filter === 'heute' ? heute
      : filter === 'offen' ? offen
      : filter === 'notdienst' ? notdienste
      : enriched;
    return base.map(t => ({
      id: `${EVENT_PREFIX}:${t.record_id}`,
      start: t.fields.termin_datum ?? format(clock, "yyyy-MM-dd'T'HH:mm"),
      title: t.kundeName || 'Unbekannter Kunde',
      subtitle: [
        t.fields.auftragsart?.label,
        t.monteurName,
      ].filter(Boolean).join(' · '),
      tone: toneForTermin(t),
    }));
  }, [enriched, heute, offen, notdienste, filter, clock]);

  // Karten-Marker für heutige Termine
  const mapMarkers = useMemo((): MapMarker[] => {
    return heute.flatMap(t => {
      const kundeId = extractRecordId(t.fields.kunde);
      if (!kundeId) return [];
      const kunde = kundenverwaltungMap.get(kundeId);
      if (!kunde?.fields.standort) return [];
      const geo = kunde.fields.standort;
      return [{
        id: `termin:${t.record_id}`,
        lat: geo.lat,
        long: geo.long,
        title: t.kundeName || 'Kunde',
        subtitle: [t.fields.auftragsart?.label, t.monteurName].filter(Boolean).join(' · '),
        tone: toneForTermin(t) as 'default' | 'primary' | 'success' | 'warning' | 'destructive',
        icon: 'tool' as const,
      }];
    });
  }, [heute, kundenverwaltungMap]);

  // Termin als erledigt markieren (optimistisch)
  const markErledigt = useCallback((t: EnrichedTerminverwaltung) => {
    const prev = [...terminverwaltung];
    setTerminverwaltung(terminverwaltung.map(r =>
      r.record_id === t.record_id ? { ...r, fields: { ...r.fields, erledigt: true } } : r
    ));
    undoToast(`"${t.kundeName || 'Termin'}" als erledigt markiert`, () => {
      setTerminverwaltung(prev);
      LivingAppsService.updateTerminverwaltungEntry(t.record_id, { erledigt: false }).catch(() => fetchAll());
    });
    LivingAppsService.updateTerminverwaltungEntry(t.record_id, { erledigt: true }).catch(() => {
      setTerminverwaltung(prev);
      fetchAll();
    });
  }, [terminverwaltung, setTerminverwaltung, fetchAll]);

  // Drag-to-reschedule
  const handleEventDrop = useCallback(async (eventId: string, newStart: string) => {
    const terminId = eventId.split(':')[1] ?? '';
    const termin = terminverwaltung.find(t => t.record_id === terminId);
    if (!termin) return;
    const prev = [...terminverwaltung];
    setTerminverwaltung(terminverwaltung.map(r =>
      r.record_id === terminId ? { ...r, fields: { ...r.fields, termin_datum: newStart } } : r
    ));
    const kundeName = enriched.find(e => e.record_id === terminId)?.kundeName ?? 'Termin';
    undoToast(`"${kundeName}" verschoben auf ${formatDateTime(newStart)}`, () => {
      setTerminverwaltung(prev);
      LivingAppsService.updateTerminverwaltungEntry(terminId, { termin_datum: termin.fields.termin_datum }).catch(() => fetchAll());
    });
    LivingAppsService.updateTerminverwaltungEntry(terminId, { termin_datum: newStart }).catch(() => {
      setTerminverwaltung(prev);
      fetchAll();
    });
  }, [terminverwaltung, setTerminverwaltung, enriched, fetchAll]);

  // Kalender: Leeres Slot klicken = Termin anlegen
  const handleEmptyClick = useCallback((date: Date) => {
    setCreateDefaults({ termin_datum: format(date, "yyyy-MM-dd'T'HH:mm") });
    setCreateOpen(true);
  }, []);

  // Overlay: overlay item zu Record auflösen
  const overlayTermin = overlay.top?.type === 'termin'
    ? enriched.find(t => t.record_id === overlay.top!.id) ?? null
    : null;

  // Greeting
  const heuteNamen = heute.slice(0, 3).map(t => t.kundeName).filter(Boolean);
  const grussText = gruss(clock);
  const contextLine = heute.length === 0
    ? 'Heute keine Termine — gute Zeit zum Vorbereiten.'
    : `Heute ${heute.length === 1 ? 'ein Termin' : `${heute.length} Termine`}: ${namen(heuteNamen)}`;

  // Notdienst-Hero: erste unerleichte Notdienst-Termin heute
  const heutigeNotdienste = useMemo(
    () => heute.filter(t => lookupKey(t.fields.auftragsart) === 'notdienst' && !t.fields.erledigt),
    [heute]
  );

  // Aside-Liste: Heute fällige offene Termine
  const heuteOffen = useMemo(
    () => heute.filter(t => !t.fields.erledigt)
      .sort((a, b) => (a.fields.termin_datum ?? '').localeCompare(b.fields.termin_datum ?? '')),
    [heute]
  );

  // Morgen-Vorschau
  const morgen = useMemo(() => {
    const m = new Date(clock);
    m.setDate(m.getDate() + 1);
    const mStr = format(m, 'yyyy-MM-dd');
    return enriched.filter(t => t.fields.termin_datum?.startsWith(mStr));
  }, [enriched, clock]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className={`flex flex-wrap items-start justify-between gap-3 ${ENTRANCE}`}>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{grussText}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground truncate max-w-lg">{contextLine}</p>
        </div>
        <Button
          onClick={() => { setCreateDefaults(undefined); setCreateOpen(true); }}
          className="shrink-0"
        >
          <IconPlus size={16} className="mr-1.5 shrink-0" />
          Neuer Termin
        </Button>
      </div>

      <DashboardGrid
        hero={
          heutigeNotdienste.length > 0 ? (
            <HeroBanner
              tone="destructive"
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: 'Als erledigt markieren',
                onClick: () => markErledigt(heutigeNotdienste[0]),
              }}
            >
              <b>Notdienst heute:</b> {namen(heutigeNotdienste.map(t => t.kundeName))} —{' '}
              {heutigeNotdienste.length === 1
                ? `Monteur: ${heutigeNotdienste[0].monteurName || 'nicht zugewiesen'}`
                : `${heutigeNotdienste.length} Einsätze offen`}
            </HeroBanner>
          ) : ueberfaellig.length > 0 ? (
            <HeroBanner
              tone="warning"
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: 'Termin öffnen',
                onClick: () => overlay.replace({ type: 'termin', id: ueberfaellig[0].record_id }),
              }}
            >
              <b>{ueberfaellig.length === 1 ? 'Überfälliger Termin' : `${ueberfaellig.length} überfällige Termine`}:</b>{' '}
              {namen(ueberfaellig.slice(0, 3).map(t => t.kundeName))} — bitte nachverfolgen.
            </HeroBanner>
          ) : null
        }
        kpis={
          <StatCardRow>
            <StatCard
              title="Heute"
              value={heute.length}
              description={heute.length === 0 ? 'Keine Termine heute' : `${heuteOffen.length} noch offen`}
              icon={<IconCalendar size={18} className="text-muted-foreground" />}
              tone={heute.length > 0 ? 'primary' : 'default'}
              onClick={() => setFilter(f => f === 'heute' ? 'all' : 'heute')}
              active={filter === 'heute'}
            />
            <StatCard
              title="Diese Woche"
              value={dieseWoche.length}
              description={`${dieseWoche.filter(t => !t.fields.erledigt).length} ausstehend`}
              icon={<IconClock size={18} className="text-muted-foreground" />}
              tone="default"
              onClick={() => setFilter(f => f === 'all' ? 'all' : 'all')}
              active={filter === 'all'}
            />
            <StatCard
              title="Offen gesamt"
              value={offen.length}
              description={ueberfaellig.length > 0 ? `${ueberfaellig.length} überfällig` : 'Alles im Zeitplan'}
              icon={<IconCircleCheck size={18} className="text-muted-foreground" />}
              tone={ueberfaellig.length > 0 ? 'warning' : 'default'}
              onClick={() => setFilter(f => f === 'offen' ? 'all' : 'offen')}
              active={filter === 'offen'}
            />
            <StatCard
              title="Notdienste"
              value={notdienste.length}
              description={notdienste.length === 0 ? 'Keine offenen Notdienste' : 'Sofort prüfen'}
              icon={<IconAlertTriangle size={18} className="text-muted-foreground" />}
              tone={notdienste.length > 0 ? 'destructive' : 'default'}
              onClick={() => setFilter(f => f === 'notdienst' ? 'all' : 'notdienst')}
              active={filter === 'notdienst'}
            />
          </StatCardRow>
        }
        aside={
          <>
            <WorkList
              title="Heute erledigen"
              icon={<IconCalendar size={14} />}
              items={heuteOffen.map(t => ({
                id: t.record_id,
                title: t.kundeName || 'Unbekannter Kunde',
                secondLine: (
                  <>
                    <span className={
                      lookupKey(t.fields.auftragsart) === 'notdienst' ? 'font-medium text-destructive'
                        : lookupKey(t.fields.auftragsart) === 'reparatur' ? 'font-medium text-amber-600'
                        : 'font-medium text-primary'
                    }>
                      {t.fields.auftragsart?.label ?? 'Kein Typ'}
                    </span>
                    {t.monteurName ? <span className="text-muted-foreground"> · {t.monteurName}</span> : null}
                    {t.fields.termin_datum ? <span className="text-muted-foreground"> · {formatDateTime(t.fields.termin_datum).split(',')[1]?.trim()}</span> : null}
                  </>
                ),
                action: {
                  label: '✓ Erledigt',
                  onClick: () => markErledigt(t),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'termin', id })}
              empty={{
                text: morgen.length > 0
                  ? `Heute alles erledigt — morgen: ${namen(morgen.slice(0, 2).map(t => t.kundeName))}`
                  : 'Heute keine offenen Termine.',
                action: { label: '+ Neuer Termin', onClick: () => { setCreateDefaults(undefined); setCreateOpen(true); } },
              }}
            />

            {/* Karte: Heutige Termine */}
            <div className="rounded-[27px] bg-card shadow-lg overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <IconMapPin size={14} />
                  Heutige Termine – Karte
                </h2>
                {mapMarkers.length === 0 && (
                  <span className="text-xs text-muted-foreground">Keine Standorte</span>
                )}
              </div>
              {mapMarkers.length === 0 ? (
                <div className="px-5 pb-5 text-sm text-muted-foreground">
                  Keine Kundenadressen für heute hinterlegt.
                </div>
              ) : (
                <div className="h-64">
                  <MapWidget
                    markers={mapMarkers}
                    onMarkerClick={m => overlay.replace({ type: 'termin', id: markerIdOf(m) })}
                    legend={[
                      { label: 'Wartung', tone: 'primary' },
                      { label: 'Reparatur', tone: 'warning' },
                      { label: 'Notdienst', tone: 'destructive' },
                      { label: 'Erledigt', tone: 'success' },
                    ]}
                  />
                </div>
              )}
            </div>

            {/* Monteur-Übersicht */}
            <div className="rounded-[27px] bg-card p-5 shadow-lg">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                <IconUsers size={14} />
                Monteure – Diese Woche
              </h2>
              {monteurdaten.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Monteure angelegt.</p>
              ) : (
                <div className="space-y-2">
                  {monteurdaten.map(m => {
                    const url = createRecordUrl(APP_IDS.MONTEURDATEN, m.record_id);
                    const anzahl = dieseWoche.filter(t => t.fields.monteur === url).length;
                    const heute_m = heute.filter(t => t.fields.monteur === url).length;
                    return (
                      <div key={m.record_id} className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {(m.fields.monteur_vorname?.[0] ?? '?')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {[m.fields.monteur_vorname, m.fields.monteur_nachname].filter(Boolean).join(' ')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {heute_m > 0
                              ? `Heute: ${heute_m} Termin${heute_m !== 1 ? 'e' : ''}`
                              : 'Heute frei'}
                            {anzahl > 0 ? ` · ${anzahl} diese Woche` : ''}
                          </div>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${anzahl > 3 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                          {anzahl}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        }
        primary={
          <CalendarWidget
            events={events}
            defaultView="week"
            locale={de}
            weekDays={5}
            dayStartHour={7}
            dayEndHour={20}
            dragSnapMinutes={15}
            onEventClick={ev => overlay.replace({ type: 'termin', id: terminIdOf(ev) })}
            onEventDrop={handleEventDrop}
            onEmptyClick={handleEmptyClick}
          />
        }
      />

      {/* Termin erstellen/bearbeiten */}
      <TerminverwaltungDialog
        open={createOpen || editOpen}
        onClose={() => { setCreateOpen(false); setEditOpen(false); setEditRecord(null); setCreateDefaults(undefined); }}
        onSubmit={async fields => {
          if (editRecord) {
            await LivingAppsService.updateTerminverwaltungEntry(editRecord.record_id, fields);
          } else {
            await LivingAppsService.createTerminverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editRecord ? editRecord.fields : createDefaults}
        recordId={editRecord?.record_id}
        kundenverwaltungList={kundenverwaltung}
        monteurdatenList={monteurdaten}
        enablePhotoScan={AI_PHOTO_SCAN['Terminverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Terminverwaltung']}
      />

      {/* Record Overlay */}
      <RecordOverlay
        open={overlay.open && overlay.top?.type === 'termin'}
        onClose={overlay.close}
        onEdit={overlayTermin ? () => { setEditRecord(overlayTermin); setEditOpen(true); } : undefined}
        editLabel="Bearbeiten"
        footer={
          overlayTermin && !overlayTermin.fields.erledigt ? (
            <Button
              size="sm"
              onClick={() => { markErledigt(overlayTermin); overlay.close(); }}
            >
              <IconCircleCheck size={14} className="mr-1.5" />
              Als erledigt markieren
            </Button>
          ) : null
        }
      >
        {overlayTermin && (
          <>
            <RecordHeader
              title={overlayTermin.kundeName || 'Termin'}
              subtitle={overlayTermin.fields.auftragsart?.label}
              badges={
                overlayTermin.fields.erledigt ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    <IconCircleCheck size={12} /> Erledigt
                  </span>
                ) : (
                  <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                    lookupKey(overlayTermin.fields.auftragsart) === 'notdienst' ? 'bg-red-100 text-red-700'
                      : lookupKey(overlayTermin.fields.auftragsart) === 'reparatur' ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    Offen
                  </span>
                )
              }
            />
            <RecordSection title="Termindetails">
              <RecordField label="Datum & Uhrzeit" value={overlayTermin.fields.termin_datum} format="datetime" />
              <RecordField label="Auftragsart" value={overlayTermin.fields.auftragsart?.label} />
              <RecordField label="Monteur" value={overlayTermin.monteurName || '—'} />
              <RecordField label="Kunde" value={overlayTermin.kundeName || '—'} />
              {overlayTermin.fields.beschreibung && (
                <RecordField label="Beschreibung" value={overlayTermin.fields.beschreibung} format="longtext" />
              )}
            </RecordSection>
            {/* Kundenadresse + Navigation */}
            {(() => {
              const kundeId = extractRecordId(overlayTermin.fields.kunde);
              const kunde = kundeId ? kundenverwaltungMap.get(kundeId) : null;
              if (!kunde) return null;
              const adresse = [
                [kunde.fields.strasse, kunde.fields.hausnummer].filter(Boolean).join(' '),
                [kunde.fields.plz, kunde.fields.ort].filter(Boolean).join(' '),
              ].filter(Boolean).join(', ');
              return (
                <RecordSection title="Kundenadresse">
                  {adresse && <RecordField label="Adresse" value={adresse} />}
                  {kunde.fields.telefon && <RecordField label="Telefon" value={kunde.fields.telefon} format="text" />}
                  {kunde.fields.standort && (
                    <div className="mt-2">
                      <MapRouteLinks lat={kunde.fields.standort.lat} long={kunde.fields.standort.long} />
                    </div>
                  )}
                </RecordSection>
              );
            })()}
            <RecordAttachments appId={APP_IDS.TERMINVERWALTUNG} recordId={overlayTermin.record_id} />
          </>
        )}
      </RecordOverlay>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) { setRepairing(false); setRepairFailed(true); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          if (content.startsWith('[DONE]')) { setRepairDone(true); setRepairing(false); }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) setRepairFailed(true);
        }
      }
    } catch { setRepairing(false); setRepairFailed(true); }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen.</p>}
    </div>
  );
}
