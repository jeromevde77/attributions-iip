import { useEffect, useState } from 'react';
import { IconArrowBackUp, IconRefresh, IconAlertTriangle, IconX } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, OutilFenetre, Encadre, PastilleEtat } from './ui.jsx';
import { demander } from '../lib/dialogue.jsx';

/**
 * Annulation des dernières modifications d'attributions.
 *
 * Chaque écriture (création, modification, suppression) enregistre au préalable
 * un instantané complet de la ligne. Restaurer consiste à réécrire cet
 * instantané — y compris pour une attribution supprimée, qui est alors recréée
 * avec son identifiant d'origine.
 */

const ACTIONS = {
  create:   { libelle: 'Création',     etat: 'reussi' },
  update:   { libelle: 'Modification', etat: 'disponible' },
  delete:   { libelle: 'Suppression',  etat: 'corriger' },
  rollback: { libelle: 'Restauration', etat: 'neutre' },
};

export default function AnnulationPanel({ annee, onClose, onRestaure }) {
  const [items, setItems] = useState(null);
  const [actif, setActif] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState(null);

  async function charger() {
    const [h, cfg] = await Promise.all([
      fetch(`/api/historique${annee ? `?annee=${annee}` : ''}&limit=40`.replace('?&', '?'),
        { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
      fetch('/api/historique/config', { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setItems(Array.isArray(h) ? h : []);
    setActif(cfg);
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee]);

  async function restaurer(it) {
    const quoi = `UE ${it.ue_num ?? '?'}${it.nom_cours ? ' — ' + it.nom_cours : ''}`;
    if (!(await demander(
      `Restaurer l'état de ${quoi} tel qu'il était avant cette ${ACTIONS[it.action]?.libelle.toLowerCase() || 'action'} ?\n\n` +
      `Du ${new Date(it.created_at).toLocaleString('fr-BE')}` +
      (it.utilisateur_nom ? ` par ${it.utilisateur_nom}` : '')))) return;

    setEnCours(it.id);
    try {
      const rep = await fetch(`/api/historique/rollback/${it.id}`, {
        method: 'POST', headers: authHeaders(),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'Erreur' }); return; }
      setMessage({ type: 'ok', texte: `Attribution ${j.restored} restaurée.` });
      await charger();
      onRestaure && onRestaure();
    } finally { setEnCours(null); }
  }

  const historiqueInactif = actif && actif.actif === false;

  return (
    <Fenetre icone={IconArrowBackUp} titre="Annuler une modification" large="moyenne" onFermer={onClose}
      sous={`Dernières écritures sur les attributions${annee ? ` — ${annee}` : ''}`}
      outils={<OutilFenetre Icone={IconRefresh} titre="Actualiser" onClick={charger} />}>
        <div className="space-y-3">
          {historiqueInactif && (
            <Encadre etat="surveiller" icone={IconAlertTriangle} titre="Historique désactivé">
              L'historique est <b>désactivé</b> : les modifications ne sont plus enregistrées et
              ne pourront pas être annulées. Activez-le dans Configuration → Historique.
            </Encadre>
          )}

          {message && (
            <Encadre etat={message.type === 'ok' ? 'reussi' : 'corriger'}>
              <div className="flex items-center justify-between">
                <span>{message.texte}</span>
                <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 ml-3" title="Fermer">
                  <IconX size={14} />
                </button>
              </div>
            </Encadre>
          )}

          {!items ? (
            <div className="text-sm text-slate-400 py-6 text-center">Chargement…</div>
          ) : !items.length ? (
            <div className="carte text-sm text-slate-400 py-8 text-center">
              Aucune modification enregistrée.
            </div>
          ) : (
            <div className="carte overflow-hidden divide-y divide-slate-100 max-h-[52vh] overflow-y-auto">
              {items.map(it => {
                const a = ACTIONS[it.action] || ACTIONS.update;
                return (
                  <div key={it.id} className="ligne-maison flex items-center gap-3 px-3 py-2.5">
                    <PastilleEtat etat={a.etat} className="flex-none">{a.libelle}</PastilleEtat>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800 truncate">
                        <b className="text-iip-blue">UE {it.ue_num ?? '—'}</b>
                        {it.nom_cours ? ` · ${it.nom_cours}` : ''}
                        {it.section ? <span className="text-slate-400"> · {it.section}</span> : null}
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(it.created_at).toLocaleString('fr-BE')}
                        {it.utilisateur_nom ? ` · ${it.utilisateur_nom}` : ''}
                      </div>
                    </div>
                    {it.action !== 'rollback' && (
                      <button onClick={() => restaurer(it)} disabled={enCours === it.id}
                        className="bouton bouton-compact flex-none">
                        <IconArrowBackUp size={13} />
                        {enCours === it.id ? '…' : 'Rétablir l\u2019état antérieur'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-slate-400 border-t pt-3">
            « Rétablir l'état antérieur » réécrit l'attribution telle qu'elle était juste avant
            l'action choisie. Une attribution supprimée est recréée avec son identifiant d'origine.
            La restauration est elle-même enregistrée : elle peut donc être annulée à son tour.
          </p>
        </div>
    </Fenetre>
  );
}
