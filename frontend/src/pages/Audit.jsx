import { useEffect, useState } from 'react';
import { IconHistory } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * QUI A FAIT QUOI.
 *
 * Sept registres existaient, tous rangés par OBJET — cette attribution, ce
 * dossier, ce compte. Aucun ne répondait à la question qu'on se pose après
 * coup : « qu'a fait cette personne ? ». Il fallait ouvrir les dossiers un par
 * un, c'est-à-dire ne jamais le savoir.
 *
 * Cet écran ne crée aucun registre : il réunit ceux qui s'écrivent déjà. Un
 * huitième journal serait une source de plus à tenir, et la première à
 * diverger.
 */
const REGISTRES = {
  attributions: { label: 'Attributions', teinte: '#1B2B4B' },
  valorisation: { label: 'Valorisation', teinte: '#6b4ea8' },
  procedures:   { label: 'Procédures',   teinte: '#8a6d1f' },
  comptes:      { label: 'Comptes',      teinte: '#2f6f7d' },
  dossiers:     { label: 'Dossiers',     teinte: '#4a7c59' },
  documents:    { label: 'Documents',    teinte: '#6b7280' },
  parcours:     { label: 'Parcours',     teinte: '#2F6FB0' },
};

/* Les gestes portent le nom que leur registre leur donne — « create »,
   « decision_accord », « mot_de_passe_lien_envoye ». On les met en français
   ici, à l'affichage : les renommer en base romprait les écritures passées,
   et un registre qu'on réécrit ne prouve plus rien. */
const GESTES = {
  create: 'création', update: 'modification', delete: 'suppression',
  introduction: 'introduction', demande: 'demande', recevable: 'recevabilité',
  avis: 'avis du chargé de cours', decision_accord: 'décision — accord',
  decision_refus: 'décision — refus', validation: 'validation',
  devalidation: 'dévalidation', notification: 'notification',
  active: 'second facteur activé', desactive: 'second facteur désactivé',
  reinitialise: 'second facteur réinitialisé',
  mot_de_passe_change: 'mot de passe changé',
  mot_de_passe_reinitialise: 'mot de passe réinitialisé',
  mot_de_passe_lien_envoye: 'lien de mot de passe envoyé',
  mot_de_passe_lien_non_envoye: 'lien de mot de passe — envoi échoué',
  mot_de_passe_oubli_envoye: 'mot de passe oublié — lien envoyé',
  mot_de_passe_oubli_non_envoye: 'mot de passe oublié — envoi échoué',
  mot_de_passe_oubli_plafond: 'mot de passe oublié — plafond atteint',
  connexion_bloquee: 'compte bloqué (tentatives)',
  connexion_debloquee: 'compte débloqué',
  codes_regeneres: 'codes de secours régénérés',
  recuperation_utilisee: 'code de secours employé',
};

