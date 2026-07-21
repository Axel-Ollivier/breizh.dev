// Événements aléatoires (Golden Cookies ESN-style)

export interface GameEventDef {
  id: string;
  name: string;
  description: string;
  type: 'positive' | 'negative';
  // Durée de l'effet en ms (0 = instantané)
  effectDuration: number;
  // Effets
  productionMultiplier?: number;
  clickMultiplier?: number;
  loseGeneratorPercent?: { highestTier: true; percent: number };
  instantGainPercent?: number; // % du total gagné cette run
  doubleRandomHighTier?: boolean;
}

export const EVENTS: GameEventDef[] = [
  {
    id: 'event-appel-offres',
    name: "Appel d'offres remporté",
    description: '×7 production pendant 30s !',
    type: 'positive',
    effectDuration: 30_000,
    productionMultiplier: 7,
  },
  {
    id: 'event-buzz-linkedin',
    name: 'Buzz LinkedIn',
    description: '×777 €/clic pendant 15s !',
    type: 'positive',
    effectDuration: 15_000,
    clickMultiplier: 777,
  },
  {
    id: 'event-demission',
    name: 'Salarié qui démissionne',
    description: 'Perte de 5% des générateurs du tier le plus élevé',
    type: 'negative',
    effectDuration: 0,
    loseGeneratorPercent: { highestTier: true, percent: 0.05 },
  },
  {
    id: 'event-urssaf',
    name: 'Contrôle URSSAF',
    description: 'Production divisée par 2 pendant 20s',
    type: 'negative',
    effectDuration: 20_000,
    productionMultiplier: 0.5,
  },
  {
    id: 'event-renouvellement',
    name: 'Client qui renouvelle',
    description: 'Gain instantané = 10% du total gagné cette run',
    type: 'positive',
    effectDuration: 0,
    instantGainPercent: 0.1,
  },
  {
    id: 'event-chasseur',
    name: 'Chasseur de têtes',
    description: 'Un générateur aléatoire tier 4+ est doublé pendant 60s',
    type: 'positive',
    effectDuration: 60_000,
    doubleRandomHighTier: true,
  },
];

// Ratio 4:1 positif/négatif — on pondère la sélection
export function pickRandomEvent(): GameEventDef {
  const positives = EVENTS.filter(e => e.type === 'positive');
  const negatives = EVENTS.filter(e => e.type === 'negative');

  // 80% de chance d'avoir un positif, 20% un négatif
  if (Math.random() < 0.8) {
    return positives[Math.floor(Math.random() * positives.length)];
  }
  return negatives[Math.floor(Math.random() * negatives.length)];
}
