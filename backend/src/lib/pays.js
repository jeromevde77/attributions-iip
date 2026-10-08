/**
 * LES PAYS, CÔTÉ SERVEUR — même liste que frontend/src/lib/pays.js (ISO 3166,
 * noms français d'Intl.DisplayNames), et la reconnaissance de ce qui a été
 * tapé avant la liste : « Camerounaise », « CAMEROUN », « BurkinaFaso »…
 * (3 octobre 2026).
 */
const CODES = ('AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW').split(' ');

let noms = null;
export function nomsPays() {
  if (noms) return noms;
  let f = c => c;
  try { const dn = new Intl.DisplayNames(['fr'], { type: 'region' }); f = c => dn.of(c) || c; } catch { /* */ }
  noms = new Map(CODES.map(c => [c, f(c)]));
  return noms;
}

const plat = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/* Les adjectifs de nationalité, au masculin ; le féminin se déduit. Ceux qui
   désignent deux pays (« congolais ») n'y sont pas : ils restent « à revoir ». */
const ADJ = {
  belge: 'BE', francais: 'FR', camerounais: 'CM', marocain: 'MA', espagnol: 'ES', turc: 'TR', turque: 'TR',
  togolais: 'TG', syrien: 'SY', slovaque: 'SK', roumain: 'RO', portugais: 'PT', palestinien: 'PS',
  luxembourgeois: 'LU', allemand: 'DE', algerien: 'DZ', italien: 'IT', tunisien: 'TN', senegalais: 'SN',
  ivoirien: 'CI', guineen: 'GN', burkinabe: 'BF', malien: 'ML', beninois: 'BJ', gabonais: 'GA', nigerian: 'NG',
  polonais: 'PL', neerlandais: 'NL', hollandais: 'NL', britannique: 'GB', anglais: 'GB', americain: 'US', russe: 'RU',
  ukrainien: 'UA', albanais: 'AL', grec: 'GR', grecque: 'GR', bulgare: 'BG', tchadien: 'TD', rwandais: 'RW',
  burundais: 'BI', haitien: 'HT', bresilien: 'BR', chinois: 'CN', indien: 'IN', pakistanais: 'PK', afghan: 'AF',
  irakien: 'IQ', iranien: 'IR', libanais: 'LB', egyptien: 'EG', mauritanien: 'MR', djiboutien: 'DJ',
  comorien: 'KM', malgache: 'MG', centrafricain: 'CF', kosovar: 'XK', serbe: 'RS', bosnien: 'BA',
  macedonien: 'MK', armenien: 'AM', georgien: 'GE', suisse: 'CH', autrichien: 'AT', hongrois: 'HU',
  tcheque: 'CZ', croate: 'HR', slovene: 'SI', lituanien: 'LT', letton: 'LV', estonien: 'EE', irlandais: 'IE',
  danois: 'DK', suedois: 'SE', norvegien: 'NO', finlandais: 'FI', colombien: 'CO', peruvien: 'PE',
  venezuelien: 'VE', cubain: 'CU', dominicain: 'DO', equatorien: 'EC', bolivien: 'BO', chilien: 'CL',
  argentin: 'AR', mexicain: 'MX', canadien: 'CA', vietnamien: 'VN', philippin: 'PH', thailandais: 'TH',
  japonais: 'JP', coreen: 'KR', somalien: 'SO', ethiopien: 'ET', erythreen: 'ER', soudanais: 'SD',
  kenyan: 'KE', ghaneen: 'GH', angolais: 'AO', mozambicain: 'MZ', sudafricain: 'ZA', nigerien: 'NE',
  libyen: 'LY', jordanien: 'JO', saoudien: 'SA', yemenite: 'YE', cap: 'CV', capverdien: 'CV', moldave: 'MD',
};
/* Ce qu'Intl n'écrit pas comme les gens : « Congo - Kinshasa » pour la RDC… */
const VARIANTES = {
  democraticrepublicofthecongo: 'CD', democraticrepublicofcongo: 'CD', drcongo: 'CD', drc: 'CD', rdc: 'CD', rdcongo: 'CD',
  republiquedemocratiqueducongo: 'CD', congokinshasa: 'CD', zaire: 'CD',
  republicofthecongo: 'CG', republicofcongo: 'CG', congobrazzaville: 'CG', republiqueducongo: 'CG',
  ivorycoast: 'CI', cotedivoire: 'CI', unitedstatesofamerica: 'US', usa: 'US', uk: 'GB', greatbritain: 'GB',
  england: 'GB', angleterre: 'GB', holland: 'NL', hollande: 'NL', turkiye: 'TR', czechia: 'CZ', czechrepublic: 'CZ',
  republiquetcheque: 'CZ', capeverde: 'CV', burma: 'MM', swaziland: 'SZ', macedonia: 'MK', northmacedonia: 'MK',
  southkorea: 'KR', northkorea: 'KP', russia: 'RU', syria: 'SY', iran: 'IR', vietnam: 'VN', laos: 'LA',
  palestine: 'PS', tanzania: 'TZ', moldova: 'MD', bolivia: 'BO', venezuela: 'VE',
};
const feminin = m => (m.endsWith('ien') || m.endsWith('een') ? m + 'ne' : m.endsWith('e') ? m : m + 'e');

let index = null;
function indexer() {
  if (index) return index;
  index = new Map();
  for (const [c, n] of nomsPays()) index.set(plat(n), c);
  for (const [m, c] of Object.entries(ADJ)) { index.set(m, c); index.set(feminin(m), c); }
  /* LES NOMS ANGLAIS ET NÉERLANDAIS AUSSI (Charles, 8 octobre 2026 : « c'est
     évident, c'est de l'anglais ») — « Belgium », « Cameroon », « Morocco »
     viennent d'eCampus ou d'un formulaire en ligne. Un nom français déjà
     indexé garde la main. */
  for (const lang of ['en', 'nl']) {
    try {
      const dn = new Intl.DisplayNames([lang], { type: 'region' });
      for (const c of CODES) { const k = plat(dn.of(c)); if (k && !index.has(k)) index.set(k, c); }
    } catch { /* ICU réduit */ }
  }
  for (const [k, c] of Object.entries(VARIANTES)) if (!index.has(k)) index.set(k, c);
  return index;
}

/** Le pays reconnu pour une saisie libre : { code, nom } ou null. */
export function paysDe(saisie) {
  const p = plat(saisie);
  if (!p) return null;
  const c = indexer().get(p);
  return c ? { code: c, nom: nomsPays().get(c) } : null;
}
export const estUnPays = n => [...nomsPays().values()].includes(n);
