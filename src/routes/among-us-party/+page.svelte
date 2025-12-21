<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	// Types
	type Screen = 'setup' | 'roleCheck' | 'roundEnd' | 'scoreboard';
	type Role = 'impostor' | 'crewmate';
	type RoleCheckStep = 'selection' | 'pin' | 'reveal';

	interface PlayerStats {
		timesImpostor: number;
		timesCrewmate: number;
		winsAsImpostor: number;
		winsAsCrewmate: number;
	}

	interface RoundHistory {
		round: number;
		winner: 'crewmates' | 'impostors';
		impostors: string[];
	}

	interface GameState {
		pin: string;
		players: string[];
		impostorCount: number;
		currentRound: number;
		roles: Record<string, Role>;
		checkedPlayers: string[];
		scores: {
			crewmateWins: number;
			impostorWins: number;
		};
		playerStats: Record<string, PlayerStats>;
		roundHistory: RoundHistory[];
	}

	// State
	let currentScreen: Screen = $state('setup');
	let roleCheckStep: RoleCheckStep = $state('selection');
	let selectedPlayer: string | null = $state(null);
	let newPlayerName = $state('');
	let checkPin = $state('');
	let gamePin = $state('');
	let impostorCount = $state(1);

	let gameState: GameState = $state({
		pin: '',
		players: [],
		impostorCount: 1,
		currentRound: 1,
		roles: {},
		checkedPlayers: [],
		scores: { crewmateWins: 0, impostorWins: 0 },
		playerStats: {},
		roundHistory: []
	});

	// Derived state
	const currentImpostors = $derived(
		Object.entries(gameState.roles)
			.filter(([, role]) => role === 'impostor')
			.map(([name]) => name)
	);

	const otherImpostors = $derived(
		currentImpostors.filter((name) => name !== selectedPlayer)
	);

	const selectedPlayerRole = $derived(
		selectedPlayer ? gameState.roles[selectedPlayer] : null
	);

	// Lifecycle
	onMount(() => {
		loadGameState();
	});

	// Persistence
	function saveGameState() {
		if (!browser) return;
		try {
			localStorage.setItem('amongUsPartyGame', JSON.stringify(gameState));
		} catch (e) {
			console.warn('Could not save game state:', e);
		}
	}

	function loadGameState() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem('amongUsPartyGame');
			if (saved) {
				const loaded = JSON.parse(saved) as GameState;
				gameState = { ...gameState, ...loaded };
				gamePin = gameState.pin;
				impostorCount = gameState.impostorCount;

				// If we have an active game, go to the role check screen
				if (gameState.currentRound > 0 && Object.keys(gameState.roles).length > 0) {
					currentScreen = 'roleCheck';
				}
			}
		} catch (e) {
			console.warn('Could not load game state:', e);
		}
	}

	// Player Management
	function addPlayer() {
		const name = newPlayerName.trim();
		if (!name) return;

		if (gameState.players.includes(name)) {
			alert('This player is already added!');
			return;
		}

		gameState.players = [...gameState.players, name];

		if (!gameState.playerStats[name]) {
			gameState.playerStats[name] = {
				timesImpostor: 0,
				timesCrewmate: 0,
				winsAsImpostor: 0,
				winsAsCrewmate: 0
			};
		}

		newPlayerName = '';
		saveGameState();
	}

	function removePlayer(name: string) {
		gameState.players = gameState.players.filter((p) => p !== name);
		saveGameState();
	}

	function handlePlayerKeypress(e: KeyboardEvent) {
		if (e.key === 'Enter') addPlayer();
	}

	function handlePinKeypress(e: KeyboardEvent) {
		if (e.key === 'Enter') revealRole();
	}

	// Game Start
	function startGame() {
		if (!gamePin || gamePin.length !== 4 || !/^\d+$/.test(gamePin)) {
			alert('Please enter a 4-digit PIN');
			return;
		}

		if (gameState.players.length < 3) {
			alert('You need at least 3 players to start');
			return;
		}

		if (impostorCount >= gameState.players.length) {
			alert('Too many impostors for the number of players');
			return;
		}

		gameState.pin = gamePin;
		gameState.impostorCount = impostorCount;

		assignRoles();
		currentScreen = 'roleCheck';
		roleCheckStep = 'selection';
		saveGameState();
	}

	// Role Assignment
	function assignRoles() {
		const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);

		gameState.roles = {};
		gameState.checkedPlayers = [];

		for (let i = 0; i < shuffled.length; i++) {
			const isImpostor = i < gameState.impostorCount;
			const playerName = shuffled[i];
			gameState.roles[playerName] = isImpostor ? 'impostor' : 'crewmate';

			if (isImpostor) {
				gameState.playerStats[playerName].timesImpostor++;
			} else {
				gameState.playerStats[playerName].timesCrewmate++;
			}
		}
	}

	// Role Check
	function selectPlayer(name: string) {
		if (gameState.checkedPlayers.includes(name)) return;
		selectedPlayer = name;
		roleCheckStep = 'pin';
		checkPin = '';
	}

	function cancelPinEntry() {
		selectedPlayer = null;
		roleCheckStep = 'selection';
	}

	function revealRole() {
		if (checkPin !== gameState.pin) {
			alert('Wrong PIN! Try again.');
			checkPin = '';
			return;
		}

		roleCheckStep = 'reveal';

		if (selectedPlayer && !gameState.checkedPlayers.includes(selectedPlayer)) {
			gameState.checkedPlayers = [...gameState.checkedPlayers, selectedPlayer];
			saveGameState();
		}
	}

	function hideRole() {
		selectedPlayer = null;
		roleCheckStep = 'selection';
	}

	// Round End
	function showRoundEnd() {
		currentScreen = 'roundEnd';
	}

	function recordWin(winner: 'crewmates' | 'impostors') {
		if (winner === 'crewmates') {
			gameState.scores.crewmateWins++;
			gameState.players.forEach((name) => {
				if (gameState.roles[name] === 'crewmate') {
					gameState.playerStats[name].winsAsCrewmate++;
				}
			});
		} else {
			gameState.scores.impostorWins++;
			currentImpostors.forEach((name) => {
				gameState.playerStats[name].winsAsImpostor++;
			});
		}

		gameState.roundHistory = [
			...gameState.roundHistory,
			{
				round: gameState.currentRound,
				winner,
				impostors: [...currentImpostors]
			}
		];

		saveGameState();
		currentScreen = 'scoreboard';
	}

	// Scoreboard
	function backToGame() {
		currentScreen = 'roleCheck';
		roleCheckStep = 'selection';
	}

	function startNewRound() {
		gameState.currentRound++;
		assignRoles();
		currentScreen = 'roleCheck';
		roleCheckStep = 'selection';
		saveGameState();
	}

	function resetGame() {
		if (!confirm('Are you sure you want to reset the entire game? All scores will be lost.')) {
			return;
		}

		const keepPin = gameState.pin;
		const keepPlayers = gameState.players;
		const keepImpostorCount = gameState.impostorCount;

		gameState = {
			pin: keepPin,
			players: keepPlayers,
			impostorCount: keepImpostorCount,
			currentRound: 1,
			roles: {},
			checkedPlayers: [],
			scores: { crewmateWins: 0, impostorWins: 0 },
			playerStats: {},
			roundHistory: []
		};

		keepPlayers.forEach((name) => {
			gameState.playerStats[name] = {
				timesImpostor: 0,
				timesCrewmate: 0,
				winsAsImpostor: 0,
				winsAsCrewmate: 0
			};
		});

		saveGameState();
		currentScreen = 'setup';
	}
