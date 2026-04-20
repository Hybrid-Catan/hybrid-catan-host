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
  return game.players[0]; // simple rotation (front of queue)
}

export function nextPlayer(game: GameState) {
  const player = game.players.shift();
  if (player) game.players.push(player);
}

export function startGame(game: GameState) {
  game.status = "IN_PROGRESS";
  game.phase = "ROLL";
}

export function rollDice(game: GameState): number {
  const dice1 = Math.ceil(Math.random() * 6);
  const dice2 = Math.ceil(Math.random() * 6);

  const sum = dice1 + dice2;
  game.dice.sum = sum;

  return sum;
}

export function distributeResources(game: GameState) {
  const roll = game.dice.sum;

  // ⚠️ Placeholder logic (replace later with board logic)
  game.players.forEach(player => {
    addResource(player, "WOOD", 1); // fake distribution
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

  // For now: skip actual trading logic
  console.log(`${player.name} is trading...`);

  game.phase = "BUILD";
}

export function handleBuildPhase(game: GameState) {
  const player = getCurrentPlayer(game);

  moveToBuild(player);

  console.log(`${player.name} is building...`);

  // Player actions happen externally (UI or test)

  game.phase = "END";
}

export function handleEndPhase(game: GameState) {
  const player = getCurrentPlayer(game);

  endTurn(player);

  // Check win condition
  const result = checkVictoryCondition(player);
  if (result.valid) {
    game.status = "FINISHED";
    game.winner.playerId = player.playerId;
    console.log(result.reason);
    return;
  }

  // Next player
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
