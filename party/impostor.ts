import type * as Party from "partykit/server";

// Word categories for the game
const WORD_CATEGORIES: Record<string, string[]> = {
  animals: [
    "perro", "gato", "elefante", "jirafa", "león", "tigre", "oso", "mono",
    "delfín", "ballena", "águila", "serpiente", "cocodrilo", "canguro", "pingüino"
  ],
  food: [
    "pizza", "hamburguesa", "sushi", "tacos", "pasta", "ensalada", "helado",
    "chocolate", "manzana", "banana", "pan", "queso", "pollo", "arroz", "sopa"
  ],
  places: [
    "playa", "montaña", "hospital", "escuela", "aeropuerto", "museo", "parque",
    "restaurante", "biblioteca", "estadio", "iglesia", "supermercado", "cine", "hotel", "banco"
  ],
  objects: [
    "teléfono", "computadora", "televisión", "libro", "reloj", "espejo", "lámpara",
    "silla", "mesa", "cama", "carro", "bicicleta", "guitarra", "cámara", "paraguas"
  ],
  professions: [
    "médico", "maestro", "bombero", "policía", "chef", "piloto", "astronauta",
    "dentista", "abogado", "arquitecto", "músico", "actor", "pintor", "escritor", "fotógrafo"
  ]
};

interface Player {
  id: string;           // Persistent player ID (stored in client localStorage)
  connectionId: string; // Current PartyKit connection ID
  name: string;
  isHost: boolean;
  isConnected: boolean;
}

interface GameState {
  phase: "lobby" | "playing" | "voting" | "results";
  players: Player[];
  hostId: string | null;
  settings: {
    impostorCount: number;
    category: string;
    customWords: string[];
  };
  currentRound: {
    word: string;
    impostorIds: string[];
    votes: Record<string, string>; // voterId -> votedPlayerId
  } | null;
  lastResult: {
    word: string;
    impostorIds: string[];
    impostorsWon: boolean;
    votes: Record<string, string>;
  } | null;
}

type ClientMessage =
  | { type: "join"; name: string; playerId: string }
  | { type: "start-game" }
  | { type: "vote"; targetId: string }
  | { type: "end-round"; impostorsWon: boolean }
  | { type: "update-settings"; settings: Partial<GameState["settings"]> }
  | { type: "back-to-lobby" }
  | { type: "kick-player"; playerId: string };

type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "role"; isImpostor: boolean; word: string | null }
  | { type: "error"; message: string }
  | { type: "kicked" };

// Player data sent to clients (without internal connectionId)
interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
}

interface PublicGameState {
  phase: GameState["phase"];
  players: PublicPlayer[];
  hostId: string | null;
  settings: GameState["settings"];
  currentRound: {
    hasVoted: boolean;
    voteCount: number;
    totalPlayers: number;
  } | null;
  lastResult: GameState["lastResult"];
  myId: string;
}

export default class ImpostorServer implements Party.Server {
  state: GameState;

  constructor(readonly room: Party.Room) {
    this.state = {
      phase: "lobby",
      players: [],
      hostId: null,
      settings: {
        impostorCount: 1,
        category: "animals",
        customWords: []
      },
      currentRound: null,
      lastResult: null
    };
  }

