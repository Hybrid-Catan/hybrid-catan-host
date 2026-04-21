//checkSenderTradeRequest checks if the sender has enough resources to offer in the trade. It takes in the sender's inventory and the resources they are offering, and returns a boolean indicating whether the trade request is valid or not. This function will be used in the trading module to validate trade proposals before they are sent to the receiver.
import { GameState, trade } from "../../../utils/type";

export function checkSenderTradeRequest(TradeRequest: trade, game: GameState): boolean { return true; }
// Note (To be deleted): the sender is the player with active turn can be taken out index 0 from the GameState.players array. The resources they are offering can be compared against their resourcesCards to check if they have enough resources to offer in the trade. If the sender does not have enough resources, the function should return false, indicating that the trade request is invalid irrespective of the reciever.

//checkReceiverTradeRequest checks if the receiver has enough resources to fulfill the trade proposal. It takes in the receiver's inventory and the resources they are requesting, and returns a boolean indicating whether the trade request is valid or not. This function will be used in the trading module to validate trade proposals before they are sent to the receiver.
export function checkReceiverTradeRequest(TradeRequest: trade, game: GameState): boolean { return true; }
// Note (To be deleted): the reciever is the player with  non active turn can be taken out index any but 0 from the GameState.players array. 

export function isTradeActive(gameState: GameState, tradeIndex: number): boolean {
    const trade = gameState.tradeState.trades[tradeIndex];
    return trade ? trade.isActive : false;
}
// Note (To be deleted): this function checks if the trade with the given tradeId is currently active in the game state. It looks for the trade in the gameState's tradeState.trades array and returns true if it finds an active trade with the matching ID, otherwise it returns false. This function can be used to prevent accepting a trade that is no longer active.