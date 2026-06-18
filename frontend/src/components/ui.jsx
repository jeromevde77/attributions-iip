// Composants UI partagés — système de design IIP harmonisé.
// Couleurs : bleu marine #1B2B4B (iip-blue), turquoise #00AACC (iip-turquoise), rouge #C0392B (danger).
// Police : Inter (définie globalement dans index.css).

// En-tête de page standard : icône turquoise + titre bleu marine + sous-titre.
export function PageHeader({ icon: Icon, titre, sous, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-center gap-3">
        {Icon && <Icon size={24} className="text-iip-turquoise flex-shrink-0" stroke={1.8} />}
        <div>
          <h1 className="text-xl font-title text-iip-blue leading-tight">{titre}</h1>
          {sous && <p className="text-[13px] text-gray-400 mt-0.5">{sous}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// Barre d'onglets harmonisée. items = [{ key, label, icon }]. value = clé active.
export function Tabs({ items, value, onChange }) {
  return (
    <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
      {items.map(({ key, label, icon: Icon }) => {
        const actif = value === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] whitespace-nowrap border-b-2 -mb-px transition-colors duration-150
              ${actif
                ? 'border-iip-turquoise text-iip-blue font-semibold'
                : 'border-transparent text-gray-500 hover:text-iip-blue'}`}>
            {Icon && <Icon size={17} stroke={1.8} className={actif ? 'text-iip-turquoise' : ''} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Bouton harmonisé. variant : 'primary' | 'secondary' | 'accent' | 'danger' | 'danger-soft' | 'ghost'
export function Btn({ variant = 'secondary', icon: Icon, children, className = '', ...props }) {
  const base = 'inline-flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-lg transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary:      'bg-iip-blue text-white hover:bg-iip-blue-dark',
    secondary:    'bg-white text-iip-blue border border-slate-300 hover:bg-slate-50',
    accent:       'bg-iip-turquoise text-white hover:bg-iip-turquoise-dark',
    danger:       'bg-iip-danger text-white hover:brightness-110',
    'danger-soft':'bg-white text-iip-danger border border-red-200 hover:bg-red-50',
    ghost:        'text-gray-500 hover:text-iip-blue hover:bg-slate-100',
  };
  return (
    <button className={`${base} ${variants[variant] || variants.secondary} ${className}`} {...props}>
      {Icon && <Icon size={16} stroke={1.8} />}
      {children}
    </button>
  );
}

// Carte KPI sobre. couleur : valeur affichée (sémantique). 'neutral'|'warn'|'good'|'bad'
export function KpiCard({ label, valeur, sous, ton = 'neutral' }) {
  const tons = {
    neutral: 'text-iip-blue',
    warn: 'text-amber-600',
    good: 'text-emerald-700',
    bad: 'text-iip-danger',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
      <div className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tons[ton] || tons.neutral}`}>{valeur}</div>
      {sous && <div className="text-[11px] text-gray-400 mt-0.5">{sous}</div>}
    </div>
  );
}

// Rail latéral « glissant » partagé.
// Étroit (icônes seules) par défaut, s'élargit au survol PAR-DESSUS le contenu
// (positionné en absolute) pour ne pas faire sauter la zone de travail centrale.
// Le conteneur parent doit être `relative` et le contenu décalé de `ml-16`.
//   icon       : composant icône d'en-tête (turquoise)
//   titre      : titre de l'en-tête (blanc, visible au survol)
//   sousTitre  : petite ligne sous le titre (optionnel)
//   extra      : noeud rendu sous l'en-tête (ex. déroulant année) — visible au survol
//   sections   : [{ label?, items: [{ key, label, icon, actif, onClick }] }]
export function RailLateral({ icon: HeaderIcon, titre, sousTitre, extra, sections = [] }) {
  const reveal = 'whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity duration-150';
  return (
    <aside
      className="group/rail absolute left-0 top-0 h-full w-16 hover:w-60 z-20
                 bg-iip-blue overflow-hidden transition-[width] duration-200 ease-out
                 flex flex-col py-4 hover:shadow-xl hover:shadow-black/20">
      {/* En-tête */}
      <div className="flex items-center gap-3 px-4 mb-1 text-white flex-shrink-0">
        {HeaderIcon && <HeaderIcon size={22} className="text-iip-turquoise flex-shrink-0" />}
        <span className={`text-[15px] font-semibold ${reveal}`}>{titre}</span>
      </div>
      {sousTitre && <div className={`px-4 h-4 text-[11px] text-white/40 ${reveal}`}>{sousTitre}</div>}
      {extra && <div className={`px-3 pt-2 ${reveal}`}>{extra}</div>}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 mt-2">
        {sections.map((sec, si) => (
          <div key={si} className="mb-3">
            {sec.label && (
              <div className={`px-1.5 mt-2 mb-1 h-4 text-[10px] font-semibold uppercase tracking-wider text-white/40 ${reveal}`}>
                {sec.label}
              </div>
            )}
            {sec.items.map(it => {
              const Ic = it.icon;
              return (
                <button key={it.key} onClick={it.onClick} title={it.label}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] mb-0.5 transition-colors duration-150
                    ${it.actif
                      ? 'bg-iip-turquoise text-white font-semibold'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
                  {Ic && <Ic size={18} stroke={1.8} className="flex-shrink-0" />}
                  <span className={`text-left leading-tight ${reveal}`}>{it.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