  getPublicState(playerId: string): PublicGameState {
    // Map players to exclude internal connectionId
    const publicPlayers: PublicPlayer[] = this.state.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isConnected: p.isConnected
    }));

    return {
      phase: this.state.phase,
      players: publicPlayers,
      hostId: this.state.hostId,
      settings: this.state.settings,
      currentRound: this.state.currentRound ? {
        hasVoted: !!this.state.currentRound.votes[playerId],
        voteCount: Object.keys(this.state.currentRound.votes).length,
        totalPlayers: this.state.players.filter(p => p.isConnected).length
      } : null,
      lastResult: this.state.lastResult,
      myId: playerId
    };
  }

  // Helper to get playerId from connectionId
  getPlayerIdByConnection(connectionId: string): string | null {
    const player = this.state.players.find(p => p.connectionId === connectionId);
    return player?.id ?? null;
  }

  broadcastState() {
    for (const player of this.state.players) {
      const conn = this.room.getConnection(player.connectionId);
      if (conn) {
        const message: ServerMessage = {
          type: "state",
          state: this.getPublicState(player.id)
        };
        conn.send(JSON.stringify(message));
      }
    }
  }

  sendRole(playerId: string) {
    if (!this.state.currentRound) return;

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    const conn = this.room.getConnection(player.connectionId);
    if (!conn) return;

    const isImpostor = this.state.currentRound.impostorIds.includes(playerId);
    const message: ServerMessage = {
      type: "role",
      isImpostor,
      word: isImpostor ? null : this.state.currentRound.word
    };
    conn.send(JSON.stringify(message));
  }

  onConnect(conn: Party.Connection) {
    // onConnect is called before we know the playerId
    // The actual reconnection logic happens in handleJoin
    // This is just for quick reconnects where the connectionId hasn't changed
    const existingPlayer = this.state.players.find(p => p.connectionId === conn.id);
    if (existingPlayer) {
      existingPlayer.isConnected = true;
      this.broadcastState();

      // If game is in progress, send their role
      if (this.state.phase === "playing" || this.state.phase === "voting") {
        this.sendRole(existingPlayer.id);
      }
    }
  }

  onClose(conn: Party.Connection) {
    const player = this.state.players.find(p => p.connectionId === conn.id);
    if (player) {
      player.isConnected = false;

      // If host disconnected and there are other players, assign new host
      if (player.isHost && this.state.players.some(p => p.isConnected && p.id !== player.id)) {
        player.isHost = false;
        const newHost = this.state.players.find(p => p.isConnected && p.id !== player.id);
        if (newHost) {
          newHost.isHost = true;
          this.state.hostId = newHost.id;
        }
      }

      this.broadcastState();
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message) as ClientMessage;

      switch (data.type) {
        case "join":
          this.handleJoin(sender, data.name, data.playerId);
          break;
        case "start-game":
          this.handleStartGame(sender);
          break;
        case "vote":
          this.handleVote(sender, data.targetId);
          break;
        case "end-round":
          this.handleEndRound(sender, data.impostorsWon);
          break;
        case "update-settings":
          this.handleUpdateSettings(sender, data.settings);
          break;
        case "back-to-lobby":
          this.handleBackToLobby(sender);
          break;
        case "kick-player":
          this.handleKickPlayer(sender, data.playerId);
          break;
      }
    } catch (e) {
      console.error("Error processing message:", e);
    }
  }

  handleJoin(conn: Party.Connection, name: string, playerId: string) {
    // Check if player already exists by their persistent playerId
    const existingPlayer = this.state.players.find(p => p.id === playerId);

    if (existingPlayer) {
      // Player is reconnecting - update their connection and name
      existingPlayer.connectionId = conn.id;
      existingPlayer.name = name;
      existingPlayer.isConnected = true;
      this.broadcastState();

      // If game is in progress, send their role
      if (this.state.phase === "playing" || this.state.phase === "voting") {
        this.sendRole(existingPlayer.id);
      }
      return;
    }

    // New player trying to join - check if game is already in progress
    if (this.state.phase !== "lobby") {
      const errorMessage: ServerMessage = {
        type: "error",
        message: "Game already in progress"
      };
      conn.send(JSON.stringify(errorMessage));
      return;
    }

    // Add new player
    const isFirstPlayer = this.state.players.length === 0;
    const player: Player = {
      id: playerId,
      connectionId: conn.id,
      name,
      isHost: isFirstPlayer,
      isConnected: true
    };

    this.state.players.push(player);

    if (isFirstPlayer) {
      this.state.hostId = playerId;
    }

    this.broadcastState();
  }

  handleStartGame(conn: Party.Connection) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Only host can start
    if (this.state.hostId !== playerId) {
      const errorMessage: ServerMessage = {
        type: "error",
        message: "Only host can start the game"
      };
      conn.send(JSON.stringify(errorMessage));
      return;
    }

    const connectedPlayers = this.state.players.filter(p => p.isConnected);

    // Need at least 3 players
    if (connectedPlayers.length < 3) {
      const errorMessage: ServerMessage = {
        type: "error",
        message: "Need at least 3 players"
      };
      conn.send(JSON.stringify(errorMessage));
      return;
    }

    // Select random word
    let wordPool: string[];
    if (this.state.settings.customWords.length > 0) {
      wordPool = this.state.settings.customWords;
    } else {
      wordPool = WORD_CATEGORIES[this.state.settings.category] || WORD_CATEGORIES.animals;
    }
    const word = wordPool[Math.floor(Math.random() * wordPool.length)];

    // Select random impostors
    const shuffledPlayers = [...connectedPlayers].sort(() => Math.random() - 0.5);
    const impostorCount = Math.min(this.state.settings.impostorCount, Math.floor(connectedPlayers.length / 2));
    const impostorIds = shuffledPlayers.slice(0, impostorCount).map(p => p.id);

    this.state.currentRound = {
      word,
      impostorIds,
      votes: {}
    };
    this.state.phase = "playing";
    this.state.lastResult = null;

    // Send state and roles
    this.broadcastState();
    for (const player of connectedPlayers) {
      this.sendRole(player.id);
    }
  }

  handleVote(conn: Party.Connection, targetId: string) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    if (this.state.phase !== "playing" && this.state.phase !== "voting") {
      return;
    }

    if (!this.state.currentRound) return;

    // Can't vote for yourself
    if (targetId === playerId) {
      const errorMessage: ServerMessage = {
        type: "error",
        message: "Can't vote for yourself"
      };
      conn.send(JSON.stringify(errorMessage));
      return;
    }

    // Record vote
    this.state.currentRound.votes[playerId] = targetId;
    this.state.phase = "voting";
    this.broadcastState();
  }

  handleEndRound(conn: Party.Connection, impostorsWon: boolean) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Only host can end round
    if (this.state.hostId !== playerId) {
      return;
    }

    if (!this.state.currentRound) return;

    // Save result
    this.state.lastResult = {
      word: this.state.currentRound.word,
      impostorIds: this.state.currentRound.impostorIds,
      impostorsWon,
      votes: this.state.currentRound.votes
    };

    this.state.phase = "results";
    this.state.currentRound = null;
    this.broadcastState();
  }

  handleUpdateSettings(conn: Party.Connection, settings: Partial<GameState["settings"]>) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Only host can update settings
    if (this.state.hostId !== playerId) {
      return;
    }

    if (this.state.phase !== "lobby") {
      return;
    }

    this.state.settings = {
      ...this.state.settings,
      ...settings
    };
    this.broadcastState();
  }

  handleBackToLobby(conn: Party.Connection) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Only host can go back to lobby
    if (this.state.hostId !== playerId) {
      return;
    }

    this.state.phase = "lobby";
    this.state.currentRound = null;
    this.broadcastState();
  }

  handleKickPlayer(conn: Party.Connection, targetPlayerId: string) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Only host can kick
    if (this.state.hostId !== playerId) {
      return;
    }

    // Can't kick yourself
    if (targetPlayerId === playerId) {
      return;
    }

    // Find and remove player
    const playerIndex = this.state.players.findIndex(p => p.id === targetPlayerId);
    if (playerIndex !== -1) {
      const targetPlayer = this.state.players[playerIndex];
      // Notify the kicked player
      const kickedConn = this.room.getConnection(targetPlayer.connectionId);
      if (kickedConn) {
        const kickMessage: ServerMessage = { type: "kicked" };
        kickedConn.send(JSON.stringify(kickMessage));
      }

      this.state.players.splice(playerIndex, 1);
      this.broadcastState();
    }
  }
}