</script>

<svelte:head>
	<title>Among Us Party | Web Games</title>
</svelte:head>

<div class="container">
	<!-- Setup Screen -->
	{#if currentScreen === 'setup'}
		<div class="screen fade-in">
			<h1>🎭 Among Us Party</h1>
			<p class="subtitle">Real-life role assignment game</p>

			<div class="card">
				<h2>Game Setup</h2>

				<div class="form-group">
					<label for="game-pin">Game PIN (players will use this)</label>
					<input
						type="password"
						id="game-pin"
						bind:value={gamePin}
						placeholder="Enter a 4-digit PIN"
						maxlength="4"
						inputmode="numeric"
					/>
				</div>

				<div class="form-group">
					<label for="impostor-count">Number of Impostors</label>
					<select id="impostor-count" bind:value={impostorCount}>
						<option value={1}>1 Impostor</option>
						<option value={2}>2 Impostors</option>
						<option value={3}>3 Impostors</option>
					</select>
				</div>

				<div class="form-group">
					<label>Players</label>
					<div class="player-list">
						{#each gameState.players as player}
							<span class="player-tag">
								{player}
								<button class="remove" onclick={() => removePlayer(player)}>&times;</button>
							</span>
						{/each}
					</div>
					<div class="add-player-row">
						<input
							type="text"
							bind:value={newPlayerName}
							placeholder="Enter player name"
							onkeypress={handlePlayerKeypress}
						/>
						<button class="btn-secondary" onclick={addPlayer}>Add</button>
					</div>
				</div>

				<button class="btn-primary btn-large" onclick={startGame}>Start Game</button>
			</div>
		</div>
	{/if}

	<!-- Role Check Screen -->
	{#if currentScreen === 'roleCheck'}
		<div class="screen fade-in">
			<h1>🔍 Check Your Role</h1>
			<p class="subtitle">Round {gameState.currentRound}</p>

			<div class="card">
				{#if roleCheckStep === 'selection'}
					<h2>Select Your Name</h2>
					<div class="player-buttons">
						{#each gameState.players as player}
							{@const isChecked = gameState.checkedPlayers.includes(player)}
							<button
								class="player-btn"
								class:checked={isChecked}
								disabled={isChecked}
								onclick={() => selectPlayer(player)}
							>
								{player}
							</button>
						{/each}
					</div>
				{:else if roleCheckStep === 'pin'}
					<h2>Enter PIN to reveal your role</h2>
					<p class="player-name-display">{selectedPlayer}</p>
					<input
						type="password"
						bind:value={checkPin}
						placeholder="Enter PIN"
						maxlength="4"
						inputmode="numeric"
						onkeypress={handlePinKeypress}
					/>
					<div class="button-row">
						<button class="btn-secondary" onclick={cancelPinEntry}>Back</button>
						<button class="btn-primary" onclick={revealRole}>Reveal Role</button>
					</div>
				{:else if roleCheckStep === 'reveal'}
					<div class="role-display" class:impostor={selectedPlayerRole === 'impostor'} class:crewmate={selectedPlayerRole === 'crewmate'}>
						{#if selectedPlayerRole === 'impostor'}
							<span class="role-icon-large">🔪</span>
							<span class="role-name">Impostor</span>
							<p class="role-hint">
								{#if otherImpostors.length > 0}
									Your fellow impostor{otherImpostors.length > 1 ? 's' : ''}: {otherImpostors.join(', ')}
								{:else}
									Eliminate the crewmates without getting caught!
								{/if}
							</p>
						{:else}
							<span class="role-icon-large">👨‍🚀</span>
							<span class="role-name">Crewmate</span>
							<p class="role-hint">Complete your tasks and find the impostor!</p>
						{/if}
					</div>
					<button class="btn-primary btn-large" onclick={hideRole}>Hide Role</button>
				{/if}
			</div>

			<div class="action-bar">
				<button class="btn-secondary" onclick={showRoundEnd}>End Round</button>
				<span class="checked-count">{gameState.checkedPlayers.length}/{gameState.players.length} players checked</span>
			</div>
		</div>
	{/if}

	<!-- Round End Screen -->
	{#if currentScreen === 'roundEnd'}
		<div class="screen fade-in">
			<h1>🏁 Round {gameState.currentRound} Complete</h1>

			<div class="card">
				<h2>Who Won?</h2>
				<div class="winner-buttons">
					<button class="btn-crewmate btn-large" onclick={() => recordWin('crewmates')}>
						<span class="role-icon">👨‍🚀</span>
						Crewmates Win
					</button>
					<button class="btn-impostor btn-large" onclick={() => recordWin('impostors')}>
						<span class="role-icon">🔪</span>
						Impostors Win
					</button>
				</div>

				<div class="round-info">
					<h3>This round's impostors were:</h3>
					<div class="impostor-names">
						{#each currentImpostors as impostor}
							<span class="player-tag impostor-tag">{impostor}</span>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Scoreboard Screen -->
	{#if currentScreen === 'scoreboard'}
		<div class="screen fade-in">
			<h1>📊 Scoreboard</h1>

			<div class="card">
				<div class="score-summary">
					<div class="team-score crewmate-score">
						<span class="team-icon">👨‍🚀</span>
						<span class="team-name">Crewmates</span>
						<span class="score">{gameState.scores.crewmateWins}</span>
					</div>
					<div class="vs">VS</div>
					<div class="team-score impostor-score">
						<span class="team-icon">🔪</span>
						<span class="team-name">Impostors</span>
						<span class="score">{gameState.scores.impostorWins}</span>
					</div>
				</div>

				<h2>Player Stats</h2>
				<div class="player-stats">
					{#each gameState.players as player}
						{@const stats = gameState.playerStats[player]}
						{#if stats}
							<div class="player-stat-row">
								<span class="player-stat-name">{player}</span>
								<div class="player-stat-details">
									<span class="stat-impostor">🔪 {stats.winsAsImpostor}/{stats.timesImpostor}</span>
									<span class="stat-crewmate">👨‍🚀 {stats.winsAsCrewmate}/{stats.timesCrewmate}</span>
								</div>
							</div>
						{/if}
					{/each}
				</div>

				<h2>Round History</h2>
				<div class="round-history">
					{#if gameState.roundHistory.length === 0}
						<p class="no-history">No rounds played yet</p>
					{:else}
						{#each [...gameState.roundHistory].reverse() as round}
							<div class="round-history-item">
								<strong>Round {round.round}:</strong>
								<span class="round-winner" class:crewmates={round.winner === 'crewmates'} class:impostors={round.winner === 'impostors'}>
									{round.winner === 'crewmates' ? '👨‍🚀 Crewmates' : '🔪 Impostors'} won
								</span>
								<br /><small>Impostors: {round.impostors.join(', ')}</small>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<div class="button-row">
				<button class="btn-secondary" onclick={backToGame}>Back to Game</button>
				<button class="btn-primary btn-large" onclick={startNewRound}>Next Round</button>
			</div>
			<button class="btn-danger" onclick={resetGame}>Reset Entire Game</button>
		</div>
	{/if}
</div>

<style>
	/* Screen animations */
	.screen {
		animation: fadeIn 0.3s ease;
	}

	/* Player list */
	.player-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
		min-height: 40px;
	}

	.player-tag {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: var(--bg-input);
		padding: 8px 12px;
		border-radius: 20px;
		font-size: 0.9rem;
	}

	.player-tag .remove {
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.2s;
		background: none;
		border: none;
		color: inherit;
		padding: 0;
		font-size: 1rem;
	}

	.player-tag .remove:hover {
		opacity: 1;
	}

	.add-player-row {
		display: flex;
		gap: 10px;
	}

	.add-player-row input {
		flex: 1;
	}

	/* Player buttons */
	.player-buttons {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
	}

	.player-btn {
		padding: 16px;
		background: var(--bg-input);
		border: 2px solid transparent;
		color: var(--text-primary);
		border-radius: 12px;
		font-size: 1rem;
		transition: all 0.2s;
	}

	.player-btn:hover:not(:disabled) {
		background: #1a4a80;
		border-color: var(--accent);
	}

	.player-btn.checked {
		opacity: 0.5;
		background: #0a2040;
	}

	.player-btn.checked::after {
		content: ' ✓';
		color: var(--crewmate-color);
	}

	/* PIN entry */
	.player-name-display {
		font-size: 1.5rem;
		font-weight: bold;
		text-align: center;
		margin-bottom: 20px;
		color: var(--accent);
	}

	/* Role display */
	.role-display {
		text-align: center;
		padding: 40px 20px;
		border-radius: 16px;
		margin-bottom: 20px;
	}

	.role-display.crewmate {
		background: linear-gradient(135deg, rgba(0, 212, 170, 0.2) 0%, rgba(0, 160, 128, 0.2) 100%);
		border: 3px solid var(--crewmate-color);
	}

	.role-display.impostor {
		background: linear-gradient(135deg, rgba(255, 71, 87, 0.2) 0%, rgba(204, 47, 61, 0.2) 100%);
		border: 3px solid var(--impostor-color);
	}

	.role-icon-large {
		font-size: 4rem;
		display: block;
		margin-bottom: 16px;
	}

	.role-name {
		font-size: 2rem;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 2px;
	}

	.role-display.crewmate .role-name {
		color: var(--crewmate-color);
	}

	.role-display.impostor .role-name {
		color: var(--impostor-color);
	}

	.role-hint {
		margin-top: 16px;
		font-size: 0.9rem;
		color: var(--text-secondary);
	}

	/* Action bar */
	.action-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		background: var(--bg-card);
		border-radius: 12px;
	}

	.checked-count {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	/* Winner buttons */
	.winner-buttons {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 24px;
	}

	.winner-buttons button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
	}

	.role-icon {
		font-size: 1.5rem;
	}

	/* Round info */
	.round-info {
		text-align: center;
		padding-top: 20px;
		border-top: 1px solid var(--bg-input);
	}

	.impostor-names {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin-top: 12px;
	}

	.impostor-tag {
		background: rgba(255, 71, 87, 0.2);
		border: 1px solid var(--impostor-color);
	}

	/* Scoreboard */
	.score-summary {
		display: flex;
		align-items: center;
		justify-content: space-around;
		padding: 20px 0;
		margin-bottom: 24px;
		border-bottom: 1px solid var(--bg-input);
	}

	.team-score {
		text-align: center;
	}

	.team-icon {
		font-size: 2.5rem;
		display: block;
		margin-bottom: 8px;
	}

	.team-name {
		display: block;
		font-size: 0.9rem;
		color: var(--text-secondary);
		margin-bottom: 8px;
	}

	.score {
		font-size: 2.5rem;
		font-weight: bold;
	}

	.crewmate-score .score {
		color: var(--crewmate-color);
	}

	.impostor-score .score {
		color: var(--impostor-color);
	}

	.vs {
		font-size: 1.2rem;
		font-weight: bold;
		color: var(--text-secondary);
	}

	/* Player stats */
	.player-stats {
		margin-bottom: 24px;
	}

	.player-stat-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 0;
		border-bottom: 1px solid var(--bg-input);
	}

	.player-stat-row:last-child {
		border-bottom: none;
	}

	.player-stat-name {
		font-weight: 500;
	}

	.player-stat-details {
		display: flex;
		gap: 16px;
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.stat-impostor {
		color: var(--impostor-color);
	}

	.stat-crewmate {
		color: var(--crewmate-color);
	}

	/* Round history */
	.round-history {
		max-height: 200px;
		overflow-y: auto;
	}

	.round-history-item {
		padding: 12px;
		background: var(--bg-input);
		border-radius: 8px;
		margin-bottom: 8px;
		font-size: 0.9rem;
	}

	.round-history-item:last-child {
		margin-bottom: 0;
	}

	.round-winner {
		font-weight: 600;
	}

	.round-winner.crewmates {
		color: var(--crewmate-color);
	}

	.round-winner.impostors {
		color: var(--impostor-color);
	}

	.no-history {
		color: var(--text-secondary);
		text-align: center;
	}

	/* Responsive */
	@media (max-width: 400px) {
		.player-buttons {
			grid-template-columns: 1fr;
		}

		.score-summary {
			flex-direction: column;
			gap: 16px;
		}

		.vs {
			display: none;
		}
	}
</style>
