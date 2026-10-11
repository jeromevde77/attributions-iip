import { useEffect, useState } from 'react';
import { IconSpeakerphone, IconChevronRight, IconCheck, IconChecks } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';
import { ICONES_MESSAGE, IMPORTANCES_MESSAGE } from '../lib/messages.js';

/**
 * LES MESSAGES, EN BLOCS (3.1.286, Charles, 11 octobre 2026 : « en un bloc, pas une demi-page,
 * comme ce que tu as fait pour les nouveautés — un liseré bleu et la petite icône porte-voix »).
 * Une ligne par message, pleine largeur : le liseré dit l'importance, le titre et le début du
 * texte suffisent pour savoir de quoi il s'agit. Le clic ouvre le message entier, dans sa mise
 * en page, avec « Marquer comme lu » — ou « J'en ai pris connaissance » quand l'auteur demande
 * un accusé : le message reste alors signalé tant qu'il n'est pas confirmé.
 */
const heure = s => { const d = new Date(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const apercu = html => String(html || '').replace(/<\/(p|li)>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export default function MessagesRecus() {
  const [liste, setListe] = useState([]);
  const [ouvert, setOuvert] = useState(null);
  const charger = () => fetch('/api/communication/recus', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : [])).then(l => setListe(Array.isArray(l) ? l : [])).catch(() => setListe([]));
  useEffect(() => { charger(); }, []);

  const aFaire = m => (m.accuse_demande ? !m.accuse_le : !m.lu_le);
  async function poser(m, geste) {
    await fetch(`/api/communication/${m.id}/${geste}`, { method: 'POST', headers: authHeaders() }).catch(() => {});
    await charger(); setOuvert(null);
  }
  if (!liste.length) return null;

  return (
    <div className="space-y-2">
      {liste.map(m => {
        const imp = IMPORTANCES_MESSAGE[m.importance] || IMPORTANCES_MESSAGE.info;
        const Icone = (m.icone && ICONES_MESSAGE[m.icone]?.Icone) || IconSpeakerphone;
        const nouveau = aFaire(m);
        return (
          <button key={m.id} type="button" onClick={() => setOuvert(m)} data-etat={imp.etat}
            className={`bloc-etat w-full text-left px-4 py-3 flex items-center gap-3 hover:brightness-[.98] ${nouveau ? '' : 'opacity-75'}`}>
            <Icone size={22} style={{ color: imp.couleur }} className="flex-none" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 flex-wrap">
                <b className="text-sm">{m.titre}</b>
                {nouveau && <span className="pastille-etat" data-etat={m.accuse_demande ? 'surveiller' : imp.etat}>{m.accuse_demande ? 'À confirmer' : 'Nouveau'}</span>}
                {!nouveau && <span className="text-mention flex items-center gap-0.5" style={{ color: 'var(--c-reussi)' }}>{m.accuse_le ? <IconChecks size={13} /> : <IconCheck size={13} />}{m.accuse_le ? 'Confirmé' : 'Lu'}</span>}
              </span>
              <span className="block text-second text-slate-500 truncate">{m.cree_par} · {heure(m.envoye_le)} — {apercu(m.corps_html)}</span>
            </span>
            <IconChevronRight size={16} className="text-slate-400 flex-none" />
          </button>);
      })}
      {ouvert && (() => {
        const m = ouvert;
        const imp = IMPORTANCES_MESSAGE[m.importance] || IMPORTANCES_MESSAGE.info;
        return (
          <Fenetre titre={m.titre} sous={`${m.cree_par} · ${heure(m.envoye_le)} · ${imp.libelle}`} onFermer={() => setOuvert(null)}
            pied={<>
              <span className="text-second text-slate-500 min-w-0 flex-1">{m.accuse_demande && !m.accuse_le ? 'L’auteur demande que vous confirmiez en avoir pris connaissance.' : ''}</span>
              {m.accuse_demande && !m.accuse_le
                ? <button className="bouton bouton-fort" onClick={() => poser(m, 'accuse')}><IconChecks size={15} className="inline -mt-0.5 mr-1" />J’en ai pris connaissance</button>
                : !m.lu_le
                  ? <button className="bouton bouton-fort" onClick={() => poser(m, 'lu')}><IconCheck size={15} className="inline -mt-0.5 mr-1" />Marquer comme lu</button>
                  : <button className="bouton bouton-fort" onClick={() => setOuvert(null)}>Fermer</button>}
            </>}>
            <div className="texte-due" dangerouslySetInnerHTML={{ __html: m.corps_html }} />
          </Fenetre>);
      })()}
    </div>
  );
}
