import { useMemo, useState } from 'react';
import { IconAdjustmentsHorizontal, IconCalendar, IconClock } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { demander } from '../lib/dialogue.jsx';
import { Fenetre, BoutonFenetre } from './ui.jsx';

/* AJUSTER AU DÉTAIL (24 novembre 2026, Charles : « un bouton "Ajuster au détail" qui ouvrirait une jauge à curseur pour
   adapter le réel de l'année 26/27 vers 26 ou vers 27 » ; tranché : un curseur par cours, plus un curseur général qui
   déplace tous les cours d'un coup ; les DATES de l'UE restent la proposition, l'horaire n'est qu'un repère).

   Le curseur déplace des périodes d'une année civile à l'autre ; le total de chaque ligne ne bouge pas (le serveur le
   refuse sinon). Le prévu (colonnes 16-17) suit la même part tant que la case est cochée. La ligne enregistrée porte
   « Ajusté au détail par … le … » : elle garde ses chiffres même quand les dates tranchent. */

const fr = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const pc = p => `${Math.round(p * 100)} %`;
const cleLigne = l => `${l.cours_code || ''}|${l.nature}`;

function Jauge({ valeur, total, onChange, reperes = [], desactive = false, etiquette }) {
  const part = total > 0 ? valeur / total : 0;
  return (
    <div className="relative h-6">
      {/* La barre : la part de la première année civile à gauche, celle de la seconde à droite. */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden flex pointer-events-none">
        <div style={{ width: `${part * 100}%`, background: 'var(--c-principal)' }} />
        <div style={{ width: `${(1 - part) * 100}%`, background: 'var(--c-accent)', opacity: 0.55 }} />
      </div>
      {reperes.filter(r => r.part != null).map(r => (
        <div key={r.nom} title={r.titre}
          className="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2 z-10"
          style={{ left: `${r.part * 100}%` }}>
          <div className="w-0.5 h-full rounded-full"
            style={{ background: r.nom === 'horaire' ? 'var(--c-texte, currentColor)' : 'var(--c-attente)' }} />
        </div>
      ))}
      <input type="range" min={0} max={Math.max(0, total)} step={1} value={valeur} disabled={desactive || total <= 0}
        aria-label={etiquette}
        onChange={e => onChange(Number(e.target.value))}
        className="jauge-curseur absolute inset-0 z-20" />
    </div>
  );
}

export default function AjusterRepartition({ u, annee, anneesCiviles, onFermer, onEnregistre }) {
  const [a1, a2] = anneesCiviles || [];
  // Les lignes telles que l'écran les montre : leur total ne change pas.
  const lignes = useMemo(() => u.lignes.map(l => ({
    ...l,
    tReel: Math.round(Number(l.reel_c1 || 0) + Number(l.reel_c2 || 0)),
    tPrevu: Math.round(Number(l.prevu_c1 || 0) + Number(l.prevu_c2 || 0)),
  })), [u]);
  const [valeurs, setValeurs] = useState(() => Object.fromEntries(lignes.map(l =>
    [cleLigne(l), { reel_c1: Math.round(Number(l.reel_c1 || 0)), prevu_c1: Math.round(Number(l.prevu_c1 || 0)) }])));
  const [prevuSuit, setPrevuSuit] = useState(true);
  const [general, setGeneral] = useState(() => {
    const t = lignes.reduce((s, l) => s + l.tReel, 0);
    const c1 = lignes.reduce((s, l) => s + Math.round(Number(l.reel_c1 || 0)), 0);
    return t > 0 ? Math.round((c1 / t) * 100) : 50;
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const poser = (l, reelC1) => setValeurs(v => {
    const r = Math.max(0, Math.min(l.tReel, Math.round(reelC1)));
    const prevu = prevuSuit && l.tReel > 0 ? Math.round(l.tPrevu * (r / l.tReel)) : v[cleLigne(l)].prevu_c1;
    return { ...v, [cleLigne(l)]: { reel_c1: r, prevu_c1: prevu } };
  });
  const poserPart = (l, part) => { if (part != null) poser(l, l.tReel * part); };
  const toutesALaPart = (partDe) => { for (const l of lignes) poserPart(l, partDe(l)); };

  const aHoraire = lignes.some(l => l.horaire);
  const horaireToutUe = lignes.some(l => l.horaire?.toute_ue);

  const changees = lignes.filter(l => {
    const v = valeurs[cleLigne(l)];
    return v.reel_c1 !== Math.round(Number(l.reel_c1 || 0)) || v.prevu_c1 !== Math.round(Number(l.prevu_c1 || 0));
  });
  const totaux = lignes.reduce((s, l) => {
    const v = valeurs[cleLigne(l)];
    s.r1 += v.reel_c1; s.r2 += l.tReel - v.reel_c1;
    s.p1 += v.prevu_c1; s.p2 += l.tPrevu - v.prevu_c1;
    return s;
  }, { r1: 0, r2: 0, p1: 0, p2: 0 });

  async function enregistrer() {
    if (!changees.length) return;
    const ok = await demander({
      titre: 'Enregistrer l’ajustement',
      message: `${changees.length} ligne(s) de l’UE ${u.ue_num}${u.num_organisation > 1 ? ` · org. ${u.num_organisation}` : ''} `
        + `changent de répartition entre ${a1} et ${a2}. Les totaux ne bougent pas.\n\n`
        + 'Chaque ligne portera la mention « Ajusté au détail » à votre nom : elle gardera ses chiffres même si les dates de l’UE '
        + 'les placent sur une seule année civile.',
      confirmer: 'Enregistrer',
    });
    if (!ok) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/repartition/ajuster', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, ue_num: u.ue_num, num_organisation: u.num_organisation || 1,
          lignes: changees.map(l => {
            const v = valeurs[cleLigne(l)];
            return {
              cours_code: l.cours_code || null, nature: l.nature,
              reel_c1: v.reel_c1, reel_c2: l.tReel - v.reel_c1,
              prevu_c1: v.prevu_c1, prevu_c2: l.tPrevu - v.prevu_c1,
            };
          }),
        }),
      });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) { setErreur(j.error || 'Enregistrement refusé.'); return; }
      onEnregistre?.(j);
    } finally { setEnCours(false); }
  }

  return (
    <Fenetre icone={IconAdjustmentsHorizontal} large="grande" onFermer={onFermer}
      titre={`Ajuster au détail — UE ${u.ue_num}${u.num_organisation > 1 ? ` · org. ${u.num_organisation}` : ''}`}
      sous={`${u.ue_nom || ''} · du ${fr(u.date_debut)} au ${fr(u.date_fin)}`}
      pied={
        <div className="flex items-center gap-3 w-full">
          <div className="min-w-0 text-second text-slate-600">
            {erreur
              ? <span style={{ color: 'var(--c-refuse)' }}>{erreur}</span>
              : <>Réel : <b>{totaux.r1}</b> en {a1} · <b>{totaux.r2}</b> en {a2}
                  <span className="text-slate-400"> — prévu : {totaux.p1} · {totaux.p2}</span>
                  {!changees.length && <span className="text-slate-400"> · rien n’a changé</span>}</>}
          </div>
          <div className="ml-auto flex gap-2">
            <BoutonFenetre onClick={onFermer}>Fermer</BoutonFenetre>
            <BoutonFenetre principal desactive={!changees.length || enCours} onClick={enregistrer}>
              {enCours ? 'Enregistrement…' : changees.length ? `Enregistrer (${changees.length})` : 'Enregistrer'}
            </BoutonFenetre>
          </div>
        </div>
      }>
      <div className="space-y-4">
        <div className="text-second text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
          <span><IconCalendar size={13} className="inline -mt-0.5 mr-1" />
            Dates de l’organisation : {u.part_dates != null ? `${pc(u.part_dates)} en ${a1}` : 'non posées'}</span>
          <span><IconClock size={13} className="inline -mt-0.5 mr-1" />
            Horaire : {aHoraire ? (horaireToutUe ? 'séances de toute l’UE (l’horaire ne dit pas l’organisation)' : 'séances de l’organisation')
              : 'aucune séance'}</span>
        </div>

        {/* LE CURSEUR GÉNÉRAL : il place tous les cours à la même part. */}
        <section className="pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <span className="intertitre mb-0">Tous les cours</span>
            <span className="text-second text-slate-500">{general} % en {a1} · {100 - general} % en {a2}</span>
            <span className="ml-auto flex gap-1.5">
              {u.part_dates != null && (
                <button className="bouton text-second" onClick={() => { toutesALaPart(() => u.part_dates); setGeneral(Math.round(u.part_dates * 100)); }}>
                  Tout selon les dates
                </button>
              )}
              {aHoraire && (
                <button className="bouton text-second" onClick={() => toutesALaPart(l => l.horaire?.part_c1 ?? null)}
                  title="Les lignes sans séance à l’horaire gardent leur répartition">
                  Tout selon l’horaire
                </button>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-second text-slate-500 w-24 text-right">tout vers {a1}</span>
            <div className="flex-1">
              <Jauge valeur={general} total={100} etiquette="Tous les cours"
                reperes={u.part_dates != null ? [{ nom: 'dates', part: u.part_dates, titre: `dates : ${pc(u.part_dates)} en ${a1}` }] : []}
                onChange={p => { setGeneral(p); toutesALaPart(() => p / 100); }} />
            </div>
            <span className="text-second text-slate-500 w-24">tout vers {a2}</span>
          </div>
          <label className="mt-2 flex items-center gap-2 text-second text-slate-600">
            <input type="checkbox" checked={prevuSuit} onChange={e => setPrevuSuit(e.target.checked)} />
            Le prévu (colonnes 16-17) suit le réel ; décoché, il reste tel quel
          </label>
        </section>

        {/* UNE JAUGE PAR COURS, et l'autonomie. */}
        <div className="space-y-3">
          {lignes.map(l => {
            const v = valeurs[cleLigne(l)];
            const h = l.horaire;
            const reperes = [
              u.part_dates != null && { nom: 'dates', part: u.part_dates, titre: `dates : ${pc(u.part_dates)} en ${a1}` },
              h && { nom: 'horaire', part: h.part_c1,
                titre: `horaire : ${pc(h.part_c1)} en ${a1}${h.toute_ue ? ' (toute l’UE)' : ''}${h.tous_cours ? ' (tous les cours de l’UE)' : ''}` },
            ].filter(Boolean);
            const change = changees.includes(l);
            return (
              <div key={cleLigne(l)} className="grid grid-cols-[minmax(0,15rem)_3.5rem_1fr_3.5rem] items-center gap-x-3 gap-y-0.5">
                <div className="min-w-0 text-second text-slate-700 truncate" title={l.libelle || ''}>
                  {l.nature === 'autonomie'
                    ? <i>Autonomie</i>
                    : <><b className="text-slate-500">{l.cours_code}</b> {l.libelle}</>}
                  <div className="text-mention text-slate-400">
                    réel {l.tReel} · prévu {l.tPrevu}{change && <span style={{ color: 'var(--c-attente)' }}> · modifié</span>}
                  </div>
                </div>
                <div className="text-right text-second font-semibold" style={{ color: 'var(--c-principal)' }}
                  title={`${a1} — prévu ${v.prevu_c1}`}>
                  {v.reel_c1}<div className="text-mention font-normal text-slate-400">{a1}</div>
                </div>
                <div>
                  <Jauge valeur={v.reel_c1} total={l.tReel} reperes={reperes} etiquette={`${l.cours_code || 'Autonomie'} : périodes en ${a1}`}
                    onChange={x => poser(l, x)} />
                  <div className="flex gap-2 text-mention text-slate-500 mt-0.5">
                    {u.part_dates != null && (
                      <button className="underline decoration-dotted hover:text-slate-800" onClick={() => poserPart(l, u.part_dates)}>
                        selon les dates ({pc(u.part_dates)})
                      </button>
                    )}
                    {h && (
                      <button className="underline decoration-dotted hover:text-slate-800" onClick={() => poserPart(l, h.part_c1)}
                        title={`${Math.round(h.c1_min / 50)} p. de 50 min en ${a1}, ${Math.round(h.c2_min / 50)} en ${a2}`}>
                        selon l’horaire ({pc(h.part_c1)}{h.toute_ue || h.tous_cours ? ', toute l’UE' : ''})
                      </button>
                    )}
                    {!h && <span className="text-slate-400">aucune séance à l’horaire</span>}
                  </div>
                </div>
                <div className="text-second font-semibold" style={{ color: 'var(--c-accent)' }}
                  title={`${a2} — prévu ${l.tPrevu - v.prevu_c1}`}>
                  {l.tReel - v.reel_c1}<div className="text-mention font-normal text-slate-400">{a2}</div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-mention text-slate-500 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-0.5 h-3" style={{ background: 'var(--c-attente)' }} /> repère des dates</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-0.5 h-3" style={{ background: 'var(--c-texte, currentColor)' }} /> repère de l’horaire</span>
          <span>Le curseur déplace des périodes d’une année civile à l’autre ; le total de chaque ligne ne change pas.</span>
        </p>
      </div>
    </Fenetre>
  );
}
