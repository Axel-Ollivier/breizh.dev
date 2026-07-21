// Logique de prestige et calcul de réputation

export const OFFICE_LEVELS = [
  { prestige: 0, name: 'Garage', title: 'Freelance' },
  { prestige: 1, name: 'Coworking', title: 'Auto-entrepreneur' },
  { prestige: 2, name: 'Bureau partagé', title: 'Micro-ESN' },
  { prestige: 3, name: 'Petit open space', title: 'SARL' },
  { prestige: 4, name: 'Étage complet', title: 'SAS' },
  { prestige: 5, name: 'Deux étages', title: 'ESN régionale' },
  { prestige: 6, name: 'Immeuble entier', title: 'ESN nationale' },
  { prestige: 7, name: 'Campus', title: 'Groupe' },
  { prestige: 8, name: 'Tour de la Défense', title: 'Licorne' },
  { prestige: 9, name: 'Siège mondial', title: 'CAC 40' },
  { prestige: 10, name: 'Station spatiale', title: 'Monopole galactique' },
];

export function getOfficeLevel(totalPrestiges: number) {
  const index = Math.min(totalPrestiges, OFFICE_LEVELS.length - 1);
  return OFFICE_LEVELS[index];
}

export function getReputationGained(totalEurosThisRun: number, reputationMultiplier: number): number {
  return Math.floor(Math.pow(totalEurosThisRun / 1_000_000_000, 0.5) * reputationMultiplier);
}
