import { NavLink } from 'react-router-dom';
import {
  IconChevronLeft, IconChevronRight, IconLogout,
} from '@tabler/icons-react';

/**
 * Volet latéral de navigation.
 *
 * Sept axes en bandeau horizontal se lisaient mal, et empilés sans regroupement
 * guère mieux : ils se rangent ici en trois familles. Ce qui relève de la
 * NAVIGATION passe à gauche ; ce qui relève du CONTEXTE de travail — année
 * active, recherche, compte — reste dans la barre du haut, car on y touche en
 * permanence.
 *
 * Le volet se replie en icônes seules : sur un portable, 210 px pris à la
 * largeur se paient sur les tableaux, qui en sont friands.
 */
export default function VoletLateral({
  familles, replie, onReplier, u, nbNotifs, versionNum, versionIsNew,
  onDeconnexion, ouvertMobile, onFermerMobile,
}) {
  const largeur = replie ? 'w-[60px]' : 'w-[210px]';

  const lien = ([to, libelle, Icon]) => (
    <NavLink key={to} to={to} end={to === '/'} onClick={onFermerMobile}
      title={replie ? libelle : undefined}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
          replie ? 'justify-center' : ''} ${
          isActive ? 'bg-iip-turquoise/10 text-iip-blue font-semibold'
                   : 'text-gray-600 hover:text-iip-blue hover:bg-gray-100'}`}>
      <span className="relative flex-shrink-0">
        {Icon && <Icon size={18} stroke={1.8} />}
        {to === '/accueil' && nbNotifs > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full
                           text-[8px] text-white flex items-center justify-center font-bold">
            {nbNotifs > 9 ? '9+' : nbNotifs}
          </span>
        )}
      </span>
      {!replie && <span className="truncate">{libelle}</span>}
    </NavLink>
  );

  return (
    <>
      {/* Sur mobile, le volet se superpose plutôt que de rogner la page. */}
      {ouvertMobile && (
        <div onClick={onFermerMobile}
          className="md:hidden fixed inset-0 bg-black/30 z-30" />
      )}

      <aside className={`${largeur} flex-none bg-white border-r border-iip-gold/30
        flex flex-col transition-[width] duration-150
        ${ouvertMobile
          ? 'fixed inset-y-0 left-0 z-40 w-[240px] shadow-xl'
          : 'hidden md:flex'}`}>

        <div className={`flex items-center gap-2 px-3 py-3 border-b border-gray-100
                         ${replie ? 'justify-center' : ''}`}>
          <LogoLucie compact={replie} />
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {familles.map(({ titre, entrees }) => (
            entrees.length > 0 && (
              <div key={titre} className="mb-1">
                {!replie && titre && (
                  <div className="text-[10px] uppercase tracking-wide text-gray-400
                                  font-semibold px-2.5 pt-2.5 pb-1">{titre}</div>
                )}
                {replie && titre && <div className="border-t border-gray-100 my-2" />}
                {entrees.map(lien)}
              </div>
            )
          ))}
        </nav>

        <div className="p-2 border-t border-gray-100">
          {!replie && (
            <div className="px-2.5 pb-1.5 text-[11px] text-gray-500 truncate">
              {u?.nom || u?.email}
              <span className="text-iip-turquoise font-semibold"> · {u?.role}</span>
            </div>
          )}
          <button onClick={onDeconnexion}
            title={replie ? 'Déconnexion' : undefined}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm
                        text-gray-500 hover:text-iip-danger hover:bg-gray-100
                        ${replie ? 'justify-center' : ''}`}>
            <IconLogout size={17} />
            {!replie && <span>Déconnexion</span>}
          </button>

          <div className="flex items-center justify-between mt-1 px-1">
            {!replie && (
              <span className={`bg-iip-blue text-white font-semibold px-2 py-0.5 rounded-md
                                text-[10px] tracking-wide ${versionIsNew ? 'version-badge-new' : ''}`}
                title={versionIsNew ? 'Nouvelle version déployée !' : `Version ${versionNum}`}>
                v{versionNum}
              </span>
            )}
            <button onClick={onReplier}
              title={replie ? 'Déplier le volet' : 'Replier le volet'}
              className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg
                         text-gray-400 hover:text-iip-blue hover:bg-gray-100 ml-auto">
              {replie ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function LogoLucie({ compact }) {
  return (
    <svg width={compact ? 30 : 90} height={compact ? 30 : 28}
      viewBox={compact ? '0 0 46 40' : '0 0 140 44'} xmlns="http://www.w3.org/2000/svg">
      <g stroke="#1B2B4B" strokeOpacity=".06" fill="none" strokeWidth="1.2" strokeLinecap="round">
        <line x1="5" y1="14" x2="12" y2="6" /><line x1="5" y1="14" x2="16" y2="23" />
        <line x1="12" y1="6" x2="23" y2="8" /><line x1="16" y1="23" x2="23" y2="8" />
        <line x1="16" y1="23" x2="23" y2="32" /><line x1="23" y1="8" x2="36" y2="14" />
        <line x1="36" y1="14" x2="42" y2="32" />
      </g>
      <g stroke="#00AACC" strokeOpacity=".35" fill="none" strokeWidth="1.2" strokeLinecap="round">
        <line x1="5" y1="14" x2="16" y2="23" /><line x1="12" y1="6" x2="23" y2="8" />
        <line x1="16" y1="23" x2="23" y2="32" /><line x1="23" y1="8" x2="36" y2="14" />
        <line x1="23" y1="32" x2="42" y2="32" />
      </g>
      <g stroke="#00AACC" strokeOpacity=".85" fill="none" strokeWidth="2.2" strokeLinecap="round">
        <line x1="12" y1="6" x2="12" y2="32" /><line x1="12" y1="32" x2="42" y2="32" />
      </g>
      <circle cx="5" cy="14" r="1.8" fill="#1B2B4B" fillOpacity=".1" />
      <circle cx="23" cy="8" r="1.8" fill="#1B2B4B" fillOpacity=".12" />
      <circle cx="36" cy="14" r="1.6" fill="#1B2B4B" fillOpacity=".08" />
      <circle cx="16" cy="23" r="1.8" fill="#00AACC" fillOpacity=".5" />
      <circle cx="12" cy="6" r="3.2" fill="#00AACC" />
      <circle cx="12" cy="32" r="3.6" fill="#00AACC" />
      <circle cx="42" cy="32" r="3.2" fill="#00AACC" />
      <circle cx="12" cy="6" r="1.4" fill="white" fillOpacity=".7" />
      <circle cx="12" cy="32" r="1.6" fill="white" fillOpacity=".65" />
      <circle cx="42" cy="32" r="1.4" fill="white" fillOpacity=".7" />
      {!compact && (
        <text x="52" y="30" fontFamily="'Segoe UI','Helvetica Neue',Arial,sans-serif"
          fontSize="22" fontWeight="700" letterSpacing="-0.5" fill="#1B2B4B">Lucie</text>
      )}
    </svg>
  );
}
