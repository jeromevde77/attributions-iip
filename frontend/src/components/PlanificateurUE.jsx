import { useEffect, useMemo, useRef, useState } from 'react';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Planificateur — vue ligne du temps des organisations d'UE.
 *
 * Chaque bloc EST une organisation : le déplacer ou l'étirer modifie
 * date_debut / date_fin via le même mécanisme `editer()` que le tableau.
 * Deux vues, une seule donnée, un seul bouton Enregistrer.
 *
 * Les jalons affichés proviennent de l'API métier (jours ouvrables, congés
 * scolaires) et reflètent les dates ENREGISTRÉES : aucun calcul de délai n'est
 * dupliqué côté client, pour qu'il n'existe qu'une seule vérité.
 */

const MS_JOUR = 86400000;

// Numéro de semaine ISO 8601 : la semaine 1 est celle qui contient le premier
// jeudi de l'année — c'est la convention des horaires scolaires.
function numeroSemaine(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7 + 1));
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - jan1) / MS_JOUR) + 1) / 7);
}

export default function PlanificateurUE({ items, annee, val, editer, modifs }) {
  const [selection, setSelection] = useState(null);   // id de l'organisation
  const [jalons, setJalons] = useState(null);
  const pisteRef = useRef(null);

  // Bornes de l'année académique : du 1er septembre au 10 juillet
  const { debut, totalJours, moisSegments, elargie } = useMemo(() => {
    const a1 = Number(String(annee || '').slice(0, 4)) || new Date().getFullYear();
    let debut = new Date(Date.UTC(a1, 8, 1));              // 1er septembre
    let fin = new Date(Date.UTC(a1 + 1, 6, 10));           // 10 juillet

    // Une date hors de cette fenêtre était rabattue sur le bord : les deux
    // extrémités se confondaient et le rectangle disparaissait sans rien dire.
    // On élargit donc la fenêtre à ce que portent réellement les données.
    let elargie = false;
    for (const it of (items || [])) {
      if (it.type !== 'ligne') continue;
      for (const champ of ['date_debut', 'date_fin']) {
        const v = val(it.l, champ);
        if (!v) continue;
        const d = new Date(v + 'T00:00:00Z');
        if (isNaN(d)) continue;
        if (d < debut) { debut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); elargie = true; }
        if (d > fin)   { fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); elargie = true; }
      }
    }
    const totalJours = Math.round((fin - debut) / MS_JOUR);
    const NOMS = ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août',
                  'Sept', 'Oct', 'Nov', 'Déc'];
    const moisSegments = [];
    let curseur = new Date(debut);
    while (curseur < fin) {
      const prochain = new Date(Date.UTC(curseur.getUTCFullYear(), curseur.getUTCMonth() + 1, 1));
      const borne = prochain > fin ? fin : prochain;
      const jours = Math.round((borne - curseur) / MS_JOUR);
      if (jours > 0) moisSegments.push({ nom: NOMS[curseur.getUTCMonth()], jours });
      curseur = prochain;
    }
    return { debut, totalJours, moisSegments, elargie };
  }, [annee, items, val]);

  const versJours = iso => {
    if (!iso) return null;
    const j = Math.round((new Date(iso + 'T00:00:00Z') - debut) / MS_JOUR);
    return Math.max(0, Math.min(totalJours, j));
  };
  const versISO = jours => {
    const d = new Date(debut.getTime() + Math.round(jours) * MS_JOUR);
    return d.toISOString().slice(0, 10);
  };
  const frDate = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

  // Congés et fermetures, tirés des événements d'établissement : les placer sur
  // la ligne du temps évite de faire démarrer une UE pendant les vacances.
  const [conges, setConges] = useState([]);
  useEffect(() => {
    if (!annee) return;
    let vivant = true;
    fetch(`/api/rentree/evenements?annee=${annee}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(l => {
        if (!vivant || !Array.isArray(l)) return;
        setConges(l.filter(e => /cong|vacance|fermet|férié|ferie/i.test(
          `${e.type || ''} ${e.titre || ''}`)));
      })
      .catch(() => {});
    return () => { vivant = false; };
  }, [annee]);

  // Semaines : bornes du lundi, et numéro ISO
  const semaines = useMemo(() => {
    const out = [];
    const d = new Date(debut);
    // Reculer jusqu'au lundi qui précède ou coïncide
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    while ((d - debut) / MS_JOUR < totalJours) {
      const offset = Math.round((d - debut) / MS_JOUR);
      out.push({ offset, numero: numeroSemaine(d) });
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
  }, [debut, totalJours]);

  // Jalons de l'organisation sélectionnée (dates enregistrées, logique serveur)
  useEffect(() => {
    setJalons(null);
    if (!selection) return;
    let vivant = true;
    fetch(`/api/annuel/dates-ue/${selection}/jalons`, { headers: authHeaders() })
      .then(r => r.json())
      .then(j => { if (vivant) setJalons(Array.isArray(j.jalons) ? j.jalons : []); })
      .catch(() => { if (vivant) setJalons([]); });
    return () => { vivant = false; };
  }, [selection]);

  // ── Glisser / étirer ──────────────────────────────────────────────────────
  function demarrer(ev, l, mode) {
    ev.preventDefault();
    const piste = ev.currentTarget.closest('[data-piste]');
    const largeur = piste.getBoundingClientRect().width;
    const x0 = ev.clientX;
    const d0 = versJours(val(l, 'date_debut'));
    const f0 = versJours(val(l, 'date_fin'));
    if (d0 == null || f0 == null) return;
    setSelection(l.id);

    const cible = ev.currentTarget;
    cible.setPointerCapture(ev.pointerId);
    let dernierDelta = 0;

    const bouger = e => {
      const delta = Math.round((e.clientX - x0) / largeur * totalJours);
      if (delta === dernierDelta) return;
      dernierDelta = delta;
      if (mode === 'deplacer') {
        const duree = f0 - d0;
        const nd = Math.max(0, Math.min(totalJours - duree, d0 + delta));
        editer(l.id, 'date_debut', versISO(nd));
        editer(l.id, 'date_fin', versISO(nd + duree));
      } else {
        const nf = Math.max(d0 + 7, Math.min(totalJours, f0 + delta));
        editer(l.id, 'date_fin', versISO(nf));
      }
    };
    const lacher = () => {
      cible.removeEventListener('pointermove', bouger);
      cible.removeEventListener('pointerup', lacher);
    };
    cible.addEventListener('pointermove', bouger);
    cible.addEventListener('pointerup', lacher);
  }

  function placer(l) {
    // Première pose : 18 semaines à partir de la 2e semaine de septembre
    editer(l.id, 'date_debut', versISO(7));
    editer(l.id, 'date_fin', versISO(7 + 18 * 7));
    setSelection(l.id);
  }

  const lignesSeules = items.filter(i => i.type === 'ligne').map(i => i.l);
  const selectionnee = lignesSeules.find(l => l.id === selection);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white" ref={pisteRef}>
        <div style={{ minWidth: 860 }}>
          {/* En-tête des mois, à l'échelle réelle des jours */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div className="w-[210px] flex-none border-r border-slate-200" />
            {moisSegments.map((m, i) => (
              <div key={i}
                style={{ width: `${m.jours / totalJours * 100}%` }}
                className="text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center py-1.5 border-l border-slate-100 first:border-l-0">
                {m.nom}
              </div>
            ))}
          </div>

          {/* Numéros de semaine, sous les mois */}
          <div className="flex border-b border-slate-200 bg-white relative" style={{ height: 16 }}>
            <div className="w-[210px] flex-none border-r border-slate-200" />
            <div className="flex-1 relative">
              {semaines.map((s, i) => (
                <span key={i}
                  style={{ left: `${s.offset / totalJours * 100}%` }}
                  className="absolute top-0 text-[8.5px] text-slate-400 border-l border-slate-100 pl-0.5 h-4 leading-4">
                  {s.numero}
                </span>
              ))}
            </div>
          </div>

          {elargie && (
            <div className="px-3 py-1 bg-amber-50 border-b border-amber-200 text-[10.5px] text-amber-800">
              Des dates sortent de l'année académique : la ligne du temps a été élargie pour les
              montrer. Vérifiez qu'il ne s'agit pas d'une erreur de saisie.
            </div>
          )}

          {items.map((item, idx) => {
            if (item.type === 'groupe') {
              return (
                <div key={`g-${idx}`} className="px-3 py-1 bg-slate-50/80 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                  {item.libelle}
                </div>
              );
            }
            const l = item.l;
            const d = versJours(val(l, 'date_debut'));
            const f = versJours(val(l, 'date_fin'));
            const pose = d != null && f != null && f > d;
            const incoherente = d != null && f != null && f <= d;
            const modifiee = !!modifs[l.id];
            const active = selection === l.id;

            return (
              <div key={l.id} className="flex border-b border-slate-100 last:border-0 h-11">
                <div className="w-[210px] flex-none border-r border-slate-200 px-3 flex flex-col justify-center min-w-0">
                  <span className="text-[12px] font-semibold text-iip-blue truncate">
                    UE {l.ue_num}{l.num_organisation > 1 ? ` · org. ${l.num_organisation}` : ''}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">{l.ue_nom || l.section}</span>
                </div>
                <div className="relative flex-1" data-piste
                  style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent calc(100%/43 - 1px), #F5F7FA calc(100%/43 - 1px), #F5F7FA calc(100%/43))' }}>
                  {/* Congés en arrière-plan : une UE ne devrait pas démarrer là. */}
                  {conges.map((ev, k) => {
                    const cd = versJours(ev.date_debut);
                    const cf = versJours(ev.date_fin || ev.date_debut);
                    if (cd == null || cf == null || cf <= cd) return null;
                    return (
                      <div key={`c-${k}`} title={ev.titre || 'Congé'}
                        style={{ left: `${cd / totalJours * 100}%`,
                                 width: `${(cf - cd) / totalJours * 100}%` }}
                        className="absolute inset-y-0 bg-slate-300/35 pointer-events-none" />
                    );
                  })}
                  {pose ? (
                    <div
                      onPointerDown={e => e.target.dataset.poignee ? demarrer(e, l, 'etirer') : demarrer(e, l, 'deplacer')}
                      onClick={() => setSelection(l.id)}
                      title={`${frDate(val(l, 'date_debut'))} → ${frDate(val(l, 'date_fin'))}`}
                      className={`absolute top-1.5 h-8 rounded-lg text-white text-[10.5px] font-semibold
                        flex items-center px-2 cursor-grab active:cursor-grabbing select-none whitespace-nowrap overflow-hidden
                        ${incoherente ? 'bg-red-600' : active ? 'bg-iip-turquoise shadow-md' : 'bg-iip-blue'}
                        ${modifiee ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                      style={{ left: `${d / totalJours * 100}%`, width: `${Math.max(2, (f - d) / totalJours * 100)}%` }}>
                      {Math.max(1, Math.round((f - d) / 7))} sem.
                      <span data-poignee="1"
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize rounded-r-lg bg-white/20" />
                    </div>
                  ) : (
                    <button onClick={() => placer(l)}
                      className="absolute top-1.5 left-2 h-8 px-2.5 rounded-lg border border-dashed border-slate-300 text-[11px] text-slate-400 flex items-center gap-1 hover:border-iip-turquoise hover:text-iip-turquoise">
                      <IconPlus size={12} /> Placer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!lignesSeules.length && (
            <div className="py-10 text-center text-sm text-slate-400">Aucune organisation à afficher.</div>
          )}
        </div>
      </div>

      {/* Jalons de l'organisation sélectionnée */}
      {selectionnee && (
        <div className="border border-slate-200 rounded-xl bg-white px-4 py-3">
          <div className="text-[12.5px] font-semibold text-iip-blue mb-1.5">
            Jalons — UE {selectionnee.ue_num}
            {selectionnee.num_organisation > 1 ? ` · organisation ${selectionnee.num_organisation}` : ''}
            <span className="font-normal text-slate-500">
              {' '}({frDate(val(selectionnee, 'date_debut'))} → {frDate(val(selectionnee, 'date_fin'))})
            </span>
          </div>
          {modifs[selectionnee.id] ? (
            <p className="text-[12px] text-amber-700 flex items-center gap-1.5">
              <IconInfoCircle size={14} />
              Dates modifiées, non enregistrées — les jalons seront recalculés à l'enregistrement.
            </p>
          ) : jalons === null ? (
            <p className="text-[12px] text-slate-400">Chargement des jalons…</p>
          ) : jalons.length ? (
            <div className="divide-y divide-slate-100">
              {jalons.map((j, i) => (
                <div key={i} className="flex gap-3 py-1 text-[12.5px]">
                  <span className="font-bold text-iip-blue w-[86px] flex-none">{frDate(j.date_due)}</span>
                  <span className="text-slate-700">{j.libelle}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-slate-400">
              Aucun jalon pour ces dates (dates non enregistrées, ou échéances non instanciées).
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Glissez un bloc pour le déplacer, tirez son bord droit pour l'étirer (au jour
        près). Le contour ambre signale une modification non enregistrée — le bouton
        Enregistrer est commun aux deux vues.
      </p>
    </div>
  );
}
