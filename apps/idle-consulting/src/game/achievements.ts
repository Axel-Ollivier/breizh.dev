// Achievements — chacun donne +1% production globale

import type { GameState } from './GameState';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  check: (state: GameState) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'ach-first-euro',
    name: 'Premier euro',
    description: 'Cliquer 1 fois',
    check: (s) => s.totalClicks >= 1,
  },
  {
    id: 'ach-freelance',
    name: 'Freelance en herbe',
    description: 'Atteindre 10 €/s',
    check: (s) => s.currentEps >= 10,
  },
  {
    id: 'ach-patron-pme',
    name: 'Patron de PME',
    description: 'Posséder 50 générateurs au total',
    check: (s) => {
      const total = Object.values(s.generators).reduce((sum, g) => sum + g.bought, 0);
      return total >= 50;
    },
  },
  {
    id: 'ach-usine-stagiaires',
    name: 'Usine à stagiaires',
    description: 'Posséder 100 Stagiaires',
    check: (s) => (s.generators[1]?.bought ?? 0) >= 100,
  },
  {
    id: 'ach-intercontrat-fini',
    name: "L'intercontrat, c'est fini",
    description: 'Posséder 10 Business Managers',
    check: (s) => (s.generators[5]?.bought ?? 0) >= 10,
  },
  {
    id: 'ach-serial-recruteur',
    name: 'Serial recruteur',
    description: 'Avoir 50 générateurs "recrutés"',
    check: (s) => {
      const total = Object.values(s.generators).reduce((sum, g) => sum + g.generated, 0);
      return total >= 50;
    },
  },
  {
    id: 'ach-premier-demenagement',
    name: 'Premier déménagement',
    description: 'Faire son premier prestige',
    check: (s) => s.totalPrestiges >= 1,
  },
  {
    id: 'ach-prestige-addict',
    name: 'Prestige addict',
    description: 'Faire 10 prestiges',
    check: (s) => s.totalPrestiges >= 10,
  },
  {
    id: 'ach-qui-est-patron',
    name: "C'est qui le patron ?",
    description: 'Acheter son premier PDG',
    check: (s) => (s.generators[10]?.bought ?? 0) >= 1,
  },
  {
    id: 'ach-loup-defense',
    name: 'Le loup de la Défense',
    description: 'Atteindre 1 trillion €/s',
    check: (s) => s.currentEps >= 1_000_000_000_000,
  },
  {
    id: 'ach-pas-besoin-cliquer',
    name: 'Pas besoin de cliquer',
    description: 'Atteindre 1 million €/s sans avoir cliqué cette run',
    check: (s) => s.currentEps >= 1_000_000 && s.clicksThisRun === 0,
  },
  {
    id: 'ach-grande-evasion',
    name: 'La grande évasion',
    description: 'Voir un "salarié qui démissionne" 10 fois',
    check: (s) => s.resignationCount >= 10,
  },
  {
    id: 'ach-vendeur-reves',
    name: 'Vendeur de rêves',
    description: 'Posséder 100 Business Managers',
    check: (s) => (s.generators[5]?.bought ?? 0) >= 100,
  },
  {
    id: 'ach-100-clicks',
    name: 'Clic-o-mane',
    description: 'Cliquer 100 fois',
    check: (s) => s.totalClicks >= 100,
  },
  {
    id: 'ach-1000-clicks',
    name: 'Syndrome du canal carpien',
    description: 'Cliquer 1 000 fois',
    check: (s) => s.totalClicks >= 1_000,
  },
  {
    id: 'ach-millionnaire',
    name: 'Millionnaire',
    description: 'Gagner 1 million € en une run',
    check: (s) => s.totalEurosThisRun >= 1_000_000,
  },
  {
    id: 'ach-milliardaire',
    name: 'Milliardaire',
    description: 'Gagner 1 milliard € en une run',
    check: (s) => s.totalEurosThisRun >= 1_000_000_000,
  },
];
