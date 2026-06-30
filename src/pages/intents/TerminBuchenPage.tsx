import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Monteurdaten } from '@/types/app';
import { Button } from '@/components/ui/button';
import {
  IconUser,
  IconTool,
  IconCalendar,
  IconCheck,
  IconPhone,
  IconMapPin,
  IconNotes,
  IconArrowLeft,
  IconArrowRight,
  IconPlus,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Kunde' },
  { label: 'Monteur' },
  { label: 'Details' },
  { label: 'Fertig' },
];

function formatDateTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

export default function TerminBuchenPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // --- ALL HOOKS BEFORE ANY EARLY RETURNS ---
  const [currentStep, setCurrentStep] = useState<number>(() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    return s >= 1 && s <= 4 ? s : 1;
  });

  const [kunden, setKunden] = useState<Kundenverwaltung[]>([]);
  const [monteure, setMonteure] = useState<Monteurdaten[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<Error | null>(null);

  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);
  const [selectedMonteur, setSelectedMonteur] = useState<Monteurdaten | null>(null);

  // Step 3 form state
  const [terminDatum, setTerminDatum] = useState('');
  const [auftragsart, setAuftragsart] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [erledigt, setErledigt] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Lookup options for Auftragsart
  const auftragsartOptions = LOOKUP_OPTIONS['terminverwaltung']?.['auftragsart'] ?? [];

  // Load data on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      setFetchError(null);
      try {
        const [k, m] = await Promise.all([
          LivingAppsService.getKundenverwaltung(),
          LivingAppsService.getMonteurdaten(),
        ]);
        if (!cancelled) {
          setKunden(k);
          setMonteure(m);
        }
      } catch (e) {
        if (!cancelled) {
          setFetchError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // Handle ?customerId deep-link: auto-select kunde and skip to step 2
  useEffect(() => {
    if (loading) return;
    const customerId = searchParams.get('customerId');
    if (customerId && !selectedKunde) {
      const found = kunden.find(k => k.record_id === customerId);
      if (found) {
        setSelectedKunde(found);
        handleStepChange(2);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, kunden]);

  function handleStepChange(step: number) {
    setCurrentStep(step);
    const params = new URLSearchParams(searchParams);
    if (step > 1) {
      params.set('step', String(step));
    } else {
      params.delete('step');
    }
    setSearchParams(params, { replace: true });
  }

  function handleKundeSelect(id: string) {
    const found = kunden.find(k => k.record_id === id) ?? null;
    setSelectedKunde(found);
    handleStepChange(2);
  }

  function handleMonteurSelect(id: string) {
    const found = monteure.find(m => m.record_id === id) ?? null;
    setSelectedMonteur(found);
    handleStepChange(3);
  }

  async function handleSave() {
    if (!selectedKunde || !selectedMonteur) return;
    if (!terminDatum) {
      setSaveError('Bitte Datum und Uhrzeit angeben.');
      return;
    }
    if (!auftragsart) {
      setSaveError('Bitte eine Auftragsart auswählen.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await LivingAppsService.createTerminverwaltungEntry({
        termin_datum: terminDatum.slice(0, 16),
        auftragsart: auftragsart,
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        monteur: createRecordUrl(APP_IDS.MONTEURDATEN, selectedMonteur.record_id),
        beschreibung: beschreibung || undefined,
        erledigt: erledigt,
      });
      handleStepChange(4);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSelectedKunde(null);
    setSelectedMonteur(null);
    setTerminDatum('');
    setAuftragsart('');
    setBeschreibung('');
    setErledigt(false);
    setSaveError(null);
    handleStepChange(1);
  }

  return (
    <IntentWizardShell
      title="Termin buchen"
      subtitle="Neuen Montage-Termin in 3 Schritten anlegen"
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={handleStepChange}
      loading={loading}
      error={fetchError}
      onRetry={() => window.location.reload()}
    >
      {/* ─── SCHRITT 1: Kunde auswählen ─── */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Kunde auswählen</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Wähle den Kunden aus, für den der Termin gebucht werden soll.
            </p>
          </div>
          <EntitySelectStep
            items={kunden.map(k => ({
              id: k.record_id,
              title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)',
              subtitle: [k.fields.ort, k.fields.telefon].filter(Boolean).join(' · '),
              icon: <IconUser size={18} className="text-primary" />,
            }))}
            onSelect={handleKundeSelect}
            searchPlaceholder="Kunde suchen..."
            emptyIcon={<IconUser size={32} />}
            emptyText="Kein Kunde gefunden."
          />
        </div>
      )}

      {/* ─── SCHRITT 2: Monteur auswählen ─── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Monteur auswählen</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Weise dem Termin einen Monteur zu.
              </p>
            </div>
            {selectedKunde && (
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-1.5 text-sm min-w-0">
                <IconUser size={14} className="text-primary shrink-0" />
                <span className="font-medium truncate">
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
              </div>
            )}
          </div>
          <EntitySelectStep
            items={monteure.map(m => ({
              id: m.record_id,
              title: [m.fields.monteur_vorname, m.fields.monteur_nachname].filter(Boolean).join(' ') || '(Kein Name)',
              subtitle: [m.fields.monteur_telefon, m.fields.monteur_notiz].filter(Boolean).join(' · '),
              icon: <IconTool size={18} className="text-primary" />,
            }))}
            onSelect={handleMonteurSelect}
            searchPlaceholder="Monteur suchen..."
            emptyIcon={<IconTool size={32} />}
            emptyText="Kein Monteur gefunden."
          />
          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={() => handleStepChange(1)} className="gap-1.5">
              <IconArrowLeft size={15} />
              Zurück
            </Button>
          </div>
        </div>
      )}

      {/* ─── SCHRITT 3: Termin-Details ─── */}
      {currentStep === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Termin-Details</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Lege Datum, Uhrzeit und Art des Auftrags fest.
            </p>
          </div>

          {/* Ausgewählter Kunde & Monteur */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selectedKunde && (
              <div className="rounded-xl border bg-card p-4 overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <IconUser size={16} className="text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kunde</span>
                </div>
                <p className="font-semibold text-sm truncate">
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ') || '—'}
                </p>
                {selectedKunde.fields.telefon && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 truncate">
                    <IconPhone size={12} className="shrink-0" />
                    {selectedKunde.fields.telefon}
                  </p>
                )}
                {selectedKunde.fields.ort && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                    <IconMapPin size={12} className="shrink-0" />
                    {[selectedKunde.fields.strasse, selectedKunde.fields.hausnummer, selectedKunde.fields.ort]
                      .filter(Boolean).join(' ')}
                  </p>
                )}
              </div>
            )}
            {selectedMonteur && (
              <div className="rounded-xl border bg-card p-4 overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <IconTool size={16} className="text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Monteur</span>
                </div>
                <p className="font-semibold text-sm truncate">
                  {[selectedMonteur.fields.monteur_vorname, selectedMonteur.fields.monteur_nachname].filter(Boolean).join(' ') || '—'}
                </p>
                {selectedMonteur.fields.monteur_telefon && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 truncate">
                    <IconPhone size={12} className="shrink-0" />
                    {selectedMonteur.fields.monteur_telefon}
                  </p>
                )}
                {selectedMonteur.fields.monteur_notiz && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                    <IconNotes size={12} className="shrink-0" />
                    {selectedMonteur.fields.monteur_notiz}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Formular */}
          <div className="rounded-xl border bg-card p-4 space-y-4 overflow-hidden">
            {/* Datum & Uhrzeit */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <IconCalendar size={14} className="text-muted-foreground" />
                Datum &amp; Uhrzeit
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                type="datetime-local"
                value={terminDatum}
                onChange={e => setTerminDatum(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            {/* Auftragsart Tiles */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Auftragsart
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {auftragsartOptions.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setAuftragsart(opt.key)}
                    className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all text-center ${
                      auftragsart === opt.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Beschreibung */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <IconNotes size={14} className="text-muted-foreground" />
                Beschreibung
              </label>
              <textarea
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder="Optionale Hinweise zum Auftrag..."
                rows={3}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
              />
            </div>

            {/* Erledigt */}
            <div className="flex items-center gap-2">
              <input
                id="erledigt-check"
                type="checkbox"
                checked={erledigt}
                onChange={e => setErledigt(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
              />
              <label htmlFor="erledigt-check" className="text-sm font-medium text-foreground cursor-pointer select-none">
                Als erledigt markieren
              </label>
            </div>
          </div>

          {/* Fehler */}
          {saveError && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {saveError}
            </div>
          )}

          {/* Aktionen */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <Button variant="ghost" size="sm" onClick={() => handleStepChange(2)} className="gap-1.5" disabled={saving}>
              <IconArrowLeft size={15} />
              Zurück
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? (
                'Wird gespeichert...'
              ) : (
                <>
                  <IconCheck size={15} />
                  Termin speichern
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── SCHRITT 4: Bestätigung ─── */}
      {currentStep === 4 && (
        <div className="space-y-5">
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <IconCheck size={28} className="text-primary" stroke={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Termin gespeichert!</h2>
              <p className="text-sm text-muted-foreground mt-1">Der Termin wurde erfolgreich angelegt.</p>
            </div>
          </div>

          {/* Zusammenfassung */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-secondary/50">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Zusammenfassung</span>
            </div>
            <div className="divide-y">
              {selectedKunde && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <IconUser size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Kunde</p>
                    <p className="text-sm font-medium truncate">
                      {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ') || '—'}
                    </p>
                    {selectedKunde.fields.telefon && (
                      <p className="text-xs text-muted-foreground truncate">{selectedKunde.fields.telefon}</p>
                    )}
                  </div>
                </div>
              )}
              {selectedMonteur && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <IconTool size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Monteur</p>
                    <p className="text-sm font-medium truncate">
                      {[selectedMonteur.fields.monteur_vorname, selectedMonteur.fields.monteur_nachname].filter(Boolean).join(' ') || '—'}
                    </p>
                  </div>
                </div>
              )}
              {terminDatum && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <IconCalendar size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Datum &amp; Uhrzeit</p>
                    <p className="text-sm font-medium">{formatDateTime(terminDatum)}</p>
                  </div>
                </div>
              )}
              {auftragsart && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <IconTool size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Auftragsart</p>
                    <p className="text-sm font-medium">
                      {auftragsartOptions.find(o => o.key === auftragsart)?.label ?? auftragsart}
                    </p>
                  </div>
                </div>
              )}
              {beschreibung && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <IconNotes size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Beschreibung</p>
                    <p className="text-sm">{beschreibung}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 px-4 py-3">
                <IconCheck size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-sm font-medium">{erledigt ? 'Erledigt' : 'Offen'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Aktionen */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <Button onClick={handleReset} className="gap-1.5 flex-1 sm:flex-none">
              <IconPlus size={15} />
              Neuen Termin buchen
            </Button>
            <a href="#/" className="flex-1 sm:flex-none">
              <Button variant="outline" className="w-full gap-1.5">
                <IconArrowRight size={15} />
                Zurück zum Dashboard
              </Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
