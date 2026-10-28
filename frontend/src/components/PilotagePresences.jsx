/**
 * LES PRÉSENCES DANS PILOTAGE (Charles, 28 octobre 2026 : « il faudrait que dans
 * Pilotage-Gestion on ait les infos de présences pour les UE »). Trois lectures :
 * ce qui demande attention (alertes), le comptage des réguliers au premier dixième
 * par section, et une ligne par UE. Une ligne s'ouvre sur le module des présences
 * de l'UE — on lit, puis on corrige au même endroit. Serveur : `/api/presences-ue/pilotage`.
 */
import { useEffect, useState } from 'react';
import { IconUserCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Encadre, Fenetre, TuileEtat } from './ui.jsx';
import PresencesUE from './PresencesUE.jsx';

const frl = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const nb = v => (v == null ? '—' : String(v).replace('.', ','));

export default function PilotagePresences({ annee }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouverte, setOuverte] = useState(null);
  const charger = () => fetch(`/api/presences-ue/pilotage?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); setD(j); })
    .catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, [annee]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-400">Calcul des présences de toutes les unités…</p>;
  const tot = d.sections.reduce((a, s) => ({ R: a.R + s.reguliers, IR: a.IR + s.irreguliers }), { R: 0, IR: 0 });
  const tauxMoyen = (() => { const v = d.ues.filter(u => u.taux_presence != null); return v.length ? Math.round(v.reduce((a, u) => a + u.taux_presence, 0) / v.length * 10) / 10 : null; })();
  const nonEnc = d.ues.reduce((a, u) => a + u.non_encodees, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TuileEtat etat="neutre" valeur={d.ues.length} libelle="UE à l’horaire" precision={annee} />
        <TuileEtat etat="reussi" valeur={tot.R} libelle="Réguliers au 1er dixième" precision={`${tot.IR} irrégulier(s)`} />
        <TuileEtat etat="neutre" valeur={tauxMoyen == null ? '—' : `${nb(tauxMoyen)} %`} libelle="Présence moyenne" precision="présences + justifiées, par UE" />
        <TuileEtat etat={nonEnc ? 'surveiller' : 'reussi'} valeur={nonEnc} libelle="Présences non encodées" precision="séances tenues × étudiants" />
      </div>

      {d.alertes.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="intertitre m-0">À regarder</h3>
          {d.alertes.slice(0, 12).map((a, i) => (
            <button key={i} type="button" className="w-full text-left" onClick={() => setOuverte(a.ue_num)}>
              <Encadre etat={a.niveau}><b>UE {a.ue_num}</b>{a.ue_nom ? ` — ${a.ue_nom}` : ''} : {a.texte}</Encadre>
            </button>))}
          {d.alertes.length > 12 && <p className="text-second text-slate-500 m-0">… et {d.alertes.length - 12} autre(s).</p>}
        </div>)}

      <div>
        <h3 className="intertitre">Comptage au 1er dixième, par section</h3>
        <p className="text-second text-slate-500 mt-0">UE dont le premier dixième est passé. Une UE hors cursus est un groupe mixte : elle se compte à part.
          Une inscription par UE — un étudiant inscrit à trois UE compte trois fois.</p>
        <table className="text-sm border-collapse min-w-[420px]">
          <thead><tr className="tab-entete"><th className="px-2 py-1.5 text-left">Section</th><th className="px-2 py-1.5 text-right">UE</th>
            <th className="px-2 py-1.5 text-right">Réguliers</th><th className="px-2 py-1.5 text-right">Irréguliers</th></tr></thead>
          <tbody>{d.sections.map(s => (
            <tr key={s.section} className="border-t border-slate-100"><td className="px-2 py-1">{s.section}</td><td className="px-2 text-right">{s.ues}</td>
              <td className="px-2 text-right font-semibold">{s.reguliers}</td><td className="px-2 text-right">{s.irreguliers}</td></tr>))}
            {!d.sections.length && <tr><td colSpan={4} className="px-2 py-2 text-slate-500">Aucun premier dixième n’est encore passé.</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="intertitre">Par unité</h3>
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="tab-entete text-left">
              <th className="px-2 py-1.5">UE</th><th className="px-2 py-1.5 text-right">Inscrits</th><th className="px-2 py-1.5 text-right">Séances tenues</th>
              <th className="px-2 py-1.5 text-right">Présence</th><th className="px-2 py-1.5">1er dixième</th><th className="px-2 py-1.5">5e dixième</th>
              <th className="px-2 py-1.5 text-right">Non encodées</th></tr></thead>
            <tbody>{d.ues.map(u => (
              <tr key={u.ue_num} className="border-t border-slate-100 cursor-pointer hover:bg-white" onClick={() => setOuverte(u.ue_num)} title="Ouvrir les présences de l’UE">
                <td className="px-2 py-1"><b>UE {u.ue_num}</b> {u.ue_nom}<div className="text-second text-slate-500">{u.sections}{u.hors_cursus ? ' · hors cursus' : ''}</div></td>
                <td className="px-2 text-right">{u.inscrits}</td>
                <td className="px-2 text-right">{u.seances_tenues} / {u.seances}</td>
                <td className="px-2 text-right">{u.taux_presence == null ? '—' : `${nb(u.taux_presence)} %`}</td>
                {['au10', 'au50'].map((k, i) => (
                  <td key={k} className="px-2 whitespace-nowrap">{frl(u.jalons[i ? 50 : 10])}
                    {u[k].atteint ? <span className="text-second"> · <b style={{ color: 'var(--c-reussi)' }}>{u[k].R} R</b> · <b style={{ color: 'var(--c-refuse)' }}>{u[k].IR} IR</b>{u[k].marques ? ` · ${u[k].marques} inversé(s)` : ''}</span>
                      : <span className="text-second text-slate-400"> · à venir</span>}</td>))}
                <td className="px-2 text-right" style={{ color: u.non_encodees ? 'var(--c-attente)' : undefined }}>{u.non_encodees || '—'}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>

      {ouverte && (
        <Fenetre icone={IconUserCheck} titre="Présences par UE" large="ecran" onFermer={() => { setOuverte(null); charger(); }}>
          <PresencesUE ueInitiale={ouverte} />
        </Fenetre>)}
    </div>
  );
}
