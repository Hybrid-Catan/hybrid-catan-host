import { resourceCards, PlayerToResourceMap } from "@/utils/type";

export default function getPlayerToPortMap(): PlayerToPortMap {
    const activeResourceInfo: PlayerToResourceMap = {};
    return activeResourceInfo;
}// this stores the ownership of all ports to all players
export function getPlayerToHexMap(): PlayerToHexMap {
    const playerToHexMap: PlayerToResourceMap = {};
    return playerToHexMap;
}// this stores the ownership of all hexes to all players
export function getRobberLocationMap(): RobberLocationMap {
    return 0;
}// this stores the location of the robber on the board to determine which hexes are blocked and which players are affected
export function getHouseToPlayerMap(): HouseToPlayerMap {
    return {};
}// player and there number of corresponding houses (settlements and cities)
export function getRoadToPlayerMap(): RoadToPlayerMap {
    return {};
}// player and there number of corresponding roads (settlements and cities)
export function getPlayerToResourceCardMap(diceRoll: number): PlayerToResourceCardMap {
    return {};
}// this returns a map of players to the resource cards they should receive based on the dice roll and the hexes they have adjacent to their settlements and cities. It also takes into account the presence of the robber, which blocks resource production from the hex it occupies.