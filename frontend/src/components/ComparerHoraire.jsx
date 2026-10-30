import { useEffect, useMemo, useState } from 'react';
import { IconCalendarCheck, IconRefresh } from '@tabler/icons-react';
import { Fenetre, Tableau, Th, Td, Tr, Encadre, PastilleEtat } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { demander } from '../lib/dialogue.jsx';

/**
 * LES DATES DE L'UE FACE À L'HORAIRE RÉEL (Charles, 28 octobre 2026 : « il faut
 * surtout que le premier dixième et le dernier dixième soient alignés aux
 * horaires réels, et vice versa »).
 *
 * Une ligne par organisation d'UE : ses dates d'ouverture et de fermeture, la
 * première et la dernière séance de l'horaire, les deux premiers dixièmes (celui
 * des dates — le RGE — et celui de l'horaire — la vérificatrice), les séances
 * posées hors des dates. « Aligner » reprend les dates de l'UE sur l'horaire,
 * par l'enregistrement habituel des dates (la coordination dépose une demande).
 * Le sens inverse — une séance hors des dates — se corrige dans l'horaire.
 */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const ETATS = {
  aligne: ['reussi', 'Alignée'],
  ecart: ['surveiller', 'Écart'],
  sans_dates: ['surveiller', 'Sans dates'],
  sans_seances: ['neutre', 'Aucune séance'],
  plusieurs_orgs: ['neutre', 'Plusieurs organisations'],
};
const jours = n => (n == null || n === 0 ? '' : `${n > 0 ? '+' : '−'}${Math.abs(n)} j`);

