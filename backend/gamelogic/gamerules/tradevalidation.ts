//checkSenderTradeRequest checks if the sender has enough resources to offer in the trade. It takes in the sender's inventory and the resources they are offering, and returns a boolean indicating whether the trade request is valid or not. This function will be used in the trading module to validate trade proposals before they are sent to the receiver.
import { GameState, resourceCards, trade } from "../../../utils/type";
import { UUID } from "crypto";

function hasEnoughResources(
    playerCards: resourceCards,
    requiredCards: resourceCards
): boolean {
    return Object.keys(requiredCards).every((key) => {
        const resource = key as keyof resourceCards;
        return playerCards[resource] >= requiredCards[resource];
    });
}

export function checkSenderTradeRequest(
    senderId: UUID,
    receiverId: UUID,
    sendingCards: resourceCards,
    receivingCards: resourceCards,
    game: GameState
): boolean {

    // sender = active player
    const sender = game.players[0];

    // sanity check (optional but good)
    if (sender.playerId !== senderId) return false;

    // check sender has enough to GIVE
    return Object.keys(sender.resourceCards).every((key) => {
        const resource = key as keyof resourceCards;
        return sender.resourceCards[resource] >= sendingCards[resource];
    });
}


//checkReceiverTradeRequest checks if the receiver has enough resources to fulfill the trade proposal. It takes in the receiver's inventory and the resources they are requesting, and returns a boolean indicating whether the trade request is valid or not. This function will be used in the trading module to validate trade proposals before they are sent to the receiver.
export function checkReceiverTradeRequest(
    senderId: UUID,
    receiverId: UUID,
    sendingCards: resourceCards,
    receivingCards: resourceCards,
    game: GameState
): boolean {

    // find receiver (not index 0)
    const receiver = game.players.find(p => p.playerId === receiverId);

    if (!receiver) return false;

    // check receiver has enough to GIVE (i.e. receivingCards)
    return hasEnoughResources(receiver.resourceCards, receivingCards);
}
// Note (To be deleted): the reciever is the player with  non active turn can be taken out index any but 0 from the GameState.players array. 

export function isTradeActive(gameState: GameState, tradeIndex: number): boolean {
    const trade = gameState.tradeState.trades[tradeIndex];
    return trade ? trade.isActive : false;
}
// Note (To be deleted): this function checks if the trade with the given tradeId is currently active in the game state. It looks for the trade in the gameState's tradeState.trades array and returns true if it finds an active trade with the matching ID, otherwise it returns false. This function can be used to prevent accepting a trade that is no longer active.