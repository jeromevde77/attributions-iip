/**
 * LE CIRCUIT D'UNE VALORISATION, LU DES TRACES — une seule définition pour
 * l'écran Valorisation et l'onglet de la fiche étudiant (3.1.429). La fiche
 * avait son propre résumé, qui lisait `type` — « partielle » par défaut à
 * l'introduction — et présentait une demande à peine reçue comme une dispense
 * partielle décidée. Deux lectures d'un même dossier finissent par se
 * contredire : celle-ci est la seule.
 */
/* AD VERT, VA BLEU, VAE VIOLET — ÉCRIT UNE FOIS. */
export const TEINTE_PORTE = {
  admission: { t: 'var(--c-texte)', f: '#15803D26', b: '#15803D66' },  // vert
  va:        { t: 'var(--c-disponible)', f: '#2D447020', b: '#2D447066' },  // bleu
  vae:       { t: 'var(--c-texte)', f: '#8B5CF624', b: '#8B5CF666' },  // violet
};

/* `franchie` dit si UN dossier a passé l'étape. Elle se LIT DES TRACES. */
export const ETAPES = [
  { cle: 'demande', label: 'Dates de la demande', court: 'Demande',
    aide: 'Une liasse reçue le même jour — la date décide du délai',
    franchie: d => !!(d.date_demande || d.date_reception) },
  { cle: 'recevabilite', label: 'Recevabilité', court: 'Recevabilité',
    aide: 'Contrôle de forme — traverse les unités',
    franchie: d => d.recevable != null },
  { cle: 'avis', label: 'Avis du chargé de cours', court: 'Avis',
    aide: 'Un avis, un auteur nommé, une cohorte homogène',
    franchie: d => !!d.avis_le },
  { cle: 'decision', label: 'Décision du Conseil', court: 'Décision',
    aide: 'Une séance : une section, une date',
    franchie: d => !!d.decision_le },
  { cle: 'validation', label: 'Validation direction', court: 'Validation',
    aide: 'Réservée à la direction et à la direction adjointe',
    franchie: d => !!d.valide_le },
];

const VERT = 'var(--c-reussi)', BRIQUE = 'var(--c-refuse)', GRIS = 'rgb(var(--gris-300))';   // les couleurs des états (3.1.264)

function etatEtape(d, cle) {
  if (cle === 'recevabilite' && d.recevable === 0) return 'refus';
  if (cle === 'decision' && d.decision_le && d.decision === 'refusee') return 'refus';
  return ETAPES.find(e => e.cle === cle)?.franchie(d) ? 'fait' : 'attente';
}

export function FriseCircuit({ dossier, compact = false }) {
  const etats = ETAPES.map(e => ({ ...e, etat: etatEtape(dossier, e.cle) }));
  /* LE TOUR DE QUI : la première étape qui attend. Une fois le circuit
     parcouru — ou fermé par un refus — il n'y en a plus, et c'est juste :
     personne n'attend plus rien. */
  const arret = etats.findIndex(e => e.etat === 'refus');
  const courante = arret >= 0 ? -1 : etats.findIndex(e => e.etat === 'attente');
  const libelle = arret >= 0
    ? (arret === 1 ? 'Irrecevable — refus de forme' : 'Refusée par le Conseil')
    : courante < 0 ? 'Circuit parcouru'
      : `En attente : ${etats[courante].court.toLowerCase()}`;

  return (
    <span className="inline-flex items-center gap-1.5 align-middle"
      title={etats.map((e, i) => `${i + 1}. ${e.court} — ${
        { fait: 'fait', refus: 'refus', attente: 'en attente' }[e.etat]}`).join('\n')}>
      <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
        {etats.map((e, i) => (
          <span key={e.cle}
            className={`rounded-full ${compact ? 'h-[5px] w-4' : 'h-[6px] w-5'}`}
            style={{
              background: e.etat === 'fait' ? VERT
                : e.etat === 'refus' ? BRIQUE : GRIS,
              /* Le liseré désigne le tour de qui. Il ne s'ajoute qu'à UNE
                 étape : deux repères ne repèrent plus rien. */
              boxShadow: i === courante ? '0 0 0 1.5px color-mix(in srgb, var(--c-reussi) 35%, transparent)' : 'none',
            }} />
        ))}
      </span>
      <span className={`${compact ? 'text-mention' : 'text-xs'} ${
        arret >= 0 ? 'text-iip-texte'
          : courante < 0 ? 'text-[color:var(--c-texte)]' : 'text-slate-500'}`}>
        {libelle}
      </span>
    </span>
  );
}

/** Ce que le Conseil a décidé, en mots — rien tant que `decision_le` est vide :
 *  `decision` vaut « accordee » et `type` « partielle » PAR DÉFAUT en base. */
export function decisionEnMots(v) {
  if (!v?.decision_le) return null;
  if (v.decision === 'refusee') return 'Refusée';
  if (v.type === 'admission') return 'Admission accordée';
  if (v.type === 'complete') return 'Dispense totale';
  const quoi = v.cible === 'aa' ? 'acquis' : v.cible === 'les_deux' ? 'cours et acquis' : 'cours';
  return `Dispense partielle${v.cible_detail ? ` — ${quoi} : ${v.cible_detail}` : ''}`;
}

export const LIBELLE_PORTE = { admission: 'AD', va: 'VA', vae: 'VAE' };

export function PastillePorte({ porte }) {
  const t = TEINTE_PORTE[porte];
  if (!t) return null;
  return <span className="text-mention font-semibold px-1.5 py-0.5 rounded"
    style={{ color: t.t, background: t.f, border: `1px solid ${t.b}` }}>{LIBELLE_PORTE[porte]}</span>;
}
