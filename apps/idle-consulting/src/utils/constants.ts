// Constantes du jeu

// Taux de croissance des coûts des générateurs
export const COST_GROWTH_RATE = 1.12;

// Diviseur pour le calcul de la réputation
export const REPUTATION_DIVISOR = 1_000_000_000;

// Intervalle de sauvegarde automatique (ms)
export const AUTO_SAVE_INTERVAL = 30_000;

// Durée d'affichage des événements (ms)
export const EVENT_DISPLAY_DURATION = 12_000;

// Intervalle entre événements (ms) - entre 2 et 5 minutes
export const EVENT_MIN_INTERVAL = 120_000;
export const EVENT_MAX_INTERVAL = 300_000;

// Seuils de déblocage des tiers
// Un tier est visible quand le joueur a 10% du coût de base OU 5+ du tier précédent
export const TIER_UNLOCK_COST_RATIO = 0.1;
export const TIER_UNLOCK_PREV_COUNT = 5;

// Seuils d'upgrades par tier (nombre de générateurs possédés)
export const TIER_UPGRADE_THRESHOLDS = [10, 25, 50, 100, 200, 400];

// Gains hors-ligne : 50% du taux, plafonnés à 8h, ignorés sous 60s
export const OFFLINE_RATE = 0.5;
export const OFFLINE_CAP_MS = 8 * 3600 * 1000;
export const OFFLINE_MIN_MS = 60_000;

// Bonus passif de production par ⭐ gagnée (dépensée ou non)
export const REPUTATION_PASSIVE_BONUS = 0.02;

// Au-delà de ce nombre d'unités, les bonus globaux par unité (BM, DA, PDG)
// passent en rendement dégressif (racine carrée)
export const GLOBAL_MULT_SOFT_CAP = 100;

// Clé de sauvegarde localStorage
export const SAVE_KEY = 'esn-idle-save';
