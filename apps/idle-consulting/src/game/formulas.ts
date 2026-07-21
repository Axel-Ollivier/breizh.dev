// Formules de coût et de production

import { COST_GROWTH_RATE } from '../utils/constants';

// Coût du prochain générateur (basé uniquement sur les achats manuels)
export function getGeneratorCost(baseCost: number, owned: number, baseCostReduction: number): number {
  const effectiveBaseCost = baseCost * (1 - baseCostReduction);
  return Math.floor(effectiveBaseCost * Math.pow(COST_GROWTH_RATE, owned));
}

// Coût pour acheter N générateurs d'un coup
export function getGeneratorBulkCost(baseCost: number, owned: number, count: number, baseCostReduction: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += getGeneratorCost(baseCost, owned + i, baseCostReduction);
  }
  return total;
}

// Production d'un tier de générateur
export function getTierProduction(
  baseProduction: number,
  totalOwned: number, // achetés + générés
  tierMultiplier: number,
  globalMultiplier: number,
): number {
  return baseProduction * totalOwned * tierMultiplier * globalMultiplier;
}
