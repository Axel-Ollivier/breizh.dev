// Formatage des grands nombres pour l'affichage

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
  'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg',
];

export function formatNumber(n: number): string {
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 1000) {
    // Garde les décimales des petites valeurs (0.1 €/s du Stagiaire),
    // sinon elles s'affichent "0"
    if (Number.isInteger(n) || n >= 100) return Math.floor(n).toString();
    if (n < 10) return (Math.floor(n * 100) / 100).toString();
    return (Math.floor(n * 10) / 10).toString();
  }

  let tier = 0;
  let scaled = n;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier++;
  }

  // Affiche 3 chiffres significatifs max
  if (scaled >= 100) return Math.floor(scaled) + SUFFIXES[tier];
  if (scaled >= 10) return scaled.toFixed(1) + SUFFIXES[tier];
  return scaled.toFixed(2) + SUFFIXES[tier];
}

export function formatEuros(n: number): string {
  return formatNumber(n) + ' €';
}
