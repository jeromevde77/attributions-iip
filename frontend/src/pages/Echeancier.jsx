import { useEffect, useMemo, useState } from 'react';
import {
  IconCalendarStats, IconCheck, IconRefresh,
  IconScale, IconFilter, IconX, IconBooks, IconPlayerPlay,
} from '@tabler/icons-react';
import { PageHeader, Tabs, Btn, TuileEtat, RailLateral, Fenetre, EnteteCarte, Encadre, PastilleEtat,
  ListeEtats, Tableau, TableauEntete, Th, Td, Tr } from '../components/ui.jsx';
import { authHeaders } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';
import { nomDuCompte } from '../lib/nom.js';

const MOIS = ['janvier','février','mars','avril','mai','juin',
              'juillet','août','septembre','octobre','novembre','décembre'];

const ZONES = {
  personnel:     'Personnel',
  documents:     'Documents',
  ue:            'Travail administratif UE',
  etablissement: 'Établissement',
  // LES ACTIONS DE RÉUNION SONT UNE ZONE COMME UNE AUTRE — un seul registre,
  // deux lentilles : ce que la circulaire impose, et ce qu'une séance a décidé.
  equipe:        'Suivi d’équipe',
};

const fr = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const jourMois = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';

/** Jours restants (négatif = en retard). */
function resteJours(iso) {
  const j = new Date(iso + 'T00:00:00Z');
  const a = new Date();
  const auj = new Date(Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()));
  return Math.round((j - auj) / 86400000);
}

/** L'état d'une échéance, dans les sept états de la maison (lib/etats.js). */
function etatEcheance({ statut, date_due }) {
  if (statut === 'fait') return 'reussi';
  if (statut === 'sans_objet' || statut === 'annule') return 'neutre';
  const n = resteJours(date_due);
  if (statut === 'en_retard' || n < 0) return 'corriger';
  if (n <= 7) return 'surveiller';
  return 'neutre';
}

function Pastille({ echeance }) {
  const { statut, date_due } = echeance;
  if (statut === 'fait')       return <PastilleEtat etat="reussi">Fait</PastilleEtat>;
  if (statut === 'sans_objet') return <PastilleEtat etat="neutre">Sans objet</PastilleEtat>;
  if (statut === 'annule')     return <PastilleEtat etat="neutre">Annulé</PastilleEtat>;
  const n = resteJours(date_due);
  if (n < 0)   return <PastilleEtat etat="corriger">En retard ({-n} j)</PastilleEtat>;
  if (n === 0) return <PastilleEtat etat="surveiller">Aujourd'hui</PastilleEtat>;
  if (n <= 7)  return <PastilleEtat etat="surveiller">J-{n}</PastilleEtat>;
  return <PastilleEtat etat="neutre">J-{n}</PastilleEtat>;
}

/** La case « fait » : un contrôle, pas un état — la coche porte la couleur de « réussi ». */
function CaseFait({ e, onClick }) {
  const fait = e.statut === 'fait';
  return (
    <button onClick={onClick} title={fait ? 'Marquer à faire' : 'Marquer fait'}
      className="w-[18px] h-[18px] rounded border flex-none flex items-center justify-center"
      style={fait ? { background: 'var(--c-reussi)', borderColor: 'var(--c-reussi)', color: '#fff' }
                  : { borderColor: 'var(--c-filet, rgb(var(--gris-300)))' }}>
      {fait && <IconCheck size={13} stroke={3} />}
    </button>
  );
}

