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

// Scoring constants
const POINTS_CITIZEN_CORRECT = 10;    // Citizens who voted for an impostor
const POINTS_CITIZEN_WRONG = 0;       // Citizens who voted for a citizen
const POINTS_IMPOSTOR_NOT_CAUGHT = 15; // Impostor who wasn't voted out
const POINTS_IMPOSTOR_CAUGHT = 0;     // Impostor who was caught

interface Player {
  id: string;           // Persistent player ID (stored in client localStorage)
  connectionId: string; // Current PartyKit connection ID
  name: string;
  isHost: boolean;
  isConnected: boolean;
}

interface PlayerScore {
  odplayerId: string;
  name: string;
  score: number;
  roundsAsImpostor: number;
  roundsAsCitizen: number;
  timesCorrect: number;
}

interface RoundResult {
  roundNumber: number;
  word: string;
  impostorIds: string[];
  votes: Record<string, string>;
  eliminatedId: string | null; // Who was voted out (or null if tie)
  impostorsWon: boolean;
  pointsAwarded: Record<string, number>; // playerId -> points earned this round
}

interface ClueEntry {
  playerId: string;
  playerName: string;
  clue: string | null; // null means they marked "done" in offline mode without writing
  timestamp: number;
}

interface GameState {
  phase: "lobby" | "playing" | "clues" | "voting" | "results" | "leaderboard" | "podium";
  players: Player[];
  hostId: string | null;
  settings: {
    impostorCount: number;
    category: string;
    customWords: string[];
    totalRounds: number;
    clueMode: "chat" | "offline"; // chat = write clues in app, offline = verbal clues
  };
  // Match state (persists across rounds)
  match: {
    currentRound: number;
    usedWords: string[];
    scores: Record<string, PlayerScore>; // playerId -> score data
    roundHistory: RoundResult[];
  } | null;
  // Current round state
  currentRound: {
    word: string;
    impostorIds: string[];
    votes: Record<string, string>; // voterId -> votedPlayerId
    // Clue turn state
    turnOrder: string[]; // Player IDs in order they give clues
    currentTurnIndex: number; // Index of current player's turn
    clues: ClueEntry[]; // Clues given so far
  } | null;
  lastResult: RoundResult | null;
}

type ClientMessage =
  | { type: "join"; name: string; playerId: string }
  | { type: "start-game" }
  | { type: "start-match" }
  | { type: "vote"; targetId: string }
  | { type: "update-settings"; settings: Partial<GameState["settings"]> }
  | { type: "next-round" }
  | { type: "back-to-lobby" }
  | { type: "kick-player"; playerId: string }
  | { type: "submit-clue"; clue: string } // For chat mode
  | { type: "mark-clue-done" } // For offline mode
  | { type: "start-voting" }; // Host advances from clues to voting

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

interface PublicVoteInfo {
  odplayerId: string;
  odplayerName: string;
  votedForId: string | null;
  votedForName: string | null;
}

interface PublicClueEntry {
  playerId: string;
  playerName: string;
  clue: string | null;
  done: boolean;
}

