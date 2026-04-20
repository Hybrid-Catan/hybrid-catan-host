import type { GameState, Player } from "../../../utils/type.ts";

import {
  startTurn,
  moveToTrade,
  moveToBuild,
  endTurn,
  addResource
} from "../playerstatmanagement/playerstatmanagement.ts";

import {
  checkVictoryCondition
} from "../gamerules/gamerules.ts";

export function getCurrentPlayer(game: GameState): Player {
  return game.players[0];
}

export function nextPlayer(game: GameState) {
  const current = game.players.shift();
  if (current) game.players.push(current);
}

export function rollDice(game: GameState): number {
  const d1 = Math.ceil(Math.random() * 6);
  const d2 = Math.ceil(Math.random() * 6);

  game.dice.sum = d1 + d2;
  return game.dice.sum;
}

export function distributeResources(game: GameState) {
  const roll = game.dice.sum;

  if (roll < 2) return;

  // TODO: replace with board tile logic
  game.players.forEach(player => {
    addResource(player, "WOOD", 1);
  });
}

export function handleRollPhase(game: GameState) {
  const player = getCurrentPlayer(game);

  startTurn(player);

  const roll = rollDice(game);
  console.log(`${player.name} rolled ${roll}`);

  if (roll === 7) {
    console.log("Robber triggered (not implemented yet)");
  } else {
    distributeResources(game);
  }

  game.phase = "TRADE";
}

export function handleTradePhase(game: GameState) {
  const player = getCurrentPlayer(game);

  moveToTrade(player);
  console.log(`${player.name} is in trade phase`);

  game.phase = "BUILD";
}

export function handleBuildPhase(game: GameState) {
  const player = getCurrentPlayer(game);

  moveToBuild(player);
  console.log(`${player.name} is building`);

  game.phase = "END";
}

export function handleEndPhase(game: GameState) {
  const player = getCurrentPlayer(game);

  endTurn(player);

  const result = checkVictoryCondition(player);

  if (result.valid) {
    game.status = "FINISHED";
    game.winner.playerId = player.playerId;
    console.log(result.reason);
    return;
  }

  nextPlayer(game);
  game.phase = "ROLL";
}

export function gameStep(game: GameState) {
  if (game.status !== "IN_PROGRESS") return;

  switch (game.phase) {
    case "ROLL":
      handleRollPhase(game);
      break;

    case "TRADE":
      handleTradePhase(game);
      break;

    case "BUILD":
      handleBuildPhase(game);
      break;

    case "END":
      handleEndPhase(game);
      break;
  }
}

export function startGame(game: GameState) {
  if (game.players.length === 0) {
    throw new Error("Cannot start game without players");
  }

  game.players.sort((a, b) => a.sequence - b.sequence);

  game.status = "IN_PROGRESS";
  game.phase = "ROLL";
}
