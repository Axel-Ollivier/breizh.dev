import { describe, expect, it } from "vitest";
import {
  bonusSummary,
  colorValue,
  combinationLabel,
  preparationValid,
  rankPlayers,
  roundStats,
  usefulError,
} from "./game";
import type { Combination, Player, Snapshot } from "./types";
const players: Player[] = [
  {
    id: "a",
    name: "Alice",
    color: 0,
    connected: true,
    isHost: true,
    wordCount: 4,
    ready: true,
    score: 4,
  },
  {
    id: "b",
    name: "Bob",
    color: 1,
    connected: false,
    isHost: false,
    wordCount: 4,
    ready: true,
    score: 8,
  },
  {
    id: "c",
    name: "Camille",
    color: 2,
    connected: true,
    isHost: false,
    wordCount: 4,
    ready: true,
    score: 8,
  },
];
const combination: Combination = {
  id: "row-0",
  kind: "row",
  index: 0,
  cellIds: ["1"],
  bonus: 5,
  recipientIds: ["a", "c"],
};

describe("mobile game presentation", () => {
  it("ranks current individual scores without changing the player list", () => {
    expect(rankPlayers(players).map((player) => player.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(players[0]?.id).toBe("a");
  });
  it("keeps collective bonuses separate from distributed points", () => {
    const state = {
      players,
      cells: [{ validated: true }, { validated: false }],
      combinations: [combination],
    } as Snapshot;
    expect(roundStats(state)).toEqual({
      validated: 1,
      distributed: 20,
      collective: 10,
      combinations: 1,
    });
  });
  it("shows complete amount for every absent player", () => {
    expect(bonusSummary(combination, players)).toBe(
      "Alice, Camille : 5 gorgées chacun",
    );
    expect(
      bonusSummary({ ...combination, recipientIds: [] }, players),
    ).toContain("aucun bonus");
    expect(combinationLabel(combination)).toBe("Ligne 1");
    expect(
      combinationLabel({ ...combination, kind: "diagonal", index: 1 }),
    ).toBe("Diagonale ↙");
  });
  it("validates incomplete drafts and unused manual budgets, including zero", () => {
    expect(
      preparationValid(["a", "a", "b", "c"], [0, 0, 0, 0], 4, 0, "manual"),
    ).toBe(true);
    expect(
      preparationValid(["a", "a", "b", "c"], [1, 2, 0, 0], 4, 10, "manual"),
    ).toBe(true);
    expect(
      preparationValid(["a", "a", "b", "c"], [1, 2, 0, 0], 4, 2, "manual"),
    ).toBe(false);
    expect(
      preparationValid(["a", " ", "b", "c"], [0, 0, 0, 0], 4, 10, "manual"),
    ).toBe(false);
    expect(
      preparationValid(["a", "b", "c", "d"], [0.5, 0, 0, 0], 4, 10, "manual"),
    ).toBe(false);
    expect(preparationValid(["a", "b", "c", "d"], [], 4, 10, "random")).toBe(
      true,
    );
  });
  it("handles missing colors and presents server errors without transport jargon", () => {
    expect(colorValue(null)).toBe("#ebe9e2");
    expect(
      usefulError(
        new Error(
          "Failed to invoke 'Join' due to an error on the server. HubException: Ce pseudo est déjà pris.",
        ),
      ),
    ).toBe("Ce pseudo est déjà pris.");
    expect(usefulError(new Error("Failed to fetch"))).toContain("connexion");
    expect(usefulError(new Error("internal details"))).not.toContain(
      "internal details",
    );
  });
});
