// Définitions des upgrades in-run (achetées en €, reset au prestige)

export interface UpgradeDef {
  id: string;
  name: string;
  cost: number;
  description: string;
  // Type d'upgrade
  type: 'click' | 'tier' | 'global';
  // Pour les upgrades de clic : multiplicateur du TJM
  clickMultiplier?: number;
  // Pour les upgrades de tier : tier concerné et multiplicateur
  tierTarget?: number;
  tierMultiplier?: number;
  // Pour les upgrades globales : multiplicateur global
  globalMultiplier?: number;
  // Condition de déblocage
  condition: UpgradeCondition;
}

export type UpgradeCondition =
  | { type: 'clicks'; count: number }
  | { type: 'generatorCount'; tierId: number; count: number }
  | { type: 'eps'; amount: number }; // €/s

// Upgrades de clic
export const CLICK_UPGRADES: UpgradeDef[] = [
  {
    id: 'click-1',
    name: 'Profil LinkedIn Complété',
    cost: 50,
    description: '×2 €/clic',
    type: 'click',
    clickMultiplier: 2,
    condition: { type: 'clicks', count: 50 },
  },
  {
    id: 'click-2',
    name: 'CV sur Monster.fr',
    cost: 500,
    description: '×2 €/clic',
    type: 'click',
    clickMultiplier: 2,
    condition: { type: 'clicks', count: 200 },
  },
  {
    id: 'click-3',
    name: 'Costume Cravate',
    cost: 5_000,
    description: '×3 €/clic',
    type: 'click',
    clickMultiplier: 3,
    condition: { type: 'clicks', count: 1_000 },
  },
  {
    id: 'click-4',
    name: 'Certif AWS',
    cost: 50_000,
    description: '×5 €/clic',
    type: 'click',
    clickMultiplier: 5,
    condition: { type: 'clicks', count: 5_000 },
  },
  {
    id: 'click-5',
    name: 'TJM Négocié à la Hausse',
    cost: 500_000,
    description: '×10 €/clic',
    type: 'click',
    clickMultiplier: 10,
    condition: { type: 'clicks', count: 25_000 },
  },
];

// Génère les upgrades par tier de générateur (4 par tier, ×2 chacune)
import { GENERATORS, TIER_UPGRADE_NAMES } from './generators';
import { TIER_UPGRADE_THRESHOLDS } from '../utils/constants';

function generateTierUpgrades(): UpgradeDef[] {
  const upgrades: UpgradeDef[] = [];

  for (const gen of GENERATORS) {
    const names = TIER_UPGRADE_NAMES[gen.id];
    for (let i = 0; i < TIER_UPGRADE_THRESHOLDS.length; i++) {
      const threshold = TIER_UPGRADE_THRESHOLDS[i];
      // Le coût = environ le prix de 10 générateurs au moment du déblocage
      // Approximation : baseCost * 1.12^threshold * 10
      const cost = Math.floor(gen.baseCost * Math.pow(1.12, threshold) * 10);
      upgrades.push({
        id: `tier-${gen.id}-${i}`,
        name: names[i],
        cost,
        description: `×2 production ${gen.name}`,
        type: 'tier',
        tierTarget: gen.id,
        tierMultiplier: 2,
        condition: { type: 'generatorCount', tierId: gen.id, count: threshold },
      });
    }
  }

  return upgrades;
}

export const TIER_UPGRADES: UpgradeDef[] = generateTierUpgrades();

// Upgrades globales
export const GLOBAL_UPGRADES: UpgradeDef[] = [
  {
    id: 'global-1',
    name: 'Salle de Réunion',
    cost: 30_000,
    description: '×1.5 production globale',
    type: 'global',
    globalMultiplier: 1.5,
    condition: { type: 'eps', amount: 1_000 },
  },
  {
    id: 'global-2',
    name: 'Distributeur de Snacks',
    cost: 200_000,
    description: '×1.5 production globale',
    type: 'global',
    globalMultiplier: 1.5,
    condition: { type: 'eps', amount: 5_000 },
  },
  {
    id: 'global-3',
    name: 'Afterwork Mensuel',
    cost: 2_000_000,
    description: '×2 production globale',
    type: 'global',
    globalMultiplier: 2,
    condition: { type: 'eps', amount: 50_000 },
  },
  {
    id: 'global-4',
    name: 'Séminaire Annuel',
    cost: 30_000_000,
    description: '×2 production globale',
    type: 'global',
    globalMultiplier: 2,
    condition: { type: 'eps', amount: 500_000 },
  },
  {
    id: 'global-5',
    name: 'Label Great Place to Work',
    cost: 500_000_000,
    description: '×3 production globale',
    type: 'global',
    globalMultiplier: 3,
    condition: { type: 'eps', amount: 5_000_000 },
  },
];

export const ALL_UPGRADES: UpgradeDef[] = [
  ...CLICK_UPGRADES,
  ...TIER_UPGRADES,
  ...GLOBAL_UPGRADES,
];
