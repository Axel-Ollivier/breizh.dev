// Définitions des 10 tiers de générateurs

export interface GeneratorDef {
  id: number;
  name: string;
  baseCost: number;
  baseProduction: number; // €/s
  flavorText: string;
  // Générateur de générateurs : produit des unités d'un tier inférieur
  producesGenerator?: {
    targetTier: number; // id du tier produit
    rate: number; // unités/s par générateur possédé
  };
  // Multiplicateur global par unité possédée
  globalMultPerUnit?: number;
}

export const GENERATORS: GeneratorDef[] = [
  {
    id: 1,
    name: 'Stagiaire',
    baseCost: 10,
    baseProduction: 0.1,
    flavorText: 'Il fait les reporting Excel. Et le café.',
  },
  {
    id: 2,
    name: 'Consultant Junior',
    baseCost: 100,
    baseProduction: 0.8,
    flavorText: "3 ans d'expérience. 5 selon son CV.",
  },
  {
    id: 3,
    name: 'Consultant Senior',
    baseCost: 1_100,
    baseProduction: 6.4,
    flavorText: 'Il a vu des choses. Des migrations Java 6.',
  },
  {
    id: 4,
    name: 'Chargé de Recrutement',
    baseCost: 12_000,
    baseProduction: 51,
    flavorText: 'Il spam LinkedIn. Ça marche.',
    producesGenerator: { targetTier: 1, rate: 0.05 },
  },
  {
    id: 5,
    name: 'Business Manager',
    baseCost: 130_000,
    baseProduction: 410,
    flavorText: "Il n'a jamais codé. Il ne comprend pas pourquoi c'est un problème.",
    globalMultPerUnit: 0.015, // +1.5% par BM
  },
  {
    id: 6,
    name: 'Account Manager',
    baseCost: 1_400_000,
    baseProduction: 3_300,
    flavorText: "Le client l'adore. Le client ne sait pas ce qu'il fait.",
  },
  {
    id: 7,
    name: 'Responsable RH',
    baseCost: 15_000_000,
    baseProduction: 26_000,
    flavorText: 'Fait signer les ruptures conventionnelles avec le sourire.',
    producesGenerator: { targetTier: 2, rate: 0.1 },
  },
  {
    id: 8,
    name: "Directeur d'Agence",
    baseCost: 160_000_000,
    baseProduction: 210_000,
    flavorText: "Il ouvre des agences en région. Pourquoi ? Parce que.",
    globalMultPerUnit: 0.01, // +1% par DA
  },
  {
    id: 9,
    name: 'Directeur Commercial',
    baseCost: 1_700_000_000,
    baseProduction: 1_700_000,
    flavorText: 'Son réseau LinkedIn est une arme de destruction massive.',
    producesGenerator: { targetTier: 5, rate: 0.05 },
  },
  {
    id: 10,
    name: 'PDG (Toi-même)',
    baseCost: 18_000_000_000,
    baseProduction: 13_500_000,
    flavorText: 'Tu te clones. Le conseil d\'administration ne voit pas la différence.',
    globalMultPerUnit: 0.02, // +2% par PDG
  },
];

// Noms des upgrades par tier (6 upgrades par tier, débloquées à 10/25/50/100/200/400)
export const TIER_UPGRADE_NAMES: Record<number, string[]> = {
  1: ['Écran supplémentaire', 'Accès au VPN', 'Formation Excel Avancé', 'Convention de stage illimitée', 'Amphi de pré-embauche', 'Partenariat toutes écoles de commerce'],
  2: ['Chaise ergonomique', 'Double écran', 'Carte Navigo remboursée', 'Prime de mission', 'Badge "3 ans d\'XP" automatique', 'Uniforme costume-baskets'],
  3: ['Certification Scrum', 'Télétravail 2j/semaine', 'MacBook Pro', 'Forfait consultant premium', 'Titre de Principal Consultant', 'Détachement chez le client à vie'],
  4: ['Accès LinkedIn premium', 'Base de CV centralisée', 'Bot de sourcing', 'IA de matching', 'Scraping massif de CVthèques', 'Jumeau numérique de recruteur'],
  5: ['CRM Salesforce', 'Carte de visite dorée', 'Bureau fermé', 'Voiture de fonction', 'Pipeline Excel prévisionnel', 'École interne de Business Managers'],
  6: ['Déjeuner client illimité', 'Carte Amex Gold', 'Assistant personnel', 'Club affaires', 'Loge VIP au Stade de France', 'Séminaire à Dubaï'],
  7: ['Logiciel SIRH', 'Team building budget', 'Programme bien-être', 'Marque employeur premium', 'Chief Happiness Officer en chef', 'Open badges bien-être'],
  8: ['Chauffeur privé', 'Bureau panoramique', 'Carte noire', 'Jet privé régional', 'Fusion-acquisition régionale', 'Agence sur la Lune'],
  9: ['Réseau alumni', 'Conférence TED', 'Carnet d\'adresses ministériel', 'Accord-cadre exclusif', 'Dîner annuel du MEDEF', 'Lobby au Parlement européen'],
  10: ['Conseil d\'administration', 'Golden parachute', 'Yacht de motivation', 'Clone quantique', 'Conseil des sages clonés', 'Singularité managériale'],
};
