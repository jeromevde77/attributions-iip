import { useEffect, useMemo, useState } from 'react';
import { IconPencil, IconTrash, IconPlus, IconMessageDots } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { demander, saisir } from '../lib/dialogue.jsx';
import { Encadre } from '../components/ui.jsx';

/**
 * LE CATALOGUE COMMUN DES RÉPONSES TYPES (3.1.21) — tenu par la direction.
 * Un champ apparaît ici dès qu'une phrase lui a été donnée : depuis le champ
 * lui-même (bouton « Réponses types », « Enregistrer le texte du champ »), ou
 * ici. Les variables entre accolades se remplissent à l'insertion.
 */
const VARIABLES = '{etudiant} {matricule} {ue} {ue_nom} {section} {session} {session_texte} {annee} {date} {moi} {date_faits} {publie_le}';

async function appel(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

export default function ReponsesTypesConfig() {
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [q, setQ] = useState('');
  const charger = () => appel('/api/reponses-types/catalogue').then(d => setLignes(d.reponses)).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);

  const champs = useMemo(() => {
    const m = new Map();
    for (const l of lignes || []) {
      if (q && !`${l.champ_libelle || ''} ${l.champ} ${l.groupe || ''} ${l.texte}`.toLowerCase().includes(q.toLowerCase())) continue;
      if (!m.has(l.champ)) m.set(l.champ, { champ: l.champ, libelle: l.champ_libelle || l.champ, l: [] });
      m.get(l.champ).l.push(l);
    }
    return [...m.values()];
  }, [lignes, q]);

  async function ajouter(c) {
    const texte = await saisir({ message: `Nouvelle réponse type pour « ${c.libelle} » :\n\nVariables : ${VARIABLES}`, multiligne: true, obligatoire: true });
    if (!texte || !String(texte).trim()) return;
    const groupe = await saisir({ message: 'Rangée sous quel intitulé ? (facultatif — ex. Fraude, Délai)', valeur: '' });
    try { await appel('/api/reponses-types', { method: 'POST', body: JSON.stringify({ champ: c.champ, champ_libelle: c.libelle, texte, groupe, commun: true }) }); charger(); }
    catch (e) { setErreur(e.message); }
  }
  async function modifier(l) {
    const texte = await saisir({ message: `Corriger la réponse type :\n\nVariables : ${VARIABLES}`, valeur: l.texte, multiligne: true, obligatoire: true });
    if (!texte || !String(texte).trim()) return;
    const groupe = await saisir({ message: 'Intitulé de rangement (facultatif) :', valeur: l.groupe || '' });
    try { await appel(`/api/reponses-types/${l.id}`, { method: 'PUT', body: JSON.stringify({ texte, groupe: groupe ?? l.groupe }) }); charger(); }
    catch (e) { setErreur(e.message); }
  }
  async function supprimer(l) {
    if (!(await demander('Supprimer cette réponse type du catalogue commun ?'))) return;
    try { await appel(`/api/reponses-types/${l.id}`, { method: 'DELETE' }); charger(); }
    catch (e) { setErreur(e.message); }
  }

  return (
    <div className="space-y-4">
      <Encadre etat="neutre">
        Toute zone de texte de Lucie porte un bouton <b>« Réponses types »</b> : on y choisit une phrase, elle s'insère au curseur et se
        corrige sur place. Ici, le <b>catalogue commun</b>, que tout le monde voit ; chacun peut en plus garder ses propres phrases depuis le
        champ. Un champ s'ajoute à cette liste dès qu'on lui donne une première phrase — depuis le champ lui-même. Les variables entre
        accolades se remplissent seules ; ce que l'écran ne sait pas reste entre crochets : <span className="text-slate-500">{VARIABLES}</span>
      </Encadre>
      <div className="flex items-center gap-2">
        <input type="search" name="search_catalogue" value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un champ ou une phrase…" className="controle w-80" />
        <span className="text-second text-slate-500">{(lignes || []).length} phrase(s) · {champs.length} champ(s)</span>
      </div>
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      {!lignes ? <p className="text-sm text-slate-400">Chargement…</p> : champs.map(c => (
        <div key={c.champ} className="carte p-3">
          <div className="flex items-center gap-2 mb-2">
            <IconMessageDots size={15} className="text-slate-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-iip-texte">{c.libelle}</div>
              <div className="text-xs text-slate-400">{c.champ}</div>
            </div>
            <button type="button" onClick={() => ajouter(c)} className="bouton bouton-compact inline-flex items-center gap-1"><IconPlus size={13} /> Ajouter</button>
          </div>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {c.l.map(l => (
              <li key={l.id} className="flex items-start gap-3 py-2">
                <span className="w-28 flex-none text-xs text-slate-500 pt-0.5">{l.groupe || '—'}</span>
                <span className="flex-1 min-w-0 text-second text-slate-700 whitespace-pre-line">{l.texte}</span>
                <span className="flex-none flex gap-1.5 pt-0.5">
                  <button type="button" title="Corriger" onClick={() => modifier(l)} className="text-slate-400 hover:text-iip-blue"><IconPencil size={14} /></button>
                  <button type="button" title="Supprimer" onClick={() => supprimer(l)} className="text-slate-400 hover:text-red-600"><IconTrash size={14} /></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
