import { useEffect, useState } from 'react';
import { IconSend } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { TuileEtat, Encadre } from './ui.jsx';
import { ouvrirApercu } from '../lib/apercu.js';
import { informer } from '../lib/dialogue.jsx';

/**
 * LES PAE HORS RÈGLE DE PRÉREQUIS (3.1.44, Charles, 5 octobre 2026 : « est-ce
 * que Lucie calcule bien le PAE possible ? » puis « je devrais pouvoir sortir
 * cela de Lucie »). Les inscriptions de l'année dont le prérequis légal n'est
 * pas acquis, hors des trois cas permis — même bloc la même année, cadenas,
 * dérogation —, avec pour chacune ce qu'on constate et ce qu'il faut faire.
 * Le calcul est celui de la pièce des Éditions (lib/controlePae.js, côté
 * serveur) : l'écran et le papier disent la même chose.
 */
const prenomSeul = p => String(p || '').replace(/\s+[A-Z](,|\.)?(\s+[A-Z]\.?)*\.?$/, '').trim() || String(p || '');

export default function PaeHorsRegle() {
  const annee = getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    fetch(`/api/etudiants/controle-pae?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); setD(j); })
      .catch(e => setErreur(e.message));
  }, [annee]);

  async function imprimer() {
    const r = await fetch('/api/rapports/pae-hors-regle/document', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { await informer(j.error || 'La pièce n’a pas pu être composée.'); return; }
    ouvrirApercu({ html: j.html, titre: j.titre || 'PAE hors règle', nomFichier: j.nom, envoiPossible: false, astuceImpression: 'A4 paysage' });
  }

  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-400">Contrôle des PAE de {annee}…</p>;

  const parSection = new Map();
  for (const l of d.hors) { const s = l.section || '—'; if (!parSection.has(s)) parSection.set(s, []); parSection.get(s).push(l); }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <p className="text-sm text-slate-600 flex-1">
          Les inscriptions de {annee} dont le prérequis légal n’est pas acquis. Trois cas sont permis : le prérequis
          suivi la même année dans le même bloc, le prérequis ajourné l’an dernier (cadenas), une dérogation motivée.
          Le reste est à régulariser, dossier par dossier.
        </p>
        <button type="button" onClick={imprimer} className="bouton bouton-sortir controle inline-flex items-center gap-1.5 flex-none">
          <IconSend size={15} /> Imprimer ou envoyer
        </button>
      </div>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <TuileEtat valeur={d.total.toLocaleString('fr-BE')} libelle="prérequis pas encore acquis" precision="inscriptions concernées" />
        <TuileEtat etat="reussi" valeur={d.conformes.total.toLocaleString('fr-BE')} libelle="conformes"
          precision={`${d.conformes.meme_bloc} même bloc · ${d.conformes.cadenas} cadenas · ${d.conformes.derogation} dérogations`} />
        <TuileEtat etat={d.hors.length ? 'corriger' : 'reussi'} valeur={d.hors.length} libelle="hors règle" precision="sans dérogation" />
        <TuileEtat etat={d.etudiants ? 'surveiller' : 'reussi'} valeur={d.etudiants} libelle="étudiants concernés" precision="à régulariser" />
      </div>
      {!d.hors.length ? <Encadre etat="reussi">Aucune inscription hors règle pour {annee}.</Encadre> : (
        <div className="border border-slate-200 rounded-carte overflow-hidden">
          <table className="w-full text-second">
            <thead><tr className="tab-entete text-left text-mention uppercase tracking-[.08em] text-slate-500">
              <th className="px-3 py-1.5">Étudiant</th><th className="px-3 py-1.5">UE inscrite</th>
              <th className="px-3 py-1.5">Prérequis légal</th><th className="px-3 py-1.5">Constat et action</th></tr></thead>
            <tbody>
              {[...parSection].map(([sec, ls]) => [
                <tr key={`g-${sec}`} className="tab-repere"><td colSpan={4} className="px-3 py-1 font-semibold text-iip-texte">{sec} · {ls.length}</td></tr>,
                ...ls.map((l, i) => (
                  <tr key={`${sec}-${i}`} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-1.5"><b>{String(l.nom || '').toUpperCase()}</b> {prenomSeul(l.prenom)}
                      <div className="text-xs text-slate-400">{l.matricule || 'sans matricule'}</div></td>
                    <td className="px-3 py-1.5"><b>UE {l.ue_num}</b> · {l.niv_ue}<div className="text-xs text-slate-500">{l.nom_ue}</div></td>
                    <td className="px-3 py-1.5"><b>UE {l.prerequis_num}</b> · {l.niv_pre}<div className="text-xs text-slate-500">{l.nom_pre}</div>
                      <div className="text-xs text-slate-400">Historique : {l.historique || 'aucun'}</div></td>
                    <td className="px-3 py-1.5">
                      <div className="font-semibold pl-2 border-l-4" style={{ borderColor: l.gravite === 'corriger' ? 'var(--c-refuse)' : 'var(--c-attente)' }}>{l.constat}</div>
                      <div className="text-second text-slate-600 pl-3 mt-0.5">{l.action}</div>
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
