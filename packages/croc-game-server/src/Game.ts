import uuid from 'uuid';
import { AnyMessage } from 'croc-messages';
import { Responder } from './interfaces/Responder';
import { Player } from './interfaces/Player';
import { GameData } from './GameData';
import { GameContext } from './GameContext';
import { GameState, GameStateActions } from './states/GameState';
import { delayCall, DelayedCall } from './utils/DelayCall';
import { DELETE_PLAYER_MESSAGE } from './messages/DeletePlayerMessage';
import {
  createDisconnectPlayerMessage,
  DISCONNECTED_MESSAGE,
} from './messages/DisconnectPlayerMessage';
import {
  createNewPlayerMessage,
  NEW_PLAYER_MESSAGE,
} from './messages/NewPlayerMessage';

interface GameConfig {
  reconnectionTimeout: number;
  addPlayersMessageCreator: (players: Player[]) => AnyMessage;
  deletePlayerMessageCreator: (id: string) => AnyMessage;
}

interface IntroductionInfo {
  name: string;
  id?: string;
}

export abstract class Game<
  A extends GameStateActions,
  D extends GameData = GameData
> {
  private config: GameConfig;
  private delayedDeletes: { [id: string]: DelayedCall } = {};
  protected responder: Responder;
  protected data: D;
  protected context: GameContext<A, D>;

  constructor(params: {
    responder: Responder;
    config: GameConfig;
    gameDataInitializer: () => D;
  }) {
    this.responder = params.responder;
    this.config = params.config;
    this.data = params.gameDataInitializer();
    this.context = this.initializeContext();
  }

  protected abstract initializeContext(): GameContext<A, D>;

  public connectPlayerWithInfo(info: IntroductionInfo): string {
    const oldId = this.tryReconnect(info);

    if (oldId) {
      return oldId;
    }

    const newId = uuid();
    const newPlayer = { id: newId, name: info.name };

    this.data.players[newId] = { ...newPlayer, score: 0 };

    this.sendAllPlayersTo(newId);
    this.sendPlayer(newId);
    this.notifyAboutNewPlayer(newPlayer);

    return newId;
  }

  private tryReconnect(info: IntroductionInfo): string | null {
    const oldPlayer = this.findPlayerByConnectionInfo(info);

    if (!oldPlayer) {
      return null;
    }

    oldPlayer.disconnected = false;

    this.sendPlayer(oldPlayer.id);

    if (this.delayedDeletes[oldPlayer.id]) {
      this.delayedDeletes[oldPlayer.id].cancel();

      delete this.delayedDeletes[oldPlayer.id];
    }

    return oldPlayer.id;
  }

  private findPlayerByConnectionInfo(info: IntroductionInfo): Player | null {
    const oldPlayerId = info.id;

    if (oldPlayerId) {
      return this.data.players[oldPlayerId];
    }

    return null;
  }

  public disconnectPlayerWithId(id: string): void {
    this.data.players[id].disconnected = true;

    this.sendPlayer(id);
    this.notifyAboutDisconnectedPlayer(id);

    this.delayedDeletes[id] = delayCall(() => {
      delete this.data.players[id];

      this.sendDeletePlayer(id);
      this.notifyAboutDeletedPlayer(id);
    }, this.config.reconnectionTimeout);
  }

  private sendPlayer(id: string) {
    if (this.data.players[id]) {
      this.responder.enqueueResponseForAll([
        this.config.addPlayersMessageCreator([{ ...this.data.players[id] }]),
      ]);
    }
  }

  private sendAllPlayersTo(id: string) {
    this.responder.enqueueResponseForOne(id, [
      this.config.addPlayersMessageCreator(
        Object.keys(this.data.players).map(
          (playerId) => this.data.players[playerId],
        ),
      ),
    ]);
  }

  private sendDeletePlayer(id: string) {
    this.responder.enqueueResponseForAll([
      this.config.deletePlayerMessageCreator(id),
    ]);
  }

  protected get numberOfPlayers(): number {
    return Object.keys(this.data.players).length;
  }

  protected get numberOfConnectedPlayers(): number {
    return Object.keys(this.data.players).filter(
      (id) => !this.data.players[id].disconnected,
    ).length;
  }

  protected notifyAboutNewPlayer(player: Player): void {
    this.handleMessage('self', createNewPlayerMessage(player));
  }

  protected notifyAboutDisconnectedPlayer(playerId: string): void {
    this.handleMessage('self', createDisconnectPlayerMessage(playerId));
  }

  protected notifyAboutDeletedPlayer(playerId: string): void {
    this.handleMessage('self', {
      type: DELETE_PLAYER_MESSAGE,
      playerId,
    });
  }
  public handleMessage(fromId: string, message: AnyMessage): void {}
}
