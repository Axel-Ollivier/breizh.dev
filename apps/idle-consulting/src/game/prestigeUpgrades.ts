// Upgrades de prestige (achetées en ⭐, permanentes)

export interface PrestigeUpgradeDef {
  id: string;
  name: string;
  cost: number; // en ⭐
  description: string;
  requiredPrestiges: number; // nombre minimum de prestiges effectués
  // Effets possibles
  globalMultiplier?: number;
  clickMultPerPrestige?: number; // +X% par prestige effectué
  tierRangeMultiplier?: { minTier: number; maxTier: number; multiplier: number };
  upgradeCostReduction?: number; // réduction en % du coût des upgrades in-run
  reputationMultiplier?: number; // multiplicateur de réputation
  startingGenerators?: { tierId: number; count: number }[];
  generatorOfGeneratorMultiplier?: number; // multiplicateur pour les gen-de-gen
  baseCostReduction?: number; // réduction en % du coût de base des générateurs
  startingProductionPercent?: number; // % du €/s du run précédent pendant 60s
  afkMultiplier?: boolean; // déblocage du gain AFK
}

export const PRESTIGE_UPGRADES: PrestigeUpgradeDef[] = [
  {
    id: 'prestige-nespresso',
    name: 'Machine Nespresso',
    cost: 1,
    description: '×1.5 production globale permanente',
    requiredPrestiges: 0,
    globalMultiplier: 1.5,
  },
  {
    id: 'prestige-babyfoot',
    name: 'Baby-Foot',
    cost: 3,
    description: '×2 production globale permanente',
    requiredPrestiges: 0,
    globalMultiplier: 2,
  },
  {
    id: 'prestige-cooptation',
    name: 'Prime de Cooptation',
    cost: 5,
    description: 'Les Chargés de Recrutement produisent ×2 plus vite',
    requiredPrestiges: 0,
    tierRangeMultiplier: { minTier: 4, maxTier: 4, multiplier: 2 },
  },
  {
    id: 'prestige-cse',
    name: 'Comité Social et Économique',
    cost: 8,
    description: '+10% €/clic permanent par prestige effectué',
    requiredPrestiges: 2,
    clickMultPerPrestige: 0.1,
  },
  {
    id: 'prestige-happiness',
    name: 'Happiness Manager',
    cost: 12,
    description: '×2 production de tous les tiers ≤ 5',
    requiredPrestiges: 2,
    tierRangeMultiplier: { minTier: 1, maxTier: 5, multiplier: 2 },
  },
  {
    id: 'prestige-creche',
    name: "Crèche d'Entreprise",
    cost: 18,
    description: '×2 production de tous les tiers ≥ 6',
    requiredPrestiges: 3,
    tierRangeMultiplier: { minTier: 6, maxTier: 10, multiplier: 2 },
  },
  {
    id: 'prestige-teambuilding',
    name: 'Team Building Laser Game',
    cost: 25,
    description: 'Les upgrades in-run coûtent 10% moins cher',
    requiredPrestiges: 3,
    upgradeCostReduction: 0.1,
  },
  {
    id: 'prestige-keynote',
    name: 'Keynote au Salon du Consulting',
    cost: 35,
    description: '×3 Réputation gagnée au prochain prestige',
    requiredPrestiges: 4,
    reputationMultiplier: 3,
  },
  {
    id: 'prestige-graduate',
    name: 'Programme Graduate',
    cost: 50,
    description: 'Commence chaque run avec 5 Stagiaires et 2 CJ gratuits',
    requiredPrestiges: 5,
    startingGenerators: [
      { tierId: 1, count: 5 },
      { tierId: 2, count: 2 },
    ],
  },
  {
    id: 'prestige-linkedin-recruiter',
    name: 'Abonnement LinkedIn Recruiter',
    cost: 70,
    description: 'Les générateurs "de générateurs" produisent ×3',
    requiredPrestiges: 5,
    generatorOfGeneratorMultiplier: 3,
  },
  {
    id: 'prestige-iso',
    name: 'Certification ISO 27001',
    cost: 100,
    description: '×3 production globale permanente',
    requiredPrestiges: 6,
    globalMultiplier: 3,
  },
  {
    id: 'prestige-marque',
    name: 'Marque Employeur',
    cost: 150,
    description: 'Le coût de base de tous les générateurs est réduit de 15%',
    requiredPrestiges: 7,
    baseCostReduction: 0.15,
  },
  {
    id: 'prestige-ecole',
    name: "Partenariat École d'Ingé",
    cost: 200,
    description: 'Commence chaque run avec 10% du €/s du run précédent pendant 60s',
    requiredPrestiges: 8,
    startingProductionPercent: 0.1,
  },
  {
    id: 'prestige-accord',
    name: 'Accord-Cadre Grand Compte',
    cost: 300,
    description: '×5 production globale permanente',
    requiredPrestiges: 9,
    globalMultiplier: 5,
  },
  {
    id: 'prestige-bourse',
    name: 'Introduction en Bourse',
    cost: 500,
    description: 'Gains hors-ligne : +1% par minute d\'absence (cap ×10)',
    requiredPrestiges: 10,
    afkMultiplier: true,
  },
];