export default function Audit() {
  const [d, setD] = useState(null);
  const [qui, setQui] = useState('');
  const [registre, setRegistre] = useState('');
  const [depuis, setDepuis] = useState('');
  const [jusqu, setJusqu] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function charger() {
    setOccupe(true);
    const p = new URLSearchParams();
    if (qui) p.set('qui', qui);
    if (registre) p.set('registre', registre);
    if (depuis) p.set('depuis', depuis);
    if (jusqu) p.set('jusqu', jusqu);
    try {
      const rep = await fetch(`/api/audit?${p}`, { headers: authHeaders() });
      setD(rep.ok ? await rep.json() : { total: 0, lignes: [], personnes: [], registres: [] });
    } finally { setOccupe(false); }
  }
  useEffect(() => { charger(); }, [qui, registre, depuis, jusqu]);

  if (!d) return <div className="p-5 text-[13px] text-slate-400">Chargement…</div>;

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="titre-ecran flex items-center gap-2">
          <IconHistory size={18} className="text-slate-400" /> Qui a fait quoi
        </h1>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Les gestes posés dans Lucie, tous registres réunis. Rien n’est enregistré ici :
          cet écran rassemble ce qui s’écrit déjà ailleurs.
        </p>
      </div>

      {/* FILTRER N'EST PAS NAVIGUER : des menus qui portent des MOTS, dans la
          barre de l'écran — pas des entrées de rail. */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={qui} onChange={e => setQui(e.target.value)}
          className="controle border border-slate-300 rounded-champ text-[13px]">
          <option value="">Tout le monde</option>
          {d.personnes.map(p => (
            <option key={p.id ?? p.nom} value={p.id ?? p.nom}>
              {(p.nom || '—').trim()} ({p.gestes})
            </option>
          ))}
        </select>

        <select value={registre} onChange={e => setRegistre(e.target.value)}
          className="controle border border-slate-300 rounded-champ text-[13px]">
          <option value="">Tous les registres</option>
          {d.registres.map(r => (
            <option key={r.cle} value={r.cle}>
              {REGISTRES[r.cle]?.label || r.cle} ({r.gestes})
            </option>
          ))}
        </select>

        <input type="date" value={depuis} onChange={e => setDepuis(e.target.value)}
          title="Depuis" className="controle border border-slate-300 rounded-champ text-[13px]" />
        <input type="date" value={jusqu} onChange={e => setJusqu(e.target.value)}
          title="Jusqu'au" className="controle border border-slate-300 rounded-champ text-[13px]" />

        {(qui || registre || depuis || jusqu) && (
          <button onClick={() => { setQui(''); setRegistre(''); setDepuis(''); setJusqu(''); }}
            className="text-[12px] text-slate-500 hover:text-iip-blue">Tout afficher</button>
        )}

        <div className="flex-1" />
        <span className="text-[12px] text-slate-500">
          {occupe ? 'Chargement…' : `${d.total} geste(s)`}
          {d.tronque && <span className="text-amber-700"> · {d.lignes.length} affichés</span>}
        </span>
      </div>

      {!d.lignes.length ? (
        <div className="carte px-4 py-3 text-[13px] text-slate-500">
          Aucun geste pour ce filtre. Une liste vide ne veut pas dire qu’il ne s’est rien
          passé : elle veut dire que rien ne correspond à ce qui est demandé ci-dessus.
        </div>
      ) : (
        <div className="carte overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="tab-entete">
              <tr>
                <th className="text-left px-3 py-1.5 w-[140px]">Quand</th>
                <th className="text-left px-2 py-1.5 w-[170px]">Qui</th>
                <th className="text-left px-2 py-1.5 w-[110px]">Registre</th>
                <th className="text-left px-2 py-1.5">Geste</th>
                <th className="text-left px-2 py-1.5">Sur quoi</th>
              </tr>
            </thead>
            <tbody>
              {d.lignes.map((l, i) => {
                const reg = REGISTRES[l.registre] || { label: l.registre, teinte: '#6b7280' };
                return (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-1 text-slate-500 whitespace-nowrap">
                      {String(l.quand || '').slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-2 py-1">{(l.qui_nom || '—').trim()}</td>
                    <td className="px-2 py-1">
                      {/* Le registre porte sa teinte par un FILET, jamais par
                          un fond : six pastilles colorées ne signalent plus rien. */}
                      <span className="pl-1.5 border-l-2" style={{ borderColor: reg.teinte }}>
                        {reg.label}
                      </span>
                    </td>
                    <td className="px-2 py-1">{GESTES[l.geste] || l.geste}</td>
                    <td className="px-2 py-1 text-slate-600">
                      {l.objet}
                      {(l.section || l.annee || l.detail) && (
                        <span className="text-slate-400">
                          {' '}· {[l.section, l.annee, l.detail].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="carte px-4 py-2.5 text-[11px] text-slate-500 leading-relaxed">
        <b>Ce que cet écran ne dit pas.</b> Il montre ce que les registres ont écrit —
        pas ce qu’ils n’écrivent pas. Les pièces produites ne laissent une trace que
        dans quatre cas sur quarante et un (<code>archiverDocument()</code>), et les
        consultations ne sont journalisées nulle part : lire un dossier ne se voit pas.
      </div>
    </div>
  );
}