export default function Echeancier() {
  const [tab, setTab] = useState('timeline');
  const [data, setData] = useState(null);
  const [types, setTypes] = useState([]);
  const [comptes, setComptes] = useState([]);
  const { passe } = useDroits();
  const peutRegler = passe('admin');
  const [chargement, setChargement] = useState(true);
  const [filtres, setFiltres] = useState({ zone: '', statut: '', responsable: '', mien: false });
  const [message, setMessage] = useState(null);
  const [detail, setDetail] = useState(null);

  async function charger() {
    setChargement(true);
    try {
      const p = new URLSearchParams();
      if (filtres.zone) p.set('zone', filtres.zone);
      if (filtres.statut) p.set('statut', filtres.statut);
      if (filtres.responsable) p.set('responsable', filtres.responsable);
      if (filtres.mien) p.set('mien', '1');
      const rep = await fetch(`/api/echeancier?${p}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error || `Erreur ${rep.status}` }); return; }
      setData(j);
    } finally { setChargement(false); }
  }

  async function chargerTypes() {
    const rep = await fetch('/api/echeancier/types', { headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok || !Array.isArray(j)) {
      setMessage({ type: 'err', texte: j?.error || `Référentiel indisponible (${rep.status})` });
      setTypes([]);
      return;
    }
    setTypes(j);
    // UNE PERSONNE PAR TYPE (3.5.066) : la direction choisit qui répond de chaque type d'échéance.
    if (peutRegler && !comptes.length) fetch('/api/users', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l => setComptes((Array.isArray(l) ? l : []).filter(u => u.actif))).catch(() => {});
  }
  async function choisirResponsable(t, uid) {
    const rep = await fetch(`/api/echeancier/types/${t.id}`, { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ responsable_user_id: uid ? Number(uid) : null }) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || `Erreur ${rep.status}` }); return; }
    setMessage({ type: 'ok', texte: uid ? `« ${t.libelle} » : ses échéances ouvertes et les suivantes vont à cette personne.` : `« ${t.libelle} » : retour au rôle.` });
    chargerTypes(); charger();
  }

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [filtres]);
  useEffect(() => { if (tab === 'referentiel') chargerTypes(); }, [tab]);
  // L'onglet « Mes tâches » filtre côté serveur (responsable = moi ou mon rôle)
  useEffect(() => {
    setFiltres(f => f.mien === (tab === 'mien') ? f : { ...f, mien: tab === 'mien' });
  }, [tab]);

  async function basculer(e) {
    const nouveau = e.statut === 'fait' ? 'a_faire' : 'fait';
    // DEUX REGISTRES, DEUX PORTES. Une action de réunion vit dans sa table :
    // la cocher ici doit s'adresser à celle-là, sinon on modifie l'échéance
    // légale qui porte par hasard le même numéro.
    const rep = e.origine === 'tache'
      ? await fetch(`/api/reunions/taches/${e.id}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ statut: nouveau }),
        })
      : await fetch(`/api/echeancier/${e.id}`, {
          method: 'PATCH', headers: authHeaders(),
          body: JSON.stringify({ statut: nouveau }),
        });
    if (!rep.ok) {
      const j = await rep.json().catch(() => ({}));
      setMessage({ type: 'err', texte: j.error || 'modification refusée' });
      return;
    }
    await charger();
  }

  async function regenerer() {
    setMessage({ type: 'ok', texte: 'Régénération en cours…' });
    const rep = await fetch('/api/echeancier/instancier', {
      method: 'POST', headers: authHeaders(), body: '{}',
    });
    const j = await rep.json();
    setMessage(rep.ok
      ? { type: 'ok', texte: `${j.crees} échéance(s) ajoutée(s), ${j.en_retard} en retard, ${j.envoyes} rappel(s) émis.` }
      : { type: 'err', texte: j.error });
    await charger();
  }

  const lignes = data?.lignes || [];
  const c = data?.compteurs || {};

  // Regroupement par mois pour la timeline
  const parMois = useMemo(() => {
    const g = new Map();
    for (const l of lignes) {
      const cle = l.date_due.slice(0, 7);
      if (!g.has(cle)) g.set(cle, []);
      g.get(cle).push(l);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lignes]);

  /* LE RAIL N'EST PAS UN PANNEAU DE FILTRES — ET C'EST CE QU'IL ÉTAIT DEVENU.
   *
   * Il portait les zones, les trois statuts et jusqu'à HUIT responsables : onze
   * entrées, dont sept partageant `IconChevronRight` faute d'avoir un dessin à
   * elles. Rail replié — c'est-à-dire presque toujours —, cela donnait une
   * colonne de flèches identiques qui ne menaient nulle part de reconnaissable.
   * « Trop d'icônes, personne ne trouve », et c'est exact : une icône répétée
   * sept fois n'est plus une icône, c'est du bruit.
   *
   * La règle de la maison le disait déjà — « une icône se mérite ; ce qui ne
   * tient pas dans une colonne d'icônes va dans une fenêtre, pas dans le
   * menu ». Et surtout : FILTRER N'EST PAS NAVIGUER. Le rail dit où l'on est ;
   * réduire une liste est un geste de l'écran, qui se fait dans sa barre
   * d'outils, avec des menus qui portent des MOTS.
   *
   * Le rail ne garde donc que ce qu'il sait nommer d'un dessin : rien ici. Les
   * trois filtres sont passés en listes déroulantes au-dessus de la liste.
   */
  const sections = [];

  return (
    <div className="relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral icon={IconCalendarStats} titre="Échéancier"
        sousTitre={data?.annee} sections={sections} />

      <div className="gouttiere-rail px-3 md:px-6 py-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PageHeader icon={IconCalendarStats} titre="Échéancier"
            sous="Obligations réglementaires et jalons de l'année — circulaire 9760, décret du 16/04/1991, RGE, statut du 01/02/1993" />
          <div className="flex gap-2">
            <Btn variant="secondary" icon={IconRefresh} onClick={charger}>Actualiser</Btn>
            <Btn variant="accent" icon={IconPlayerPlay} onClick={regenerer}>Régénérer</Btn>
          </div>
        </div>

        {message && (
          <Encadre etat={message.type === 'ok' ? 'reussi' : 'corriger'}>
            <div className="flex items-center justify-between gap-3">
              <span>{message.texte}</span>
              <button onClick={() => setMessage(null)} title="Fermer"><IconX size={15} /></button>
            </div>
          </Encadre>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <TuileEtat libelle="En retard"        valeur={c.en_retard ?? 0} etat={c.en_retard ? 'corriger' : 'neutre'} />
          <TuileEtat libelle="Dans 7 jours"     valeur={c.semaine ?? 0}   etat={c.semaine ? 'surveiller' : 'neutre'} />
          <TuileEtat libelle="Dans 30 jours"    valeur={c.mois ?? 0} />
          <TuileEtat libelle="Faites"           valeur={c.faites ?? 0}    etat="reussi" />
          <TuileEtat libelle="Total de l'année" valeur={c.total ?? 0}   etat="fort" />
        </div>

        <Tabs value={tab} onChange={setTab} items={[
          { key: 'timeline',    label: 'Timeline' },
          { key: 'liste',       label: 'Liste' },
          { key: 'mien',        label: 'Mes tâches' },
          { key: 'referentiel', label: 'Référentiel' },
        ]} />

        {/* LES FILTRES, EN MOTS, LÀ OÙ L'ON REGARDE LA LISTE.
            Ils vivaient dans le rail sous forme d'icônes — onze entrées dont
            sept flèches identiques. Trois menus qui se lisent valent mieux que
            onze dessins qu'il faut survoler un à un pour savoir ce qu'ils
            sont. Le compte reste affiché : c'est lui qui dit s'il vaut la
            peine d'ouvrir le filtre. */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={filtres.zone}
            onChange={e => setFiltres(f => ({ ...f, zone: e.target.value }))}
            className="controle text-sm">
            <option value="">Toutes les zones ({c.total ?? 0})</option>
            {(data?.zones || []).filter(z => z.zone).map(z => (
              <option key={z.zone} value={z.zone}>
                {ZONES[z.zone] || z.zone} ({z.n})
              </option>
            ))}
          </select>
          <select value={filtres.statut}
            onChange={e => setFiltres(f => ({ ...f, statut: e.target.value }))}
            className="controle text-sm">
            <option value="">Tous les statuts</option>
            <option value="en_retard">En retard ({c.en_retard ?? 0})</option>
            <option value="a_faire">À faire</option>
            <option value="fait">Faites ({c.faites ?? 0})</option>
          </select>
          <select value={filtres.responsable}
            onChange={e => setFiltres(f => ({ ...f, responsable: e.target.value }))}
            className="controle text-sm max-w-[16rem]">
            {/* LA LISTE N'EST PLUS TRONQUÉE À HUIT. Le rail ne pouvait pas en
                porter davantage ; un menu, si — et le neuvième responsable
                était invisible sans que rien ne le dise. */}
            <option value="">Tous les responsables</option>
            {(data?.responsables || []).map(rp => (
              <option key={rp.nom} value={rp.nom}>{rp.nom} ({rp.n})</option>
            ))}
          </select>
          {(filtres.zone || filtres.statut || filtres.responsable) && (
            <button className="bouton text-second px-2.5 py-1"
              onClick={() => setFiltres(f => ({
                ...f, zone: '', statut: '', responsable: '' }))}>
              Tout afficher
            </button>
          )}
        </div>

        {chargement && <div className="text-slate-400 text-sm py-8 text-center">Chargement…</div>}

        {/* ── TIMELINE ── */}
        {!chargement && tab === 'timeline' && (
          <div className="space-y-5">
            {!parMois.length && (
              <div className="carte p-8 text-center text-slate-500 text-sm">
                Aucune échéance. Vérifiez que les dates des UE sont encodées
                (Organisation → Planification → Dates des UE), puis cliquez sur « Régénérer ».
              </div>
            )}
            {parMois.map(([cle, items]) => (
              <div key={cle}>
                <div className="intertitre mb-2">
                  {MOIS[Number(cle.slice(5, 7)) - 1]} {cle.slice(0, 4)}
                </div>
                <ListeEtats>
                  {items.map(e => {
                    return (
                      /* DEUX TABLES, DEUX NUMÉROTATIONS : l'échéance 12 et la
                         tâche 12 existent toutes les deux. Sans préfixe, React
                         les confond et recycle la mauvaise ligne. */
                      <div key={`${e.origine || 'ech'}-${e.id}`}
                        data-etat={etatEcheance(e)}
                        className={`bloc-etat px-3.5 py-2.5 flex items-center gap-3 ${e.statut === 'fait' ? 'opacity-60' : ''}`}>
                        <div className="text-sm font-bold text-iip-blue w-12 flex-none">{jourMois(e.date_due)}</div>
                        <button onClick={() => setDetail(e)} className="flex-1 text-left min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {e.libelle}{e.libelle_override ? ` — ${e.libelle_override}` : ''}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {ZONES[e.zone] || e.zone}
                            {e.responsable_nom || e.responsable_role ? ` · ${e.responsable_nom || e.responsable_role}` : ''}
                            {e.base_legale ? ` · ${e.base_legale}` : ''}
                          </div>
                        </button>
                        {e.origine === 'tache' && (
                          <PastilleEtat etat="neutre" className="flex-none"
                                title={e.reunion_titre ? `Décidé en séance : ${e.reunion_titre}` : 'Action de suivi'}>
                            suivi
                          </PastilleEtat>
                        )}
                        {e.genere_auto === 1 && (
                          <PastilleEtat etat="disponible" className="flex-none">auto</PastilleEtat>
                        )}
                        <Pastille echeance={e} />
                        <CaseFait e={e} onClick={() => basculer(e)} />
                      </div>
                    );
                  })}
                </ListeEtats>
              </div>
            ))}
          </div>
        )}

        {/* ── LISTE ── */}
        {!chargement && (tab === 'liste' || tab === 'mien') && (
          <ListeEcheances
            lignes={tab === 'mien' ? lignes.filter(l => l.statut !== 'fait') : lignes}
            onBasculer={basculer} onDetail={setDetail} mien={tab === 'mien'}
          />
        )}

        {/* ── RÉFÉRENTIEL ── */}
        {tab === 'referentiel' && (
          <section className="carte overflow-hidden">
            <EnteteCarte icone={IconBooks} titre="Référentiel légal des échéances"
              sous={`${types.length} types — modifiable par l'administrateur à la lecture d'une circulaire`} />
            <Tableau className="!border-0 !rounded-none">
                <TableauEntete>
                    <Th>Échéance</Th>
                    <Th largeur="w-40">Zone</Th>
                    <Th largeur="w-52">Règle de date</Th>
                    <Th largeur="w-44">Responsable</Th>
                    <Th largeur="w-56">Base légale</Th>
                    <Th largeur="w-20">Instances</Th>
                </TableauEntete>
                <tbody>
                  {types.map(t => (
                    <Tr key={t.id}>
                      <td className="cellule px-3 py-2">
                        <div className="font-medium text-slate-800">{t.libelle}</div>
                        {t.description && (
                          <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 max-w-xl">{t.description}</div>
                        )}
                      </td>
                      <td className="cellule px-3 py-2 text-slate-600">{ZONES[t.zone] || t.zone || '—'}</td>
                      <td className="cellule px-3 py-2">
                        <code className="text-xs text-slate-700">{t.regle_date}</code>
                      </td>
                      <td className="cellule px-3 py-2 text-slate-600">
                        {peutRegler && comptes.length ? (
                          <select className="controle text-xs max-w-[11rem]" value={t.responsable_user_id || ''} onChange={e => choisirResponsable(t, e.target.value)}
                            title="La personne qui répond de ce type d’échéance : ses échéances ouvertes et les suivantes vont à elle, avec leurs rappels.">
                            <option value="">{t.responsable_defaut ? `Rôle : ${t.responsable_defaut}` : '—'}</option>
                            {comptes.map(u => <option key={u.id} value={u.id}>{nomDuCompte(u.nom_complet, u.email)}</option>)}
                          </select>
                        ) : (t.responsable_nom || t.responsable_defaut || '—')}
                      </td>
                      <td className="cellule px-3 py-2 text-xs text-slate-500">{t.base_legale || '—'}</td>
                      <td className="cellule px-3 py-2 text-slate-600">{t.nb_instances}</td>
                    </Tr>
                  ))}
                </tbody>
            </Tableau>
          </section>
        )}
      </div>

      {/* Détail */}
      {detail && (
        <Fenetre titre={detail.libelle} sous={detail.libelle_override || undefined}
          large="moyenne" onFermer={() => setDetail(null)}
          pied={<>
            <span />
            {detail.lien_interne && (
              <button className="bouton" onClick={() => { window.location.href = detail.lien_interne; }}>
                Ouvrir la page concernée
              </button>
            )}
            <button className={`bouton inline-flex items-center gap-1.5 ${detail.statut === 'fait' ? '' : 'bouton-fort'}`}
                 onClick={async () => { await basculer(detail); setDetail(null); }}>
              <IconCheck size={14} />
              {detail.statut === 'fait' ? 'Marquer à faire' : 'Marquer fait'}
            </button>
          </>}>
            <div className="space-y-3 text-sm">
              {detail.description && <p className="text-slate-700 leading-relaxed">{detail.description}</p>}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Info label="Échéance" valeur={fr(detail.date_due)} />
                <Info label="Statut" valeur={<Pastille echeance={detail} />} />
                <Info label="Zone" valeur={ZONES[detail.zone] || detail.zone || '—'} />
                <Info label="Responsable" valeur={detail.responsable_nom || detail.responsable_role || '—'} />
                {detail.origine === 'tache' && detail.reunion_titre && (
                  <Info label="Décidé en séance" valeur={detail.reunion_titre} />
                )}
                {detail.fait_le && <Info label="Fait le" valeur={`${fr(detail.fait_le)} par ${detail.fait_par}`} />}
              </div>
              {detail.base_legale && (
                <Encadre etat="neutre">
                  <span className="flex items-start gap-2">
                    <IconScale size={15} className="mt-0.5 flex-none text-slate-400" />
                    <span>{detail.base_legale}</span>
                  </span>
                </Encadre>
              )}
            </div>
        </Fenetre>
      )}
    </div>
  );
}

function Info({ label, valeur }) {
  return (
    <div>
      <div className="intertitre">{label}</div>
      <div className="text-slate-800 mt-0.5">{valeur}</div>
    </div>
  );
}

function ListeEcheances({ lignes, onBasculer, onDetail, mien }) {
  if (!lignes.length) {
    return (
      <div className="carte p-8 text-center text-slate-500 text-sm">
        {mien ? "Rien à traiter pour vous." : 'Aucune échéance pour ces critères.'}
      </div>
    );
  }
  return (
    <Tableau>
          <TableauEntete>
              <Th largeur="w-24">Date</Th>
              <Th>Échéance</Th>
              <Th largeur="w-40">Zone</Th>
              <Th largeur="w-32">Responsable</Th>
              <Th largeur="w-32">Statut</Th>
              <Th largeur="w-10"></Th>
          </TableauEntete>
          <tbody>
            {lignes.map(e => (
              <Tr key={`${e.origine || 'ech'}-${e.id}`} className={e.statut === 'fait' ? 'opacity-60' : ''}>
                <td className="cellule px-3 py-2 font-medium text-iip-blue whitespace-nowrap">{fr(e.date_due)}</td>
                <td className="cellule px-3 py-2">
                  <button onClick={() => onDetail(e)} className="text-left">
                    <div className="text-slate-800">
                      {e.libelle}
                      {e.origine === 'tache' && (
                        <PastilleEtat etat="neutre" className="ml-2">suivi</PastilleEtat>
                      )}
                    </div>
                    {e.libelle_override && <div className="text-xs text-slate-500">{e.libelle_override}</div>}
                  </button>
                </td>
                <td className="cellule px-3 py-2 text-slate-600">{ZONES[e.zone] || e.zone || '—'}</td>
                <td className="cellule px-3 py-2 text-slate-600">{e.responsable_nom || e.responsable_role || '—'}</td>
                <td className="cellule px-3 py-2"><Pastille echeance={e} /></td>
                <td className="cellule px-3 py-2">
                  <CaseFait e={e} onClick={() => onBasculer(e)} />
                </td>
              </Tr>
            ))}
          </tbody>
    </Tableau>
  );
}