export default function ComparerHoraire({ annee, section, onFermer, onAligne }) {
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [filtre, setFiltre] = useState('a_voir');
  const [choix, setChoix] = useState(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  async function charger() {
    setErreur(null);
    const p = new URLSearchParams({ annee });
    if (section) p.set('section', section);
    const r = await fetch(`/api/annuel/dates-ue/horaire?${p}`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Comparaison impossible.'); return; }
    setLignes(j.lignes);
    setChoix(new Set());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, section]);

  const compte = useMemo(() => {
    const c = { aligne: 0, ecart: 0, sans_dates: 0, sans_seances: 0, plusieurs_orgs: 0, hors: 0 };
    for (const l of lignes || []) { c[l.statut]++; if (l.hors) c.hors++; }
    return c;
  }, [lignes]);
  const visibles = (lignes || []).filter(l => filtre === 'toutes' ? true
    : filtre === 'a_voir' ? (l.statut !== 'aligne' && l.statut !== 'sans_seances') || l.hors > 0
    : l.statut === filtre);
  const alignables = visibles.filter(l => l.alignable);

  async function aligner() {
    const retenues = (lignes || []).filter(l => choix.has(l.id));
    if (!retenues.length) return;
    const apercu = retenues.slice(0, 10).map(l => `UE ${l.ue_num} (${l.section || '—'}) : ouverture ${fr(l.date_debut)} → ${fr(l.premiere)}, fermeture ${fr(l.date_fin)} → ${fr(l.derniere)}`);
    if (!(await demander({
      titre: 'Aligner les dates sur l’horaire',
      message: `Les dates de ${retenues.length} organisation(s) reprendront la première et la dernière séance de l’horaire :\n\n${apercu.join('\n')}${retenues.length > 10 ? `\n… et ${retenues.length - 10} autre(s)` : ''}\n\nL’échéancier sera recalculé. Continuer ?`,
    }))) return;
    setEnvoi(true); setMessage(null);
    try {
      const r = await fetch('/api/annuel/dates-ue', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ lignes: retenues.map(l => ({ id: l.id, date_debut: l.premiere, date_fin: l.derniere })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Enregistrement refusé.');
      if (j.en_attente) setMessage({ etat: 'disponible', texte: j.message });
      else {
        const e = await fetch('/api/annuel/echeancier/instancier', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }) });
        const refus = j.erreurs?.length ? ` ${j.erreurs.length} refusée(s).` : '';
        setMessage(e.ok
          ? { etat: 'reussi', texte: `${j.modifiees} organisation(s) alignée(s) sur l’horaire, échéancier recalculé.${refus}` }
          : { etat: 'surveiller', texte: `${j.modifiees} organisation(s) alignée(s) sur l’horaire, mais l’échéancier n’a pas pu être recalculé : relancez-le depuis l’échéancier.${refus}` });
      }
      await charger();
      onAligne?.();
    } catch (e) { setMessage({ etat: 'corriger', texte: e.message }); }
    finally { setEnvoi(false); }
  }

  const tout = alignables.length > 0 && alignables.every(l => choix.has(l.id));
  const basculer = id => setChoix(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Fenetre icone={IconCalendarCheck} titre="Les dates des UE face à l’horaire réel" large="pleine"
      sous={`${annee}${section ? ` · ${section}` : ''} — premier dixième des dates (RGE) et de l’horaire (vérificatrice)`}
      onFermer={onFermer}
      pied={<>
        <span className="text-second text-slate-500 min-w-0 flex-1">
          {choix.size ? `${choix.size} organisation(s) cochée(s)` : 'Cochez les organisations dont les dates doivent reprendre l’horaire.'}
        </span>
        <button className="bouton" onClick={charger}><IconRefresh size={15} /> Actualiser</button>
        <button className="bouton bouton-fort" disabled={!choix.size || envoi} onClick={aligner}>
          {envoi ? 'Alignement…' : 'Aligner les dates sur l’horaire'}
        </button>
      </>}>
      <div className="space-y-3">
        <p className="text-second text-slate-600">
          Le premier dixième se lit de deux façons : à partir des dates d’ouverture et de fermeture de l’UE
          (RGE du supérieur, art. 1er, 12°) et à partir des séances réellement données (la méthode de la
          vérificatrice, celle de la grille de présence). Elles ne tombent sur le même jour que si les dates
          de l’UE sont la première et la dernière séance de l’horaire.
        </p>
        {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
        {message && <Encadre etat={message.etat}>{message.texte}</Encadre>}
        {lignes && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="segments">
              {[['a_voir', `À voir (${(lignes || []).filter(l => (l.statut !== 'aligne' && l.statut !== 'sans_seances') || l.hors > 0).length})`],
                ['ecart', `Écart (${compte.ecart})`], ['sans_dates', `Sans dates (${compte.sans_dates})`],
                ['plusieurs_orgs', `Plusieurs org. (${compte.plusieurs_orgs})`], ['aligne', `Alignées (${compte.aligne})`],
                ['sans_seances', `Sans séance (${compte.sans_seances})`], ['toutes', 'Toutes']].map(([v, t]) => (
                <button key={v} onClick={() => { setFiltre(v); setChoix(new Set()); }}
                  className={`px-3 py-1.5 text-sm ${filtre === v ? 'bg-iip-blue text-white font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{t}</button>
              ))}
            </div>
            {compte.hors > 0 && (
              <span className="text-second text-slate-600">
                {compte.hors} organisation(s) ont des séances hors de leurs dates : à corriger dans l’horaire, ou à aligner.
              </span>
            )}
          </div>
        )}
        {!lignes && !erreur && <p className="text-sm text-slate-500">Comparaison en cours…</p>}
        {lignes && !visibles.length && <p className="text-sm text-slate-500">Rien à afficher pour ce filtre.</p>}
        {visibles.length > 0 && (
          <Tableau dense>
            <thead>
              <tr className="tab-entete">
                <Th largeur="w-8">
                  <input type="checkbox" disabled={!alignables.length} checked={tout}
                    onChange={() => setChoix(tout ? new Set() : new Set(alignables.map(l => l.id)))} />
                </Th>
                <Th>UE</Th><Th>État</Th>
                <Th>Dates de l’UE</Th><Th>Horaire réel</Th>
                <Th>1er dixième — dates</Th><Th>1er dixième — horaire</Th>
                <Th>Hors des dates</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(l => {
                const [etat, libelle] = ETATS[l.statut] || ['neutre', l.statut];
                const differe = l.dixieme_dates && l.dixieme_horaire && l.dixieme_dates !== l.dixieme_horaire;
                return (
                  <Tr key={l.id}>
                    <Td>
                      <input type="checkbox" disabled={!l.alignable} checked={choix.has(l.id)} onChange={() => basculer(l.id)}
                        title={l.alignable ? '' : l.statut === 'plusieurs_orgs'
                          ? 'L’horaire ne dit pas quelle séance appartient à quelle organisation : à régler à la main.'
                          : 'Rien à aligner.'} />
                    </Td>
                    <Td>
                      <b>UE {l.ue_num}</b>{l.nb_orgs > 1 ? ` · org ${l.num_organisation}` : ''}
                      <div className="text-second text-slate-500">{l.section || '—'}{l.ue_nom ? ` · ${l.ue_nom}` : ''}</div>
                    </Td>
                    <Td><PastilleEtat etat={etat}>{libelle}</PastilleEtat></Td>
                    <Td>{fr(l.date_debut)} → {fr(l.date_fin)}</Td>
                    <Td>
                      {l.nb_seances ? <>{fr(l.premiere)} → {fr(l.derniere)}
                        <div className="text-second text-slate-500">
                          {l.nb_seances} séance(s){(l.ecart_debut || l.ecart_fin)
                            ? ` · ouverture ${jours(-l.ecart_debut) || '='} · fermeture ${jours(-l.ecart_fin) || '='}` : ''}
                        </div></> : '—'}
                    </Td>
                    <Td className={differe ? 'font-semibold' : ''}>{fr(l.dixieme_dates)}</Td>
                    <Td className={differe ? 'font-semibold' : ''}>{fr(l.dixieme_horaire)}</Td>
                    <Td>
                      {l.hors ? <span title={l.hors_dates.map(fr).join(', ')}>
                        {l.hors} séance(s)
                        <div className="text-second text-slate-500">{l.hors_dates.slice(0, 3).map(fr).join(', ')}{l.hors_dates.length > 3 ? '…' : ''}</div>
                      </span> : '—'}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Tableau>
        )}
        <p className="text-second text-slate-500">
          « Ouverture +7 j » : la première séance tombe sept jours après l’ouverture de l’UE ; « fermeture −51 j » :
          la dernière séance précède de 51 jours la fermeture. Une UE donnée en
          plusieurs organisations ne s’aligne pas d’office — l’horaire ne dit pas quelle séance appartient à
          quelle organisation : ses séances « hors des dates » sont celles qui ne tombent dans la fenêtre d’aucune.
        </p>
      </div>
    </Fenetre>
  );
}
