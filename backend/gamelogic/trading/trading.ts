import { UUID } from "crypto";
import { GameState, Player, Trade, resources } from "./types";

// ─────────────────────────────────────────────
// Types local to trade logic
// ─────────────────────────────────────────────

export type ResourceOffer = Partial<resources>;

export type TradeOfferInput =
  | {
      type: "PLAYER";
      offeringPlayerId: UUID;
      targetPlayerId: UUID;
      offering: ResourceOffer;   // what the offering player gives
      requesting: ResourceOffer; // what the offering player wants back
    }
  | {
      type: "BANK";
      offeringPlayerId: UUID;
      offering: ResourceOffer;
      requesting: ResourceOffer;
    };

export type TradeResult =
  | { success: true; gameState: GameState }
  | { success: false; reason: string };

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function totalResources(r: ResourceOffer): number {
  return Object.values(r).reduce((sum, v) => sum + (v ?? 0), 0);
}

function hasEnoughResources(player: Player, offer: ResourceOffer): boolean {
  return (Object.keys(offer) as (keyof resources)[]).every(
    (resource) => player.resources[resource] >= (offer[resource] ?? 0)
  );
}

function bankHasEnoughResources(
  bank: GameState["bank"],
  offer: ResourceOffer
): boolean {
  return (Object.keys(offer) as (keyof resources)[]).every(
    (resource) => bank.resources[resource] >= (offer[resource] ?? 0)
  );
}

/**
 * Returns the best trade ratio a player has for a given resource.
 * Checks owned ports first, falls back to the default 4:1 ratio.
 */
function getPlayerRatio(player: Player, resource: keyof resources): number {
  let best = 4;
  for (const port of player.portsOwned) {
    if (port.type === resource && port.ratio === "2:1") return 2;
    if (port.type === "THREE_TO_ONE") best = Math.min(best, 3);
  }
  return best;
}

/**
 * Validates that a bank trade respects the player's port ratios.
 * Each resource being offered must satisfy the ratio for the resource
 * being requested (one resource type per trade).
 */
function validateBankTradeRatios(
  player: Player,
  offering: ResourceOffer,
  requesting: ResourceOffer
): { valid: boolean; reason?: string } {
  const requestedTypes = (Object.keys(requesting) as (keyof resources)[]).filter(
    (r) => (requesting[r] ?? 0) > 0
  );
  const offeredTypes = (Object.keys(offering) as (keyof resources)[]).filter(
    (r) => (offering[r] ?? 0) > 0
  );

  if (requestedTypes.length !== 1) {
    return {
      valid: false,
      reason: "Bank trades must request exactly one resource type.",
    };
  }

  if (offeredTypes.length !== 1) {
    return {
      valid: false,
      reason: "Bank trades must offer exactly one resource type.",
    };
  }

  const offeredResource = offeredTypes[0];
  const offeredAmount = offering[offeredResource] ?? 0;
  const requestedAmount = requesting[requestedTypes[0]] ?? 0;
  const ratio = getPlayerRatio(player, offeredResource);

  if (offeredAmount !== ratio * requestedAmount) {
    return {
      valid: false,
      reason: `Bank trade ratio invalid. You need ${ratio} ${offeredResource} per 1 ${requestedTypes[0]} (you have a ${ratio}:1 port for this resource).`,
    };
  }

  return { valid: true };
}

function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

// ─────────────────────────────────────────────
// /gamelogic/gamerules — isTradePossible
// ─────────────────────────────────────────────

export function isTradePossible(
  gameState: GameState,
  offer: TradeOfferInput,
  acceptedByTarget?: boolean
): { possible: boolean; reason?: string } {
  // Must be in TRADE phase (or BUFFER allowing trade)
  if (gameState.phase !== "TRADE" && gameState.phase !== "BUFFER") {
    return { possible: false, reason: "Trades can only occur during the TRADE or BUFFER phase." };
  }

  const offeringPlayer = gameState.players.find(
    (p) => p.playerId === offer.offeringPlayerId
  );
  if (!offeringPlayer) {
    return { possible: false, reason: "Offering player not found." };
  }

  // The offering player must be the active player (first in queue)
  if (gameState.players[0].playerId !== offer.offeringPlayerId) {
    return { possible: false, reason: "Only the active player can initiate a trade." };
  }

  // Offering player must have the resources they are offering
  if (!hasEnoughResources(offeringPlayer, offer.offering)) {
    return { possible: false, reason: "Offering player does not have enough resources." };
  }

  if (offer.type === "PLAYER") {
    // After acceptance is confirmed, re-check target player still has the goods
    if (acceptedByTarget) {
      const targetPlayer = gameState.players.find(
        (p) => p.playerId === offer.targetPlayerId
      );
      if (!targetPlayer) {
        return { possible: false, reason: "Target player not found." };
      }
      if (!hasEnoughResources(targetPlayer, offer.requesting)) {
        return {
          possible: false,
          reason: "Target player no longer has the requested resources.",
        };
      }
    }
  }

  if (offer.type === "BANK") {
    const ratioCheck = validateBankTradeRatios(
      offeringPlayer,
      offer.offering,
      offer.requesting
    );
    if (!ratioCheck.valid) {
      return { possible: false, reason: ratioCheck.reason };
    }
    if (!bankHasEnoughResources(gameState.bank, offer.requesting)) {
      return { possible: false, reason: "The bank does not have enough of the requested resource." };
    }
  }

  return { possible: true };
}