interface PublicGameState {
  phase: GameState["phase"];
  players: PublicPlayer[];
  hostId: string | null;
  settings: GameState["settings"];
  // Match info
  match: {
    currentRound: number;
    totalRounds: number;
    scores: Record<string, { name: string; score: number }>; // For leaderboard
  } | null;
  // Current round info
  currentRound: {
    hasVoted: boolean;
    myVote: string | null;
    votes: PublicVoteInfo[]; // Real-time vote tracking
    voteCount: number;
    totalPlayers: number;
    // Clue turn info
    turnOrder: { playerId: string; playerName: string }[]; // Order of clue turns
    currentTurnIndex: number;
    currentTurnPlayerId: string | null;
    isMyTurn: boolean;
    clues: PublicClueEntry[];
    allCluesDone: boolean;
  } | null;
  lastResult: RoundResult | null;
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
        customWords: [],
        totalRounds: 5,
        clueMode: "offline"
      },
      match: null,
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

    // Build public vote info (show who voted for whom in real-time)
    const publicVotes: PublicVoteInfo[] = this.state.currentRound
      ? this.state.players
          .filter(p => p.isConnected)
          .map(p => {
            const votedForId = this.state.currentRound?.votes[p.id] ?? null;
            const votedForPlayer = votedForId
              ? this.state.players.find(pl => pl.id === votedForId)
              : null;
            return {
              odplayerId: p.id,
              odplayerName: p.name,
              votedForId,
              votedForName: votedForPlayer?.name ?? null
            };
          })
      : [];

    // Build match scores for leaderboard
    const matchScores: Record<string, { name: string; score: number }> = {};
    if (this.state.match) {
      for (const [pid, scoreData] of Object.entries(this.state.match.scores)) {
        matchScores[pid] = {
          name: scoreData.name,
          score: scoreData.score
        };
      }
    }

    // Build turn order with names
    const turnOrder = this.state.currentRound
      ? this.state.currentRound.turnOrder.map(pid => {
          const player = this.state.players.find(p => p.id === pid);
          return { playerId: pid, playerName: player?.name ?? pid };
        })
      : [];

    // Build public clues info
    const publicClues: PublicClueEntry[] = this.state.currentRound
      ? this.state.currentRound.turnOrder.map(pid => {
          const player = this.state.players.find(p => p.id === pid);
          const clueEntry = this.state.currentRound?.clues.find(c => c.playerId === pid);
          return {
            playerId: pid,
            playerName: player?.name ?? pid,
            clue: clueEntry?.clue ?? null,
            done: !!clueEntry
          };
        })
      : [];

    const currentTurnPlayerId = this.state.currentRound && this.state.currentRound.currentTurnIndex < this.state.currentRound.turnOrder.length
      ? this.state.currentRound.turnOrder[this.state.currentRound.currentTurnIndex]
      : null;

    const allCluesDone = this.state.currentRound
      ? this.state.currentRound.clues.length >= this.state.currentRound.turnOrder.length
      : false;

    return {
      phase: this.state.phase,
      players: publicPlayers,
      hostId: this.state.hostId,
      settings: this.state.settings,
      match: this.state.match ? {
        currentRound: this.state.match.currentRound,
        totalRounds: this.state.settings.totalRounds,
        scores: matchScores
      } : null,
      currentRound: this.state.currentRound ? {
        hasVoted: !!this.state.currentRound.votes[playerId],
        myVote: this.state.currentRound.votes[playerId] ?? null,
        votes: publicVotes,
        voteCount: Object.keys(this.state.currentRound.votes).length,
        totalPlayers: this.state.players.filter(p => p.isConnected).length,
        // Clue turn info
        turnOrder,
        currentTurnIndex: this.state.currentRound.currentTurnIndex,
        currentTurnPlayerId,
        isMyTurn: currentTurnPlayerId === playerId,
        clues: publicClues,
        allCluesDone
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
      if (this.state.phase === "playing" || this.state.phase === "clues" || this.state.phase === "voting") {
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
        case "start-match":
          this.handleStartMatch(sender);
          break;
        case "vote":
          this.handleVote(sender, data.targetId);
          break;
        case "next-round":
          this.handleNextRound(sender);
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
        case "submit-clue":
          this.handleSubmitClue(sender, data.clue);
          break;
        case "mark-clue-done":
          this.handleMarkClueDone(sender);
          break;
        case "start-voting":
          this.handleStartVoting(sender);
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
      if (this.state.phase === "playing" || this.state.phase === "clues" || this.state.phase === "voting") {
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

  handleStartMatch(conn: Party.Connection) {
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

    // Initialize match state
    const initialScores: Record<string, PlayerScore> = {};
    for (const player of connectedPlayers) {
      initialScores[player.id] = {
        odplayerId: player.id,
        name: player.name,
        score: 0,
        roundsAsImpostor: 0,
        roundsAsCitizen: 0,
        timesCorrect: 0
      };
    }

    this.state.match = {
      currentRound: 1,
      usedWords: [],
      scores: initialScores,
      roundHistory: []
    };
    this.state.lastResult = null;

    // Start the first round
    this.startRound();
  }

  startRound() {
    const connectedPlayers = this.state.players.filter(p => p.isConnected);
    if (!this.state.match) return;

    // Select random word (excluding used words)
    let wordPool: string[];
    if (this.state.settings.customWords.length > 0) {
      wordPool = this.state.settings.customWords.filter(
        w => !this.state.match!.usedWords.includes(w)
      );
    } else {
      const categoryWords = WORD_CATEGORIES[this.state.settings.category] || WORD_CATEGORIES.animals;
      wordPool = categoryWords.filter(w => !this.state.match!.usedWords.includes(w));
    }

    // If all words have been used, reset the pool (but this shouldn't happen with enough words)
    if (wordPool.length === 0) {
      if (this.state.settings.customWords.length > 0) {
        wordPool = this.state.settings.customWords;
      } else {
        wordPool = WORD_CATEGORIES[this.state.settings.category] || WORD_CATEGORIES.animals;
      }
      this.state.match.usedWords = [];
    }

    const word = wordPool[Math.floor(Math.random() * wordPool.length)];
    this.state.match.usedWords.push(word);

    // Select random impostors
    const shuffledPlayers = [...connectedPlayers].sort(() => Math.random() - 0.5);
    const impostorCount = Math.min(this.state.settings.impostorCount, Math.floor(connectedPlayers.length / 2));
    const impostorIds = shuffledPlayers.slice(0, impostorCount).map(p => p.id);

    // Create random turn order for giving clues
    // Shuffle all connected players for the turn order
    const turnOrder = [...connectedPlayers]
      .sort(() => Math.random() - 0.5)
      .map(p => p.id);

    // Update player stats for role
    for (const player of connectedPlayers) {
      if (this.state.match.scores[player.id]) {
        if (impostorIds.includes(player.id)) {
          this.state.match.scores[player.id].roundsAsImpostor++;
        } else {
          this.state.match.scores[player.id].roundsAsCitizen++;
        }
      }
    }

    this.state.currentRound = {
      word,
      impostorIds,
      votes: {},
      turnOrder,
      currentTurnIndex: 0,
      clues: []
    };
    this.state.phase = "playing";

    // Send state and roles
    this.broadcastState();
    for (const player of connectedPlayers) {
      this.sendRole(player.id);
    }
  }

  handleVote(conn: Party.Connection, targetId: string) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    if (this.state.phase !== "voting") {
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

    // Record or change vote (players can change their vote at any time)
    this.state.currentRound.votes[playerId] = targetId;
    this.broadcastState();

    // Check if all connected players have voted
    this.checkRoundEnd();
  }

  checkRoundEnd() {
    if (!this.state.currentRound || !this.state.match) return;

    const connectedPlayers = this.state.players.filter(p => p.isConnected);
    const voteCount = Object.keys(this.state.currentRound.votes).length;

    // Not all players have voted yet
    if (voteCount < connectedPlayers.length) return;

    // Count votes for each player
    const voteCounts: Record<string, number> = {};
    for (const votedId of Object.values(this.state.currentRound.votes)) {
      voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
    }

    // Find the player(s) with most votes
    const maxVotes = Math.max(...Object.values(voteCounts));
    const playersWithMaxVotes = Object.entries(voteCounts)
      .filter(([_, count]) => count === maxVotes)
      .map(([playerId]) => playerId);

    // If there's a tie, don't end the round - players need to change their votes
    if (playersWithMaxVotes.length > 1) {
      // Broadcast state so clients know there's a tie
      this.broadcastState();
      return;
    }

    // We have a clear winner (most voted player)
    const eliminatedId = playersWithMaxVotes[0];
    this.endRound(eliminatedId);
  }

  endRound(eliminatedId: string | null) {
    if (!this.state.currentRound || !this.state.match) return;

    const impostorIds = this.state.currentRound.impostorIds;
    const connectedPlayers = this.state.players.filter(p => p.isConnected);

    // Determine if impostors won
    // Impostors win if the eliminated player is NOT an impostor
    const impostorsWon = eliminatedId === null || !impostorIds.includes(eliminatedId);

    // Calculate and award points
    const pointsAwarded: Record<string, number> = {};

    for (const player of connectedPlayers) {
      const isImpostor = impostorIds.includes(player.id);
      const votedFor = this.state.currentRound.votes[player.id];
      let points = 0;

      if (isImpostor) {
        // Impostors get points if they weren't caught
        if (impostorsWon) {
          points = POINTS_IMPOSTOR_NOT_CAUGHT;
        } else {
          points = POINTS_IMPOSTOR_CAUGHT;
        }
      } else {
        // Citizens get points if they voted for an impostor
        if (votedFor && impostorIds.includes(votedFor)) {
          points = POINTS_CITIZEN_CORRECT;
          if (this.state.match.scores[player.id]) {
            this.state.match.scores[player.id].timesCorrect++;
          }
        } else {
          points = POINTS_CITIZEN_WRONG;
        }
      }

      pointsAwarded[player.id] = points;
      if (this.state.match.scores[player.id]) {
        this.state.match.scores[player.id].score += points;
      }
    }

    // Save round result
    const roundResult: RoundResult = {
      roundNumber: this.state.match.currentRound,
      word: this.state.currentRound.word,
      impostorIds: this.state.currentRound.impostorIds,
      votes: { ...this.state.currentRound.votes },
      eliminatedId,
      impostorsWon,
      pointsAwarded
    };

    this.state.match.roundHistory.push(roundResult);
    this.state.lastResult = roundResult;
    this.state.currentRound = null;

    // Determine next phase
    if (this.state.match.currentRound >= this.state.settings.totalRounds) {
      // Match is over - show podium
      this.state.phase = "podium";
    } else {
      // Show leaderboard before next round
      this.state.phase = "leaderboard";
    }

    this.broadcastState();
  }

  handleNextRound(conn: Party.Connection) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Only host can advance to next round
    if (this.state.hostId !== playerId) {
      return;
    }

    if (this.state.phase !== "leaderboard" && this.state.phase !== "results") {
      return;
    }

    if (!this.state.match) return;

    // Increment round counter
    this.state.match.currentRound++;

    // Start the next round
    this.startRound();
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
    this.state.match = null;
    this.state.lastResult = null;
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

  handleSubmitClue(conn: Party.Connection, clue: string) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Must be in playing or clues phase
    if (this.state.phase !== "playing" && this.state.phase !== "clues") {
      return;
    }

    if (!this.state.currentRound) return;

    // Check if it's this player's turn
    const currentTurnPlayerId = this.state.currentRound.turnOrder[this.state.currentRound.currentTurnIndex];
    if (currentTurnPlayerId !== playerId) {
      const errorMessage: ServerMessage = {
        type: "error",
        message: "It's not your turn"
      };
      conn.send(JSON.stringify(errorMessage));
      return;
    }

    // Check if player already gave a clue
    if (this.state.currentRound.clues.some(c => c.playerId === playerId)) {
      return;
    }

    const player = this.state.players.find(p => p.id === playerId);

    // Add the clue
    this.state.currentRound.clues.push({
      playerId,
      playerName: player?.name ?? playerId,
      clue: clue.trim(),
      timestamp: Date.now()
    });

    // Move to next turn
    this.state.currentRound.currentTurnIndex++;

    // If we're still in playing phase and someone gave a clue, move to clues phase
    if (this.state.phase === "playing") {
      this.state.phase = "clues";
    }

    // Check if all players have given clues - auto advance to voting
    if (this.state.currentRound.clues.length >= this.state.currentRound.turnOrder.length) {
      this.state.phase = "voting";
    }

    this.broadcastState();
  }

  handleMarkClueDone(conn: Party.Connection) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Must be in playing or clues phase
    if (this.state.phase !== "playing" && this.state.phase !== "clues") {
      return;
    }

    if (!this.state.currentRound) return;

    // Check if it's this player's turn
    const currentTurnPlayerId = this.state.currentRound.turnOrder[this.state.currentRound.currentTurnIndex];
    if (currentTurnPlayerId !== playerId) {
      const errorMessage: ServerMessage = {
        type: "error",
        message: "It's not your turn"
      };
      conn.send(JSON.stringify(errorMessage));
      return;
    }

    // Check if player already gave a clue
    if (this.state.currentRound.clues.some(c => c.playerId === playerId)) {
      return;
    }

    const player = this.state.players.find(p => p.id === playerId);

    // Mark as done (no written clue in offline mode)
    this.state.currentRound.clues.push({
      playerId,
      playerName: player?.name ?? playerId,
      clue: null,
      timestamp: Date.now()
    });

    // Move to next turn
    this.state.currentRound.currentTurnIndex++;

    // If we're still in playing phase and someone marked done, move to clues phase
    if (this.state.phase === "playing") {
      this.state.phase = "clues";
    }

    // Check if all players have given clues - auto advance to voting
    if (this.state.currentRound.clues.length >= this.state.currentRound.turnOrder.length) {
      this.state.phase = "voting";
    }

    this.broadcastState();
  }

  handleStartVoting(conn: Party.Connection) {
    const playerId = this.getPlayerIdByConnection(conn.id);
    if (!playerId) return;

    // Only host can start voting
    if (this.state.hostId !== playerId) {
      return;
    }

    // Must be in clues phase
    if (this.state.phase !== "clues" && this.state.phase !== "playing") {
      return;
    }

    if (!this.state.currentRound) return;

    this.state.phase = "voting";
    this.broadcastState();
  }
}
