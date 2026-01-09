<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { _ } from 'svelte-i18n';
	import PartySocket from 'partysocket';

	// Types
	type Screen = 'home' | 'lobby' | 'playing' | 'voting' | 'results';

	interface Player {
		id: string;
		name: string;
		isHost: boolean;
		isConnected: boolean;
	}

	interface PublicGameState {
		phase: 'lobby' | 'playing' | 'voting' | 'results';
		players: Player[];
		hostId: string | null;
		settings: {
			impostorCount: number;
			category: string;
			customWords: string[];
		};
		currentRound: {
			hasVoted: boolean;
			voteCount: number;
			totalPlayers: number;
		} | null;
		lastResult: {
			word: string;
			impostorIds: string[];
			impostorsWon: boolean;
			votes: Record<string, string>;
		} | null;
		myId: string;
	}

	type ServerMessage =
		| { type: 'state'; state: PublicGameState }
		| { type: 'role'; isImpostor: boolean; word: string | null }
		| { type: 'error'; message: string }
		| { type: 'kicked' };

	// Constants
	const PARTYKIT_HOST = browser
		? localStorage.getItem('impostor_partykit_host') || 'localhost:1999'
		: 'localhost:1999';

	const CATEGORIES = ['animals', 'food', 'places', 'objects', 'professions'];

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

	// Lifecycle
	onMount(() => {
		if (browser) {
			const savedName = localStorage.getItem('impostor_player_name');
			if (savedName) playerName = savedName;
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
			// Join the room with our name
			socket?.send(JSON.stringify({ type: 'join', name: playerName.trim() }));
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
				break;
			case 'playing':
				screen = 'playing';
				break;
			case 'voting':
				screen = 'voting';
				break;
			case 'results':
				screen = 'results';
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

	function endRound(impostorsWon: boolean) {
		socket?.send(JSON.stringify({ type: 'end-round', impostorsWon }));
	}

	function backToLobby() {
		socket?.send(JSON.stringify({ type: 'back-to-lobby' }));
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

	function getPlayerName(playerId: string): string {
		return gameState?.players.find((p) => p.id === playerId)?.name ?? playerId;
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
		<!-- Playing Screen -->
		<div class="playing-screen">
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

			{#if isHost}
				<div class="host-controls">
					<h3>{$_('impostor.playing.hostControls')}</h3>
					<div class="end-round-buttons">
						<button class="btn danger" onclick={() => endRound(true)}>
							{$_('impostor.playing.impostorsWin')}
						</button>
						<button class="btn success" onclick={() => endRound(false)}>
							{$_('impostor.playing.citizensWin')}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{:else if screen === 'voting'}
		<!-- Voting Screen -->
		<div class="voting-screen">
			<h1>{$_('impostor.voting.title')}</h1>
			<p class="voting-instruction">{$_('impostor.voting.instruction')}</p>

			<div class="vote-status">
				{$_('impostor.voting.votesCount', {
					values: {
						current: gameState?.currentRound?.voteCount ?? 0,
						total: gameState?.currentRound?.totalPlayers ?? 0
					}
				})}
			</div>

			<ul class="voting-list">
				{#each connectedPlayers.filter((p) => p.id !== gameState?.myId) as player}
					<li>
						<button
							class="vote-btn"
							class:selected={selectedVote === player.id}
							class:voted={gameState?.currentRound?.hasVoted}
							onclick={() => vote(player.id)}
							disabled={gameState?.currentRound?.hasVoted}
						>
							{player.name}
							{#if selectedVote === player.id}
								<span class="vote-check">&#10004;</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>

			{#if isHost}
				<div class="host-controls">
					<h3>{$_('impostor.playing.hostControls')}</h3>
					<div class="end-round-buttons">
						<button class="btn danger" onclick={() => endRound(true)}>
							{$_('impostor.playing.impostorsWin')}
						</button>
						<button class="btn success" onclick={() => endRound(false)}>
							{$_('impostor.playing.citizensWin')}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{:else if screen === 'results'}
		<!-- Results Screen -->
		<div class="results-screen">
			<h1>
				{#if gameState?.lastResult?.impostorsWon}
					{$_('impostor.results.impostorsWon')}
				{:else}
					{$_('impostor.results.citizensWon')}
				{/if}
			</h1>

			<div class="result-details">
				<div class="result-item">
					<span class="label">{$_('impostor.results.secretWord')}</span>
					<span class="value">{gameState?.lastResult?.word}</span>
				</div>

				<div class="result-item">
					<span class="label">{$_('impostor.results.impostorsWere')}</span>
					<span class="value impostors">
						{gameState?.lastResult?.impostorIds.map(getPlayerName).join(', ')}
					</span>
				</div>
			</div>

			{#if Object.keys(gameState?.lastResult?.votes ?? {}).length > 0}
				<div class="votes-summary">
					<h3>{$_('impostor.results.votes')}</h3>
					<ul>
						{#each Object.entries(gameState?.lastResult?.votes ?? {}) as [voterId, votedId]}
							<li>
								<span class="voter">{getPlayerName(voterId)}</span>
								<span class="arrow">&rarr;</span>
								<span class="voted">{getPlayerName(votedId)}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if isHost}
				<div class="result-actions">
					<button class="btn primary large" onclick={backToLobby}>
						{$_('impostor.results.playAgain')}
					</button>
				</div>
			{:else}
				<p class="waiting-message">{$_('impostor.results.waitingForHost')}</p>
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

	/* Responsive */
	@media (max-width: 400px) {
		.end-round-buttons {
			flex-direction: column;
		}
	}
</style>
