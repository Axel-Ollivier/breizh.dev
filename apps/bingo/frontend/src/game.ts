import type { Combination, Player, Snapshot } from "./types";

export const palette = [
  { name: "Pêche", value: "#f4c9b6" },
  { name: "Rose", value: "#edbfd4" },
  { name: "Lavande", value: "#d0c5ee" },
  { name: "Myrtille", value: "#bdcdec" },
  { name: "Ciel", value: "#b9deef" },
  { name: "Menthe", value: "#b8e0d1" },
  { name: "Pistache", value: "#d0e3ad" },
  { name: "Citron", value: "#f0e5a8" },
  { name: "Abricot", value: "#f2d09e" },
  { name: "Lin", value: "#d9cabb" },
];
export function colorValue(color: number | null | undefined) {
  return color == null ? "#ebe9e2" : (palette[color]?.value ?? "#ebe9e2");
}
export function rankPlayers(players: Player[]) {
  return [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr"),
  );
}
export function combinationLabel(combination: Combination) {
  if (combination.kind === "row") return `Ligne ${combination.index + 1}`;
  if (combination.kind === "column") return `Colonne ${combination.index + 1}`;
  return combination.index === 0 ? "Diagonale ↘" : "Diagonale ↙";
}
export function bonusSummary(combination: Combination, players: Player[]) {
  const names = combination.recipientIds.map(
    (id) => players.find((player) => player.id === id)?.name ?? "Joueur",
  );
  return names.length
    ? `${names.join(", ")} : ${combination.bonus} gorgée${combination.bonus > 1 ? "s" : ""} chacun`
    : "Tout le monde est représenté : aucun bonus.";
}
export function preparationValid(
  words: string[],
  sips: number[],
  size: number,
  budget: number,
  mode: string,
) {
  return (
    Array.from({ length: size }, (_, index) => words[index] ?? "").every(
      (word) => word.trim().length > 0 && word.length <= 60,
    ) &&
    (mode === "random" ||
      (sips.slice(0, size).length === size &&
        sips.slice(0, size).every((sip) => Number.isInteger(sip) && sip >= 0) &&
        sips.slice(0, size).reduce((sum, sip) => sum + sip, 0) <= budget))
  );
}
export function roundStats(state: Snapshot) {
  const validated = state.cells.filter((cell) => cell.validated);
  return {
    validated: validated.length,
    distributed: state.players.reduce((sum, player) => sum + player.score, 0),
    collective: state.combinations.reduce(
      (sum, combination) =>
        sum + combination.bonus * combination.recipientIds.length,
      0,
    ),
    combinations: state.combinations.length,
  };
}
export function usefulError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const marker = "HubException: ";
  if (text.includes(marker))
    return text.slice(text.indexOf(marker) + marker.length);
  if (
    /network|fetch|connection|WebSocket|transport|Failed to start/i.test(text)
  )
    return "La connexion a été interrompue. Vérifiez votre réseau puis réessayez.";
  if (/invocation canceled|disconnected/i.test(text))
    return "La connexion a été interrompue. Votre place est conservée pendant la reconnexion.";
  return "Cette action n’a pas abouti. Réessayez dans un instant.";
}