// ─────────────────────────────────────────────
// Create trade offer
// ─────────────────────────────────────────────

export function createTradeOffer(
  gameState: GameState,
  offer: TradeOfferInput
): TradeResult {
  // Pre-offer validation
  const preCheck = isTradePossible(gameState, offer);
  if (!preCheck.possible) {
    return { success: false, reason: preCheck.reason! };
  }

  const newState = cloneGameState(gameState);
  newState.phase = "TRADE";

  if (offer.type === "PLAYER") {
    const trade: Trade = {
      player1: offer.offeringPlayerId,
      player2: offer.targetPlayerId,
      resources: {
        WOOD:  (offer.offering.WOOD  ?? 0) - (offer.requesting.WOOD  ?? 0),
        BRICK: (offer.offering.BRICK ?? 0) - (offer.requesting.BRICK ?? 0),
        WOOL:  (offer.offering.WOOL  ?? 0) - (offer.requesting.WOOL  ?? 0),
        WHEAT: (offer.offering.WHEAT ?? 0) - (offer.requesting.WHEAT ?? 0),
        ORE:   (offer.offering.ORE   ?? 0) - (offer.requesting.ORE   ?? 0),
      },
      isActive: true,
      accepted: false,
    };

    newState.tradeState = {
      trades: [...(newState.tradeState?.trades ?? []), trade],
    };
  }

  // Bank trades have no pending offer — they go straight to resolveTradeOffer
  return { success: true, gameState: newState };
}

// ─────────────────────────────────────────────
// Execute the actual resource swap
// ─────────────────────────────────────────────

function executeTrade(
  gameState: GameState,
  offer: TradeOfferInput
): GameState {
  const newState = cloneGameState(gameState);

  const offeringPlayer = newState.players.find(
    (p) => p.playerId === offer.offeringPlayerId
  )!;

  if (offer.type === "PLAYER") {
    const targetPlayer = newState.players.find(
      (p) => p.playerId === offer.targetPlayerId
    )!;

    // Transfer offering → target
    (Object.keys(offer.offering) as (keyof resources)[]).forEach((r) => {
      offeringPlayer.resources[r] -= offer.offering[r] ?? 0;
      targetPlayer.resources[r]   += offer.offering[r] ?? 0;
    });

    // Transfer requesting → offeringPlayer
    (Object.keys(offer.requesting) as (keyof resources)[]).forEach((r) => {
      targetPlayer.resources[r]   -= offer.requesting[r] ?? 0;
      offeringPlayer.resources[r] += offer.requesting[r] ?? 0;
    });

    // Mark trade complete — remove active trade from tradeState
    newState.tradeState = {
      trades:
        newState.tradeState?.trades.map((t) =>
          t.player1 === offer.offeringPlayerId &&
          t.player2 === offer.targetPlayerId &&
          t.isActive
            ? { ...t, isActive: false, accepted: true }
            : t
        ) ?? [],
    };
  }

  if (offer.type === "BANK") {
    // Player gives resources to bank
    (Object.keys(offer.offering) as (keyof resources)[]).forEach((r) => {
      offeringPlayer.resources[r]  -= offer.offering[r] ?? 0;
      newState.bank.resources[r]   += offer.offering[r] ?? 0;
    });

    // Bank gives resources to player
    (Object.keys(offer.requesting) as (keyof resources)[]).forEach((r) => {
      newState.bank.resources[r]   -= offer.requesting[r] ?? 0;
      offeringPlayer.resources[r]  += offer.requesting[r] ?? 0;
    });
  }

  // Trade complete — clear active tradeState and return to BUFFER
  newState.tradeState = null;
  newState.phase = "BUFFER";

  return newState;
}

// ─────────────────────────────────────────────
// Resolve offer: accept or reject
// ─────────────────────────────────────────────

export function resolveTradeOffer(
  gameState: GameState,
  offer: TradeOfferInput,
  accepted: boolean
): TradeResult {
  if (!accepted) {
    // Trade rejected — clear tradeState and move to BUFFER
    const newState = cloneGameState(gameState);
    newState.tradeState = null;
    newState.phase = "BUFFER";
    return { success: true, gameState: newState };
  }

  // Re-validate with acceptedByTarget = true before executing
  const postCheck = isTradePossible(gameState, offer, true);
  if (!postCheck.possible) {
    return { success: false, reason: postCheck.reason! };
  }

  const finalState = executeTrade(gameState, offer);
  return { success: true, gameState: finalState };
}

// ─────────────────────────────────────────────
// Convenience: one-call bank trade (auto-accepts)
// ─────────────────────────────────────────────

export function bankTrade(
  gameState: GameState,
  offeringPlayerId: UUID,
  offering: ResourceOffer,
  requesting: ResourceOffer
): TradeResult {
  const offer: TradeOfferInput = {
    type: "BANK",
    offeringPlayerId,
    offering,
    requesting,
  };

  const create = createTradeOffer(gameState, offer);
  if (!create.success) return create;

  // Bank trades auto-accept — no target player needed
  return resolveTradeOffer(create.gameState, offer, true);
}
