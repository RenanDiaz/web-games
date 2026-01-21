<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { PUBLIC_PARTYKIT_HOST } from '$env/static/public';
	import { _ } from 'svelte-i18n';
	import PartySocket from 'partysocket';

	// Types
	type Screen = 'home' | 'lobby' | 'playing' | 'clues' | 'voting' | 'leaderboard' | 'podium';

	interface Player {
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

	interface RoundResult {
		roundNumber: number;
		word: string;
		impostorIds: string[];
		votes: Record<string, string>;
		eliminatedId: string | null;
		impostorsWon: boolean;
		pointsAwarded: Record<string, number>;
	}

	interface PublicGameState {
		phase: 'lobby' | 'playing' | 'clues' | 'voting' | 'results' | 'leaderboard' | 'podium';
		players: Player[];
		hostId: string | null;
		settings: {
			impostorCount: number;
			category: string;
			customWords: string[];
			totalRounds: number;
			clueMode: 'chat' | 'offline';
		};
		match: {
			currentRound: number;
			totalRounds: number;
			scores: Record<string, { name: string; score: number }>;
		} | null;
		currentRound: {
			hasVoted: boolean;
			myVote: string | null;
			votes: PublicVoteInfo[];
			voteCount: number;
			totalPlayers: number;
			// Clue turn info
			turnOrder: { playerId: string; playerName: string }[];
			currentTurnIndex: number;
			currentTurnPlayerId: string | null;
			isMyTurn: boolean;
			clues: PublicClueEntry[];
			allCluesDone: boolean;
		} | null;
		lastResult: RoundResult | null;
		myId: string;
	}

	type ServerMessage =
		| { type: 'state'; state: PublicGameState }
		| { type: 'role'; isImpostor: boolean; word: string | null }
		| { type: 'error'; message: string }
		| { type: 'kicked' };

	// Constants
	const PARTYKIT_HOST = PUBLIC_PARTYKIT_HOST || 'localhost:1999';
	const PLAYER_ID_KEY = 'impostor_player_id';
	const SESSION_ROOM_KEY = 'impostor_session_room';

	const CATEGORIES = ['animals', 'food', 'places', 'objects', 'professions'];

	// Generate or retrieve persistent player ID
	function getOrCreatePlayerId(): string {
		if (!browser) return '';
		let playerId = localStorage.getItem(PLAYER_ID_KEY);
		if (!playerId) {
			// Generate a unique ID (UUID-like)
			playerId = 'p_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
			localStorage.setItem(PLAYER_ID_KEY, playerId);
		}
		return playerId;
	}

	// State
	let screen: Screen = $state('home');
	let playerName = $state('');
	let roomCode = $state('');
	let joinRoomCode = $state('');
	let errorMessage = $state('');
	let socket: PartySocket | null = $state(null);
	let gameState: PublicGameState | null = $state(null);
	let myRole: { isImpostor: boolean; word: string | null } | null = $state(null);
	let selectedVote: string | null = $state(null);
	let showRole = $state(false);
	let customWordsInput = $state('');
	let connectionStatus = $state<'connecting' | 'connected' | 'disconnected'>('disconnected');
	let clueInput = $state('');
	let hasRoomFromUrl = $state(false);

	// Derived helpers
	function getIsHost(): boolean {
		if (!gameState) return false;
		return gameState.hostId === gameState.myId;
	}

	function getConnectedPlayers(): Player[] {
		if (!gameState) return [];
		return gameState.players.filter((p) => p.isConnected);
	}

	// Derived
	const isHost = $derived(getIsHost());
	const connectedPlayers = $derived(getConnectedPlayers());
	const canStart = $derived(connectedPlayers.length >= 3);
	const sortedLeaderboard = $derived(getSortedLeaderboard());

	// Lifecycle
	onMount(() => {
		if (browser) {
			const savedName = localStorage.getItem('impostor_player_name');
			if (savedName) playerName = savedName;

			// Check if there's a room code in the URL
			const urlParams = new URLSearchParams(window.location.search);
			const roomParam = urlParams.get('room');
			if (roomParam) {
				joinRoomCode = roomParam.toUpperCase();
				hasRoomFromUrl = true;
				// Clean up the URL without reloading
				window.history.replaceState({}, '', '/impostor');
			}

			// Try to reconnect to previous session
			const savedRoom = sessionStorage.getItem(SESSION_ROOM_KEY);
			if (savedRoom && savedName) {
				roomCode = savedRoom;
				connectToRoom(savedRoom);
			}
		}
	});

	onDestroy(() => {
		if (socket) {
			socket.close();
		}
	});

	// Room management
	function generateRoomCode(): string {
		const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		let code = '';
		for (let i = 0; i < 4; i++) {
			code += chars[Math.floor(Math.random() * chars.length)];
		}
		return code;
	}

	function createRoom() {
		if (!playerName.trim()) {
			errorMessage = $_('impostor.errors.enterName');
			return;
		}

		const code = generateRoomCode();
		roomCode = code;
		connectToRoom(code);
	}

	function joinRoom() {
		if (!playerName.trim()) {
			errorMessage = $_('impostor.errors.enterName');
			return;
		}

		if (!joinRoomCode.trim()) {
			errorMessage = $_('impostor.errors.enterRoomCode');
			return;
		}

		roomCode = joinRoomCode.toUpperCase();
		connectToRoom(roomCode);
	}

	function connectToRoom(code: string) {
		if (browser) {
			localStorage.setItem('impostor_player_name', playerName.trim());
			// Save room code for reconnection
			sessionStorage.setItem(SESSION_ROOM_KEY, code.toUpperCase());
		}

		connectionStatus = 'connecting';
		errorMessage = '';

		socket = new PartySocket({
			host: PARTYKIT_HOST,
			room: code.toLowerCase(),
			party: 'main'
		});

		socket.addEventListener('open', () => {
			connectionStatus = 'connected';
			// Join the room with our name and persistent player ID
			const playerId = getOrCreatePlayerId();
			socket?.send(JSON.stringify({ type: 'join', name: playerName.trim(), playerId }));
		});

		socket.addEventListener('message', (event) => {
			try {
				const message = JSON.parse(event.data) as ServerMessage;
				handleServerMessage(message);
			} catch (e) {
				console.error('Error parsing message:', e);
			}
		});

		socket.addEventListener('close', () => {
			connectionStatus = 'disconnected';
		});

		socket.addEventListener('error', () => {
			connectionStatus = 'disconnected';
			errorMessage = $_('impostor.errors.connectionFailed');
		});
	}

	function handleServerMessage(message: ServerMessage) {
		switch (message.type) {
			case 'state':
				gameState = message.state;
				updateScreen(message.state.phase);
				break;
			case 'role':
				myRole = { isImpostor: message.isImpostor, word: message.word };
				showRole = false;
				break;
			case 'error':
				errorMessage = message.message;
				break;
			case 'kicked':
				disconnect();
				errorMessage = $_('impostor.errors.kicked');
				break;
		}
	}

	function updateScreen(phase: PublicGameState['phase']) {
		switch (phase) {
			case 'lobby':
				screen = 'lobby';
				myRole = null;
				selectedVote = null;
				clueInput = '';
				break;
			case 'playing':
				screen = 'playing';
				break;
			case 'clues':
				screen = 'clues';
				break;
			case 'voting':
				screen = 'voting';
				break;
			case 'results':
			case 'leaderboard':
				screen = 'leaderboard';
				break;
			case 'podium':
				screen = 'podium';
				break;
		}
	}

	function disconnect() {
		socket?.close();
		socket = null;
		gameState = null;
		myRole = null;
		screen = 'home';
		roomCode = '';
		selectedVote = null;
		showRole = false;
		// Clear session data
		if (browser) {
			sessionStorage.removeItem(SESSION_ROOM_KEY);
		}
	}

	// Game actions
	function startGame() {
		socket?.send(JSON.stringify({ type: 'start-game' }));
	}

	function updateSettings(settings: Partial<PublicGameState['settings']>) {
		socket?.send(JSON.stringify({ type: 'update-settings', settings }));
	}

	function vote(targetId: string) {
		selectedVote = targetId;
		socket?.send(JSON.stringify({ type: 'vote', targetId }));
	}

	function nextRound() {
		socket?.send(JSON.stringify({ type: 'next-round' }));
	}

	function submitClue() {
		if (!clueInput.trim()) return;
		socket?.send(JSON.stringify({ type: 'submit-clue', clue: clueInput.trim() }));
		clueInput = '';
	}

	function markClueDone() {
		socket?.send(JSON.stringify({ type: 'mark-clue-done' }));
	}

	function startVoting() {
		socket?.send(JSON.stringify({ type: 'start-voting' }));
	}

	function backToLobby() {
		selectedVote = null;
		socket?.send(JSON.stringify({ type: 'back-to-lobby' }));
	}

	// Helper to check if there's a vote tie
	function checkForTie(): { isTie: boolean; tiedPlayers: string[] } {
		if (!gameState?.currentRound) return { isTie: false, tiedPlayers: [] };

		const votes = gameState.currentRound.votes;
		const voteCount = gameState.currentRound.voteCount;
		const totalPlayers = gameState.currentRound.totalPlayers;

		// Only check for tie if all players have voted
		if (voteCount < totalPlayers) return { isTie: false, tiedPlayers: [] };

		// Count votes for each player
		const voteCounts: Record<string, number> = {};
		for (const vote of votes) {
			if (vote.votedForId) {
				voteCounts[vote.votedForId] = (voteCounts[vote.votedForId] || 0) + 1;
			}
		}

		// Find max votes
		const maxVotes = Math.max(...Object.values(voteCounts), 0);
		const playersWithMaxVotes = Object.entries(voteCounts)
			.filter(([_, count]) => count === maxVotes)
			.map(([playerId]) => playerId);

		return {
			isTie: playersWithMaxVotes.length > 1,
			tiedPlayers: playersWithMaxVotes
		};
	}

	// Helper to get vote counts for display
	function getVoteCountsForPlayer(playerId: string): number {
		if (!gameState?.currentRound) return 0;
		return gameState.currentRound.votes.filter(v => v.votedForId === playerId).length;
	}

	// Get sorted leaderboard
	function getSortedLeaderboard(): { playerId: string; name: string; score: number }[] {
		if (!gameState?.match?.scores) return [];
		return Object.entries(gameState.match.scores)
			.map(([playerId, data]) => ({ playerId, name: data.name, score: data.score }))
			.sort((a, b) => b.score - a.score);
	}

	function kickPlayer(playerId: string) {
		socket?.send(JSON.stringify({ type: 'kick-player', playerId }));
	}

	function addCustomWords() {
		if (!customWordsInput.trim()) return;
		const words = customWordsInput
			.split(',')
			.map((w) => w.trim())
			.filter((w) => w.length > 0);
		if (words.length > 0) {
			const currentWords = gameState?.settings.customWords ?? [];
			updateSettings({ customWords: [...currentWords, ...words] });
			customWordsInput = '';
		}
	}

	function removeCustomWord(word: string) {
		const currentWords = gameState?.settings.customWords ?? [];
		updateSettings({ customWords: currentWords.filter((w) => w !== word) });
	}

	function clearCustomWords() {
		updateSettings({ customWords: [] });
	}

	function copyRoomCode() {
		if (browser) {
			navigator.clipboard.writeText(roomCode);
		}
	}

	function getRoomUrl(): string {
		if (browser) {
			return `${window.location.origin}/impostor?room=${roomCode}`;
		}
		return '';
	}

	async function shareRoom() {
		if (!browser) return;

		const roomUrl = getRoomUrl();
		const shareData = {
			title: $_('impostor.title'),
			text: $_('impostor.lobby.shareText', { values: { code: roomCode } }),
			url: roomUrl
		};

		// Use Web Share API if available
		if (navigator.share && navigator.canShare?.(shareData)) {
			try {
				await navigator.share(shareData);
			} catch (err) {
				// User cancelled or error - fall back to copy
				if ((err as Error).name !== 'AbortError') {
					await navigator.clipboard.writeText(roomUrl);
				}
			}
		} else {
			// Fallback: copy URL to clipboard
			await navigator.clipboard.writeText(roomUrl);
		}
	}

	function getPlayerName(playerId: string): string {
		return gameState?.players.find((p) => p.id === playerId)?.name ?? playerId;
	}

	function cancelJoinFromUrl() {
		hasRoomFromUrl = false;
		joinRoomCode = '';
	}
</script>

<svelte:head>
	<title>{$_('impostor.title')} - Web Games</title>
</svelte:head>

<div class="container">
	{#if screen === 'home'}
		<!-- Home Screen -->
		<div class="home-screen">
			<h1>{$_('impostor.title')}</h1>
			<p class="subtitle">{$_('impostor.subtitle')}</p>

			{#if errorMessage}
				<div class="error-message">{errorMessage}</div>
			{/if}

			{#if hasRoomFromUrl}
				<!-- Joining from shared link -->
				<div class="join-from-link">
					<div class="join-room-code-display">
						<span class="label">{$_('impostor.home.joiningRoom')}</span>
						<span class="code">{joinRoomCode}</span>
					</div>

					<div class="form-group">
						<label for="playerName">{$_('impostor.home.yourName')}</label>
						<input
							type="text"
							id="playerName"
							bind:value={playerName}
							placeholder={$_('impostor.home.namePlaceholder')}
							maxlength="20"
							onkeypress={(e) => e.key === 'Enter' && joinRoom()}
						/>
					</div>

					<button class="btn primary large" onclick={joinRoom}>
						{$_('impostor.home.joinRoom')}
					</button>

					<button class="btn-link cancel-link" onclick={cancelJoinFromUrl}>
						{$_('impostor.home.createInstead')}
					</button>
				</div>
			{:else}
				<!-- Normal home screen -->
				<div class="form-group">
					<label for="playerName">{$_('impostor.home.yourName')}</label>
					<input
						type="text"
						id="playerName"
						bind:value={playerName}
						placeholder={$_('impostor.home.namePlaceholder')}
						maxlength="20"
					/>
				</div>

				<div class="home-actions">
					<button class="btn primary large" onclick={createRoom}>
						{$_('impostor.home.createRoom')}
					</button>

					<div class="divider">
						<span>{$_('impostor.home.or')}</span>
					</div>

					<div class="join-section">
						<input
							type="text"
							bind:value={joinRoomCode}
							placeholder={$_('impostor.home.roomCodePlaceholder')}
							maxlength="4"
							class="room-code-input"
						/>
						<button class="btn secondary" onclick={joinRoom}>
							{$_('impostor.home.joinRoom')}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{:else if screen === 'lobby'}
		<!-- Lobby Screen -->
		<div class="lobby-screen">
			<div class="lobby-header">
				<button class="btn back" onclick={disconnect}>&larr;</button>
				<h1>{$_('impostor.lobby.title')}</h1>
			</div>

			<div
				class="room-code-display"
				onclick={copyRoomCode}
				onkeypress={(e) => e.key === 'Enter' && copyRoomCode()}
				role="button"
				tabindex="0"
			>
				<span class="label">{$_('impostor.lobby.roomCode')}</span>
				<span class="code">{roomCode}</span>
				<span class="hint">{$_('impostor.lobby.tapToCopy')}</span>
			</div>

			<button class="btn share-btn" onclick={shareRoom}>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="18" cy="5" r="3"></circle>
					<circle cx="6" cy="12" r="3"></circle>
					<circle cx="18" cy="19" r="3"></circle>
					<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
					<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
				</svg>
				{$_('impostor.lobby.shareRoom')}
			</button>

			<div class="players-section">
				<h2>{$_('impostor.lobby.players')} ({connectedPlayers.length})</h2>
				<ul class="players-list">
					{#each gameState?.players ?? [] as player}
						<li class:disconnected={!player.isConnected} class:is-me={player.id === gameState?.myId}>
							<span class="player-name">
								{player.name}
								{#if player.isHost}
									<span class="host-badge">{$_('impostor.lobby.host')}</span>
								{/if}
								{#if player.id === gameState?.myId}
									<span class="you-badge">{$_('impostor.lobby.you')}</span>
								{/if}
							</span>
							{#if !player.isConnected}
								<span class="status">{$_('impostor.lobby.disconnected')}</span>
							{/if}
							{#if isHost && player.id !== gameState?.myId}
								<button class="btn-icon kick" onclick={() => kickPlayer(player.id)} title={$_('impostor.lobby.kick')}>
									&times;
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			</div>

			{#if isHost}
				<div class="settings-section">
					<h2>{$_('impostor.lobby.settings')}</h2>

					<div class="setting-row">
						<label for="impostorCount">{$_('impostor.lobby.impostorCount')}</label>
						<select
							id="impostorCount"
							value={gameState?.settings.impostorCount}
							onchange={(e) => updateSettings({ impostorCount: parseInt(e.currentTarget.value) })}
						>
							<option value="1">1</option>
							<option value="2">2</option>
							<option value="3">3</option>
						</select>
					</div>

					<div class="setting-row">
						<label for="totalRounds">{$_('impostor.lobby.totalRounds')}</label>
						<select
							id="totalRounds"
							value={gameState?.settings.totalRounds}
							onchange={(e) => updateSettings({ totalRounds: parseInt(e.currentTarget.value) })}
						>
							<option value="3">3</option>
							<option value="5">5</option>
							<option value="7">7</option>
							<option value="10">10</option>
						</select>
					</div>

					<div class="setting-row">
						<label for="category">{$_('impostor.lobby.category')}</label>
						<select
							id="category"
							value={gameState?.settings.category}
							onchange={(e) => updateSettings({ category: e.currentTarget.value })}
							disabled={(gameState?.settings.customWords?.length ?? 0) > 0}
						>
							{#each CATEGORIES as cat}
								<option value={cat}>{$_(`impostor.categories.${cat}`)}</option>
							{/each}
						</select>
					</div>

					<div class="setting-row">
						<label for="clueMode">{$_('impostor.lobby.clueMode')}</label>
						<select
							id="clueMode"
							value={gameState?.settings.clueMode}
							onchange={(e) => updateSettings({ clueMode: e.currentTarget.value as 'chat' | 'offline' })}
						>
							<option value="offline">{$_('impostor.lobby.clueModeOffline')}</option>
							<option value="chat">{$_('impostor.lobby.clueModeChat')}</option>
						</select>
					</div>

					<div class="custom-words-section">
						<label>{$_('impostor.lobby.customWords')}</label>
						<div class="custom-words-input">
							<input
								type="text"
								bind:value={customWordsInput}
								placeholder={$_('impostor.lobby.customWordsPlaceholder')}
								onkeypress={(e) => e.key === 'Enter' && addCustomWords()}
							/>
							<button class="btn small" onclick={addCustomWords}>{$_('impostor.lobby.add')}</button>
						</div>
						{#if (gameState?.settings.customWords?.length ?? 0) > 0}
							<div class="custom-words-list">
								{#each gameState?.settings.customWords ?? [] as word}
									<span class="word-tag">
										{word}
										<button onclick={() => removeCustomWord(word)}>&times;</button>
									</span>
								{/each}
								<button class="btn-link" onclick={clearCustomWords}>{$_('impostor.lobby.clearAll')}</button>
							</div>
							<p class="custom-words-hint">{$_('impostor.lobby.customWordsActive')}</p>
						{/if}
					</div>
				</div>

				<button class="btn primary large start-btn" onclick={startGame} disabled={!canStart}>
					{#if canStart}
						{$_('impostor.lobby.startGame')}
					{:else}
						{$_('impostor.lobby.needMorePlayers')}
					{/if}
				</button>
			{:else}
				<div class="waiting-message">
					<p>{$_('impostor.lobby.waitingForHost')}</p>
				</div>
			{/if}
		</div>
	{:else if screen === 'playing'}
		<!-- Playing Screen - Role Reveal -->
		<div class="playing-screen">
			<!-- Round indicator -->
			{#if gameState?.match}
				<div class="round-indicator">
					{$_('impostor.playing.round', { values: { current: gameState.match.currentRound, total: gameState.match.totalRounds } })}
				</div>
			{/if}

			<div class="role-card" class:impostor={myRole?.isImpostor} class:revealed={showRole}>
				{#if !showRole}
					<div class="role-hidden">
						<p>{$_('impostor.playing.tapToReveal')}</p>
						<button class="btn primary large" onclick={() => (showRole = true)}>
							{$_('impostor.playing.showRole')}
						</button>
					</div>
				{:else}
					<div class="role-revealed">
						{#if myRole?.isImpostor}
							<div class="role-icon impostor-icon">?</div>
							<h2>{$_('impostor.playing.youAreImpostor')}</h2>
							<p class="role-hint">{$_('impostor.playing.impostorHint')}</p>
						{:else}
							<div class="role-icon citizen-icon">&#10004;</div>
							<h2>{$_('impostor.playing.youAreCitizen')}</h2>
							<div class="secret-word">
								<span class="label">{$_('impostor.playing.secretWord')}</span>
								<span class="word">{myRole?.word}</span>
							</div>
						{/if}
						<button class="btn secondary" onclick={() => (showRole = false)}>
							{$_('impostor.playing.hideRole')}
						</button>
					</div>
				{/if}
			</div>

			<div class="game-info">
				<p>
					{$_('impostor.playing.playersCount', { values: { count: connectedPlayers.length } })}
				</p>
				<p>
					{$_('impostor.playing.impostorsCount', { values: { count: gameState?.settings.impostorCount } })}
				</p>
			</div>

			<!-- Turn order preview -->
			<div class="clues-section">
				<h3>{$_('impostor.clues.turnOrder')}</h3>
				<ol class="turn-order-list">
					{#each gameState?.currentRound?.turnOrder ?? [] as turn, index}
						<li class:current={index === 0} class:is-me={turn.playerId === gameState?.myId}>
							<span class="turn-number">{index + 1}</span>
							<span class="turn-name">{turn.playerName}</span>
							{#if turn.playerId === gameState?.myId}
								<span class="you-badge">{$_('impostor.lobby.you')}</span>
							{/if}
							{#if index === 0}
								<span class="current-badge">{$_('impostor.clues.first')}</span>
							{/if}
						</li>
					{/each}
				</ol>

				<!-- First player starts giving clues -->
				{#if gameState?.currentRound?.isMyTurn}
					<div class="my-turn-indicator">
						<p>{$_('impostor.clues.youStart')}</p>
						{#if gameState?.settings.clueMode === 'chat'}
							<div class="clue-input-section">
								<input
									type="text"
									bind:value={clueInput}
									placeholder={$_('impostor.clues.writeCluePlaceholder')}
									maxlength="100"
									onkeypress={(e) => e.key === 'Enter' && submitClue()}
								/>
								<button class="btn primary" onclick={submitClue} disabled={!clueInput.trim()}>
									{$_('impostor.clues.submitClue')}
								</button>
							</div>
						{:else}
							<button class="btn primary large" onclick={markClueDone}>
								{$_('impostor.clues.iGaveMyClue')}
							</button>
						{/if}
					</div>
				{:else}
					<div class="waiting-turn">
						<p>{$_('impostor.clues.waitingForFirst', { values: { name: gameState?.currentRound?.turnOrder[0]?.playerName ?? '' } })}</p>
					</div>
				{/if}
			</div>
		</div>
	{:else if screen === 'clues'}
		<!-- Clues Screen -->
		<div class="clues-screen">
			<!-- Round indicator -->
			{#if gameState?.match}
				<div class="round-indicator">
					{$_('impostor.playing.round', { values: { current: gameState.match.currentRound, total: gameState.match.totalRounds } })}
				</div>
			{/if}

			<!-- Compact role reminder -->
			<div class="role-reminder" class:impostor={myRole?.isImpostor}>
				{#if myRole?.isImpostor}
					<span class="role-badge impostor">{$_('impostor.playing.youAreImpostor')}</span>
				{:else}
					<span class="role-badge citizen">{$_('impostor.playing.youAreCitizen')}</span>
					<span class="word-reminder">{myRole?.word}</span>
				{/if}
			</div>

			<div class="clues-section">
				<h3>{$_('impostor.clues.title')}</h3>
				<p class="clues-progress">
					{$_('impostor.clues.progress', { values: { current: gameState?.currentRound?.clues.filter(c => c.done).length ?? 0, total: gameState?.currentRound?.turnOrder.length ?? 0 } })}
				</p>

				<!-- Turn order with status -->
				<ol class="turn-order-list">
					{#each gameState?.currentRound?.turnOrder ?? [] as turn, index}
						{@const clueEntry = gameState?.currentRound?.clues.find(c => c.playerId === turn.playerId)}
						{@const isCurrent = index === gameState?.currentRound?.currentTurnIndex}
						<li class:done={clueEntry?.done} class:current={isCurrent} class:is-me={turn.playerId === gameState?.myId}>
							<span class="turn-number">{index + 1}</span>
							<span class="turn-name">{turn.playerName}</span>
							{#if turn.playerId === gameState?.myId}
								<span class="you-badge">{$_('impostor.lobby.you')}</span>
							{/if}
							{#if clueEntry?.done}
								<span class="done-badge">&#10004;</span>
								{#if clueEntry?.clue && gameState?.settings.clueMode === 'chat'}
									<span class="clue-text">"{clueEntry.clue}"</span>
								{/if}
							{:else if isCurrent}
								<span class="current-badge">{$_('impostor.clues.currentTurn')}</span>
							{/if}
						</li>
					{/each}
				</ol>

				<!-- My turn to give clue -->
				{#if gameState?.currentRound?.isMyTurn}
					<div class="my-turn-indicator">
						<p>{$_('impostor.clues.yourTurn')}</p>
						{#if gameState?.settings.clueMode === 'chat'}
							<div class="clue-input-section">
								<input
									type="text"
									bind:value={clueInput}
									placeholder={$_('impostor.clues.writeCluePlaceholder')}
									maxlength="100"
									onkeypress={(e) => e.key === 'Enter' && submitClue()}
								/>
								<button class="btn primary" onclick={submitClue} disabled={!clueInput.trim()}>
									{$_('impostor.clues.submitClue')}
								</button>
							</div>
						{:else}
							<button class="btn primary large" onclick={markClueDone}>
								{$_('impostor.clues.iGaveMyClue')}
							</button>
						{/if}
					</div>
				{:else if !gameState?.currentRound?.allCluesDone}
					<div class="waiting-turn">
						<p>{$_('impostor.clues.waitingFor', { values: { name: gameState?.currentRound?.turnOrder[gameState?.currentRound?.currentTurnIndex]?.playerName ?? '' } })}</p>
					</div>
				{/if}

				<!-- All clues done - ready to vote -->
				{#if gameState?.currentRound?.allCluesDone}
					<div class="all-done-message">
						<p>{$_('impostor.clues.allDone')}</p>
						{#if isHost}
							<button class="btn primary large" onclick={startVoting}>
								{$_('impostor.clues.startVoting')}
							</button>
						{:else}
							<p class="waiting-host">{$_('impostor.clues.waitingForHostVoting')}</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else if screen === 'voting'}
		<!-- Voting Screen -->
		<div class="voting-screen">
			<!-- Round indicator -->
			{#if gameState?.match}
				<div class="round-indicator">
					{$_('impostor.playing.round', { values: { current: gameState.match.currentRound, total: gameState.match.totalRounds } })}
				</div>
			{/if}

			<!-- Show clues given (in chat mode) -->
			{#if gameState?.settings.clueMode === 'chat' && (gameState?.currentRound?.clues.length ?? 0) > 0}
				<div class="clues-recap">
					<h3>{$_('impostor.voting.cluesGiven')}</h3>
					<ul class="clues-list">
						{#each gameState?.currentRound?.clues ?? [] as clue}
							<li>
								<span class="clue-author">{clue.playerName}:</span>
								<span class="clue-content">"{clue.clue}"</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div class="voting-section">
				<h3>{$_('impostor.voting.title')}</h3>
				<p class="voting-instruction">{$_('impostor.voting.instruction')}</p>

				<div class="vote-status">
					{$_('impostor.voting.votesCount', {
						values: {
							current: gameState?.currentRound?.voteCount ?? 0,
							total: gameState?.currentRound?.totalPlayers ?? 0
						}
					})}
				</div>

				{#if checkForTie().isTie}
					<div class="tie-warning">
						{$_('impostor.voting.tieWarning')}
					</div>
				{/if}

				<ul class="voting-list">
					{#each connectedPlayers.filter((p) => p.id !== gameState?.myId) as player}
						{@const voteCount = getVoteCountsForPlayer(player.id)}
						{@const tieInfo = checkForTie()}
						{@const isTied = tieInfo.isTie && tieInfo.tiedPlayers.includes(player.id)}
						<li>
							<button
								class="vote-btn"
								class:selected={gameState?.currentRound?.myVote === player.id}
								class:tied={isTied}
								onclick={() => vote(player.id)}
							>
								<span class="player-vote-name">{player.name}</span>
								<span class="vote-count-badge" class:has-votes={voteCount > 0}>
									{voteCount}
								</span>
							</button>
						</li>
					{/each}
				</ul>

				<!-- Show who voted for whom -->
				{#if (gameState?.currentRound?.voteCount ?? 0) > 0}
					<div class="live-votes">
						<h4>{$_('impostor.voting.currentVotes')}</h4>
						<ul class="votes-list">
							{#each gameState?.currentRound?.votes ?? [] as vote}
								{#if vote.votedForId}
									<li>
										<span class="voter">{vote.odplayerName}</span>
										<span class="arrow">&rarr;</span>
										<span class="voted">{vote.votedForName}</span>
									</li>
								{:else}
									<li class="not-voted">
										<span class="voter">{vote.odplayerName}</span>
										<span class="pending">{$_('impostor.voting.notVotedYet')}</span>
									</li>
								{/if}
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		</div>
	{:else if screen === 'leaderboard'}
		<!-- Leaderboard Screen (between rounds) -->
		<div class="leaderboard-screen">
			{#if gameState?.lastResult}
				<!-- Round result header -->
				<div class="round-result-header">
					<h1>
						{#if gameState.lastResult.impostorsWon}
							{$_('impostor.results.impostorsWon')}
						{:else}
							{$_('impostor.results.citizensWon')}
						{/if}
					</h1>

					<div class="result-details">
						<div class="result-item">
							<span class="label">{$_('impostor.results.secretWord')}</span>
							<span class="value">{gameState.lastResult.word}</span>
						</div>

						<div class="result-item">
							<span class="label">{$_('impostor.results.impostorsWere')}</span>
							<span class="value impostors">
								{gameState.lastResult.impostorIds.map(getPlayerName).join(', ')}
							</span>
						</div>

						{#if gameState.lastResult.eliminatedId}
							<div class="result-item">
								<span class="label">{$_('impostor.results.eliminated')}</span>
								<span class="value eliminated">
									{getPlayerName(gameState.lastResult.eliminatedId)}
								</span>
							</div>
						{/if}
					</div>

					<!-- Points awarded this round -->
					<div class="points-awarded">
						<h3>{$_('impostor.results.pointsThisRound')}</h3>
						<ul>
							{#each Object.entries(gameState.lastResult.pointsAwarded) as [playerId, points]}
								<li class:positive={points > 0}>
									<span class="player-name">{getPlayerName(playerId)}</span>
									<span class="points">+{points}</span>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}

			<!-- Leaderboard -->
			<div class="leaderboard">
				<h2>{$_('impostor.leaderboard.title')}</h2>
				{#if gameState?.match}
					<p class="round-progress">
						{$_('impostor.leaderboard.roundProgress', {
							values: {
								current: gameState.match.currentRound,
								total: gameState.match.totalRounds
							}
						})}
					</p>
				{/if}

				<ol class="leaderboard-list">
					{#each getSortedLeaderboard() as entry, index}
						<li class:first={index === 0} class:second={index === 1} class:third={index === 2} class:is-me={entry.playerId === gameState?.myId}>
							<span class="position">{index + 1}</span>
							<span class="name">{entry.name}</span>
							<span class="score">{entry.score} pts</span>
						</li>
					{/each}
				</ol>
			</div>

			{#if isHost}
				<div class="leaderboard-actions">
					<button class="btn primary large" onclick={nextRound}>
						{$_('impostor.leaderboard.nextRound')}
					</button>
				</div>
			{:else}
				<p class="waiting-message">{$_('impostor.leaderboard.waitingForHost')}</p>
			{/if}
		</div>
	{:else if screen === 'podium'}
		<!-- Podium Screen (end of match) -->
		<div class="podium-screen">
			<h1>{$_('impostor.podium.title')}</h1>

			<!-- Podium display -->
			<div class="podium">
				{#if sortedLeaderboard.length >= 2}
					<div class="podium-place second">
						<div class="player-avatar">2</div>
						<div class="player-name">{sortedLeaderboard[1].name}</div>
						<div class="player-score">{sortedLeaderboard[1].score} pts</div>
						<div class="podium-block"></div>
					</div>
				{/if}

				{#if sortedLeaderboard.length >= 1}
					<div class="podium-place first">
						<div class="crown">&#128081;</div>
						<div class="player-avatar">1</div>
						<div class="player-name">{sortedLeaderboard[0].name}</div>
						<div class="player-score">{sortedLeaderboard[0].score} pts</div>
						<div class="podium-block"></div>
					</div>
				{/if}

				{#if sortedLeaderboard.length >= 3}
					<div class="podium-place third">
						<div class="player-avatar">3</div>
						<div class="player-name">{sortedLeaderboard[2].name}</div>
						<div class="player-score">{sortedLeaderboard[2].score} pts</div>
						<div class="podium-block"></div>
					</div>
				{/if}
			</div>

			<!-- Full standings -->
			<div class="full-standings">
				<h3>{$_('impostor.podium.finalStandings')}</h3>
				<ol class="standings-list">
					{#each sortedLeaderboard as entry, index}
						<li class:is-me={entry.playerId === gameState?.myId}>
							<span class="position">{index + 1}</span>
							<span class="name">{entry.name}</span>
							<span class="score">{entry.score} pts</span>
						</li>
					{/each}
				</ol>
			</div>

			{#if isHost}
				<div class="podium-actions">
					<button class="btn primary large" onclick={backToLobby}>
						{$_('impostor.podium.playAgain')}
					</button>
				</div>
			{:else}
				<p class="waiting-message">{$_('impostor.podium.waitingForHost')}</p>
			{/if}
		</div>
	{/if}

	{#if connectionStatus === 'connecting'}
		<div class="loading-overlay">
			<div class="spinner"></div>
			<p>{$_('impostor.connecting')}</p>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 500px;
		margin: 0 auto;
		padding: 1rem;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	h1 {
		text-align: center;
		margin-bottom: 0.5rem;
	}

	h2 {
		font-size: 1.2rem;
		margin-bottom: 0.75rem;
	}

	.subtitle {
		text-align: center;
		color: #888;
		margin-bottom: 2rem;
	}

	.error-message {
		background: #ff4444;
		color: white;
		padding: 0.75rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		text-align: center;
	}

	/* Buttons */
	.btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn.primary {
		background: #6366f1;
		color: white;
	}

	.btn.primary:hover:not(:disabled) {
		background: #4f46e5;
	}

	.btn.secondary {
		background: #374151;
		color: white;
	}

	.btn.secondary:hover:not(:disabled) {
		background: #4b5563;
	}

	.btn.danger {
		background: #ef4444;
		color: white;
	}

	.btn.danger:hover:not(:disabled) {
		background: #dc2626;
	}

	.btn.success {
		background: #22c55e;
		color: white;
	}

	.btn.success:hover:not(:disabled) {
		background: #16a34a;
	}

	.btn.large {
		padding: 1rem 2rem;
		font-size: 1.1rem;
	}

	.btn.small {
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
	}

	.btn.back {
		background: transparent;
		color: white;
		padding: 0.5rem;
		font-size: 1.5rem;
	}

	.btn-icon {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		font-size: 1.2rem;
	}

	.btn-icon.kick {
		color: #ef4444;
	}

	.btn-link {
		background: none;
		border: none;
		color: #6366f1;
		cursor: pointer;
		font-size: 0.85rem;
		text-decoration: underline;
	}

	/* Form elements */
	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	input[type='text'],
	select {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #374151;
		border-radius: 8px;
		background: #1f2937;
		color: white;
		font-size: 1rem;
	}

	input[type='text']:focus,
	select:focus {
		outline: none;
		border-color: #6366f1;
	}

	/* Home Screen */
	.home-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.home-actions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: #666;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: #374151;
	}

	.join-section {
		display: flex;
		gap: 0.5rem;
	}

	.room-code-input {
		flex: 1;
		text-transform: uppercase;
		text-align: center;
		font-size: 1.2rem;
		letter-spacing: 0.2em;
	}

	/* Join from Link Screen */
	.join-from-link {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.join-room-code-display {
		background: linear-gradient(135deg, #1f2937, #374151);
		border: 2px solid #6366f1;
		border-radius: 12px;
		padding: 1.5rem;
		text-align: center;
	}

	.join-room-code-display .label {
		display: block;
		font-size: 0.9rem;
		color: #9ca3af;
		margin-bottom: 0.5rem;
	}

	.join-room-code-display .code {
		display: block;
		font-size: 2.5rem;
		font-weight: 700;
		letter-spacing: 0.3em;
		color: #6366f1;
	}

	.cancel-link {
		text-align: center;
		margin-top: 0.5rem;
	}

	/* Lobby Screen */
	.lobby-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.lobby-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.lobby-header h1 {
		flex: 1;
		text-align: left;
		margin: 0;
	}

	.room-code-display {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		text-align: center;
		margin-bottom: 1.5rem;
		cursor: pointer;
	}

	.room-code-display .label {
		display: block;
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 0.25rem;
	}

	.room-code-display .code {
		display: block;
		font-size: 2rem;
		font-weight: 700;
		letter-spacing: 0.3em;
		color: #6366f1;
	}

	.room-code-display .hint {
		display: block;
		font-size: 0.75rem;
		color: #666;
		margin-top: 0.25rem;
	}

	.share-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: #22c55e;
		color: white;
		margin-bottom: 1.5rem;
	}

	.share-btn:hover {
		background: #16a34a;
	}

	.share-btn svg {
		flex-shrink: 0;
	}

	.players-section {
		margin-bottom: 1.5rem;
	}

	.players-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.players-list li {
		display: flex;
		align-items: center;
		padding: 0.75rem;
		background: #1f2937;
		border-radius: 8px;
		margin-bottom: 0.5rem;
	}

	.players-list li.disconnected {
		opacity: 0.5;
	}

	.players-list li.is-me {
		border: 1px solid #6366f1;
	}

	.player-name {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.host-badge {
		background: #f59e0b;
		color: black;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.you-badge {
		background: #6366f1;
		color: white;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.status {
		color: #ef4444;
		font-size: 0.85rem;
	}

	.settings-section {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.setting-row label {
		font-weight: 500;
	}

	.setting-row select {
		width: auto;
		min-width: 120px;
	}

	.custom-words-section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #374151;
	}

	.custom-words-section > label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	.custom-words-input {
		display: flex;
		gap: 0.5rem;
	}

	.custom-words-input input {
		flex: 1;
	}

	.custom-words-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
		align-items: center;
	}

	.word-tag {
		background: #374151;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.word-tag button {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		padding: 0;
		font-size: 1rem;
		line-height: 1;
	}

	.word-tag button:hover {
		color: #ef4444;
	}

	.custom-words-hint {
		font-size: 0.8rem;
		color: #f59e0b;
		margin-top: 0.5rem;
	}

	.start-btn {
		width: 100%;
		margin-top: auto;
	}

	.waiting-message {
		text-align: center;
		padding: 2rem;
		color: #888;
	}

	/* Playing Screen */
	.playing-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 2rem;
	}

	.role-card {
		background: #1f2937;
		border-radius: 16px;
		padding: 2rem;
		width: 100%;
		max-width: 350px;
		text-align: center;
		margin-bottom: 2rem;
	}

	.role-card.impostor.revealed {
		background: linear-gradient(135deg, #7f1d1d, #991b1b);
		border: 2px solid #ef4444;
	}

	.role-hidden {
		padding: 2rem 0;
	}

	.role-hidden p {
		color: #888;
		margin-bottom: 1.5rem;
	}

	.role-revealed {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.role-icon {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2.5rem;
		font-weight: bold;
	}

	.impostor-icon {
		background: #ef4444;
		color: white;
	}

	.citizen-icon {
		background: #22c55e;
		color: white;
	}

	.role-hint {
		color: #fca5a5;
		font-size: 0.9rem;
	}

	.secret-word {
		background: #374151;
		padding: 1rem;
		border-radius: 8px;
		width: 100%;
	}

	.secret-word .label {
		display: block;
		font-size: 0.8rem;
		color: #888;
		margin-bottom: 0.25rem;
	}

	.secret-word .word {
		display: block;
		font-size: 1.5rem;
		font-weight: 700;
		color: #22c55e;
	}

	.game-info {
		text-align: center;
		color: #888;
		font-size: 0.9rem;
		margin-bottom: 2rem;
	}

	.game-info p {
		margin: 0.25rem 0;
	}

	.host-controls {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		width: 100%;
		text-align: center;
	}

	.host-controls h3 {
		margin-bottom: 1rem;
		font-size: 0.9rem;
		color: #888;
	}

	.end-round-buttons {
		display: flex;
		gap: 1rem;
	}

	.end-round-buttons .btn {
		flex: 1;
	}

	/* Voting Screen */
	.voting-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.voting-instruction {
		text-align: center;
		color: #888;
		margin-bottom: 1rem;
	}

	.vote-status {
		text-align: center;
		background: #1f2937;
		padding: 0.75rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
	}

	.voting-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1.5rem 0;
	}

	.voting-list li {
		margin-bottom: 0.5rem;
	}

	.vote-btn {
		width: 100%;
		padding: 1rem;
		background: #1f2937;
		border: 2px solid #374151;
		border-radius: 8px;
		color: white;
		font-size: 1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		transition: all 0.2s;
	}

	.vote-btn:hover:not(:disabled) {
		border-color: #6366f1;
	}

	.vote-btn.selected {
		background: #6366f1;
		border-color: #6366f1;
	}

	.vote-btn.voted:not(.selected) {
		opacity: 0.5;
	}

	.vote-check {
		color: white;
		font-weight: bold;
	}

	/* Results Screen */
	.results-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 2rem;
	}

	.results-screen h1 {
		font-size: 1.8rem;
		margin-bottom: 2rem;
	}

	.result-details {
		background: #1f2937;
		border-radius: 12px;
		padding: 1.5rem;
		width: 100%;
		margin-bottom: 1.5rem;
	}

	.result-item {
		margin-bottom: 1rem;
	}

	.result-item:last-child {
		margin-bottom: 0;
	}

	.result-item .label {
		display: block;
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 0.25rem;
	}

	.result-item .value {
		font-size: 1.2rem;
		font-weight: 600;
	}

	.result-item .value.impostors {
		color: #ef4444;
	}

	.votes-summary {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		width: 100%;
		margin-bottom: 1.5rem;
	}

	.votes-summary h3 {
		font-size: 0.9rem;
		color: #888;
		margin-bottom: 0.75rem;
	}

	.votes-summary ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.votes-summary li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid #374151;
	}

	.votes-summary li:last-child {
		border-bottom: none;
	}

	.votes-summary .voter {
		flex: 1;
	}

	.votes-summary .arrow {
		color: #666;
	}

	.votes-summary .voted {
		flex: 1;
		text-align: right;
		color: #6366f1;
	}

	.result-actions {
		margin-top: auto;
		width: 100%;
	}

	.result-actions .btn {
		width: 100%;
	}

	/* Loading overlay */
	.loading-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #374151;
		border-top-color: #6366f1;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Round indicator */
	.round-indicator {
		text-align: center;
		background: #374151;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	/* Voting section in playing screen */
	.voting-section {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		width: 100%;
		margin-top: 1rem;
	}

	.voting-section h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
	}

	.tie-warning {
		background: #f59e0b;
		color: black;
		padding: 0.75rem;
		border-radius: 8px;
		text-align: center;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.vote-btn {
		width: 100%;
		padding: 1rem;
		background: #1f2937;
		border: 2px solid #374151;
		border-radius: 8px;
		color: white;
		font-size: 1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		transition: all 0.2s;
	}

	.vote-btn:hover {
		border-color: #6366f1;
	}

	.vote-btn.selected {
		background: #6366f1;
		border-color: #6366f1;
	}

	.vote-btn.tied {
		border-color: #f59e0b;
		animation: pulse 1s infinite;
	}

	@keyframes pulse {
		0%, 100% { border-color: #f59e0b; }
		50% { border-color: #fbbf24; }
	}

	.player-vote-name {
		flex: 1;
		text-align: left;
	}

	.vote-count-badge {
		background: #374151;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.85rem;
		font-weight: 600;
		min-width: 2rem;
		text-align: center;
	}

	.vote-count-badge.has-votes {
		background: #6366f1;
	}

	.live-votes {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #374151;
	}

	.live-votes h4 {
		font-size: 0.9rem;
		color: #888;
		margin-bottom: 0.5rem;
	}

	.votes-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.votes-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0;
		font-size: 0.9rem;
	}

	.votes-list li.not-voted {
		opacity: 0.5;
	}

	.votes-list .voter {
		flex: 1;
	}

	.votes-list .arrow {
		color: #666;
	}

	.votes-list .voted {
		flex: 1;
		text-align: right;
		color: #6366f1;
	}

	.votes-list .pending {
		flex: 1;
		text-align: right;
		color: #888;
		font-style: italic;
	}

	/* Leaderboard Screen */
	.leaderboard-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.round-result-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.round-result-header h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.points-awarded {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		margin-top: 1rem;
	}

	.points-awarded h3 {
		font-size: 0.9rem;
		color: #888;
		margin-bottom: 0.75rem;
	}

	.points-awarded ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.points-awarded li {
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0;
		border-bottom: 1px solid #374151;
	}

	.points-awarded li:last-child {
		border-bottom: none;
	}

	.points-awarded li.positive .points {
		color: #22c55e;
		font-weight: 600;
	}

	.leaderboard {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}

	.leaderboard h2 {
		text-align: center;
		margin-bottom: 0.5rem;
	}

	.round-progress {
		text-align: center;
		color: #888;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}

	.leaderboard-list {
		list-style: none;
		padding: 0;
		margin: 0;
		counter-reset: leaderboard;
	}

	.leaderboard-list li {
		display: flex;
		align-items: center;
		padding: 0.75rem;
		border-radius: 8px;
		margin-bottom: 0.5rem;
		background: #374151;
	}

	.leaderboard-list li.first {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: black;
	}

	.leaderboard-list li.second {
		background: linear-gradient(135deg, #9ca3af, #6b7280);
		color: black;
	}

	.leaderboard-list li.third {
		background: linear-gradient(135deg, #d97706, #b45309);
		color: white;
	}

	.leaderboard-list li.is-me {
		border: 2px solid #6366f1;
	}

	.leaderboard-list .position {
		width: 30px;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.leaderboard-list .name {
		flex: 1;
		font-weight: 500;
	}

	.leaderboard-list .score {
		font-weight: 700;
	}

	.leaderboard-actions {
		margin-top: auto;
	}

	.leaderboard-actions .btn {
		width: 100%;
	}

	/* Podium Screen */
	.podium-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 1rem;
	}

	.podium-screen h1 {
		margin-bottom: 1.5rem;
	}

	.podium {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 2rem;
		width: 100%;
		max-width: 350px;
	}

	.podium-place {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 1;
	}

	.podium-place .crown {
		font-size: 2rem;
		margin-bottom: 0.25rem;
	}

	.podium-place .player-avatar {
		width: 50px;
		height: 50px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.podium-place.first .player-avatar {
		background: #fbbf24;
		color: black;
	}

	.podium-place.second .player-avatar {
		background: #9ca3af;
		color: black;
	}

	.podium-place.third .player-avatar {
		background: #d97706;
		color: white;
	}

	.podium-place .player-name {
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 0.25rem;
		text-align: center;
	}

	.podium-place .player-score {
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 0.5rem;
	}

	.podium-block {
		width: 100%;
		border-radius: 8px 8px 0 0;
	}

	.podium-place.first .podium-block {
		height: 100px;
		background: linear-gradient(180deg, #fbbf24, #f59e0b);
	}

	.podium-place.second .podium-block {
		height: 70px;
		background: linear-gradient(180deg, #9ca3af, #6b7280);
	}

	.podium-place.third .podium-block {
		height: 50px;
		background: linear-gradient(180deg, #d97706, #b45309);
	}

	.full-standings {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		width: 100%;
		margin-bottom: 1.5rem;
	}

	.full-standings h3 {
		text-align: center;
		margin-bottom: 1rem;
		font-size: 1rem;
	}

	.standings-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.standings-list li {
		display: flex;
		align-items: center;
		padding: 0.5rem;
		border-bottom: 1px solid #374151;
	}

	.standings-list li:last-child {
		border-bottom: none;
	}

	.standings-list li.is-me {
		background: rgba(99, 102, 241, 0.2);
		border-radius: 4px;
	}

	.standings-list .position {
		width: 30px;
		font-weight: 600;
	}

	.standings-list .name {
		flex: 1;
	}

	.standings-list .score {
		font-weight: 600;
	}

	.podium-actions {
		margin-top: auto;
		width: 100%;
	}

	.podium-actions .btn {
		width: 100%;
	}

	.result-item .value.eliminated {
		color: #f59e0b;
	}

	/* Clues Screen */
	.clues-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding-top: 1rem;
	}

	.clues-section {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		width: 100%;
		margin-top: 1rem;
	}

	.clues-section h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
	}

	.clues-progress {
		color: #888;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}

	.turn-order-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem 0;
		counter-reset: turn;
	}

	.turn-order-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: #374151;
		border-radius: 8px;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.turn-order-list li.current {
		background: #4f46e5;
		animation: pulse-bg 1.5s infinite;
	}

	@keyframes pulse-bg {
		0%, 100% { background: #4f46e5; }
		50% { background: #6366f1; }
	}

	.turn-order-list li.done {
		background: #065f46;
	}

	.turn-order-list li.is-me {
		border: 2px solid #6366f1;
	}

	.turn-number {
		width: 24px;
		height: 24px;
		background: #1f2937;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.turn-name {
		flex: 1;
		font-weight: 500;
	}

	.done-badge {
		color: #22c55e;
		font-weight: bold;
	}

	.current-badge {
		background: #22c55e;
		color: black;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.clue-text {
		width: 100%;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid #4b5563;
		font-style: italic;
		color: #9ca3af;
		font-size: 0.9rem;
	}

	.my-turn-indicator {
		background: linear-gradient(135deg, #4f46e5, #6366f1);
		padding: 1rem;
		border-radius: 8px;
		text-align: center;
		margin-top: 1rem;
	}

	.my-turn-indicator p {
		font-weight: 600;
		margin-bottom: 1rem;
		font-size: 1.1rem;
	}

	.clue-input-section {
		display: flex;
		gap: 0.5rem;
	}

	.clue-input-section input {
		flex: 1;
	}

	.waiting-turn {
		text-align: center;
		padding: 1rem;
		color: #888;
	}

	.all-done-message {
		background: #065f46;
		padding: 1rem;
		border-radius: 8px;
		text-align: center;
		margin-top: 1rem;
	}

	.all-done-message p {
		margin-bottom: 1rem;
	}

	.waiting-host {
		color: #9ca3af;
		font-size: 0.9rem;
	}

	/* Role reminder */
	.role-reminder {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #1f2937;
		border-radius: 8px;
		margin-bottom: 0.5rem;
	}

	.role-reminder.impostor {
		background: linear-gradient(135deg, #7f1d1d, #991b1b);
	}

	.role-badge {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.role-badge.citizen {
		background: #065f46;
		color: #22c55e;
	}

	.role-badge.impostor {
		background: #7f1d1d;
		color: #ef4444;
	}

	.word-reminder {
		font-weight: 600;
		color: #22c55e;
	}

	/* Voting Screen */
	.voting-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding-top: 1rem;
	}

	.clues-recap {
		background: #1f2937;
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.clues-recap h3 {
		font-size: 0.9rem;
		color: #888;
		margin-bottom: 0.75rem;
	}

	.clues-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.clues-list li {
		padding: 0.5rem 0;
		border-bottom: 1px solid #374151;
	}

	.clues-list li:last-child {
		border-bottom: none;
	}

	.clue-author {
		font-weight: 600;
		margin-right: 0.5rem;
	}

	.clue-content {
		color: #9ca3af;
		font-style: italic;
	}

	/* Responsive */
	@media (max-width: 400px) {
		.end-round-buttons {
			flex-direction: column;
		}

		.podium-place .player-avatar {
			width: 40px;
			height: 40px;
			font-size: 1.2rem;
		}

		.podium-place .player-name {
			font-size: 0.8rem;
		}
	}
</style>
