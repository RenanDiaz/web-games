<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { _ } from 'svelte-i18n';

	// Types
	type Screen = 'setup' | 'roleCheck' | 'roundEnd' | 'scoreboard';
	type Role = 'impostor' | 'crewmate';
	type RoleCheckStep = 'selection' | 'pinSetup' | 'pin' | 'reveal';

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
		playerPins: Record<string, string>;
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
	let confirmPin = $state('');
	let impostorCount = $state(1);

	let gameState: GameState = $state({
		playerPins: {},
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
				// Handle migration from old single-pin format
				if ('pin' in loaded && !('playerPins' in loaded)) {
					(loaded as unknown as { playerPins: Record<string, string> }).playerPins = {};
					delete (loaded as Record<string, unknown>).pin;
				}
				gameState = { ...gameState, ...loaded };
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
			alert($_('amongUs.setup.playerExistsAlert'));
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

	function handlePinSetupKeypress(e: KeyboardEvent) {
		if (e.key === 'Enter') setupPin();
	}

	// Game Start
	function startGame() {
		if (gameState.players.length < 3) {
			alert($_('amongUs.setup.notEnoughPlayersAlert'));
			return;
		}

		if (impostorCount >= gameState.players.length) {
			alert($_('amongUs.setup.tooManyImpostorsAlert'));
			return;
		}

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
		checkPin = '';
		confirmPin = '';
		// If player doesn't have a PIN yet, prompt them to create one
		if (!gameState.playerPins[name]) {
			roleCheckStep = 'pinSetup';
		} else {
			roleCheckStep = 'pin';
		}
	}

	function cancelPinEntry() {
		selectedPlayer = null;
		roleCheckStep = 'selection';
	}

	function setupPin() {
		if (!checkPin || checkPin.length !== 4 || !/^\d+$/.test(checkPin)) {
			alert($_('amongUs.pinSetup.invalidPinAlert'));
			return;
		}

		if (checkPin !== confirmPin) {
			alert($_('amongUs.pinSetup.pinMismatchAlert'));
			checkPin = '';
			confirmPin = '';
			return;
		}

		if (selectedPlayer) {
			gameState.playerPins[selectedPlayer] = checkPin;
			saveGameState();
			roleCheckStep = 'reveal';

			if (!gameState.checkedPlayers.includes(selectedPlayer)) {
				gameState.checkedPlayers = [...gameState.checkedPlayers, selectedPlayer];
				saveGameState();
			}
		}
	}

	function revealRole() {
		if (!selectedPlayer) return;

		if (checkPin !== gameState.playerPins[selectedPlayer]) {
			alert($_('amongUs.pinEntry.wrongPinAlert'));
			checkPin = '';
			return;
		}

		roleCheckStep = 'reveal';

		if (!gameState.checkedPlayers.includes(selectedPlayer)) {
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
		if (!confirm($_('amongUs.scoreboard.resetConfirm'))) {
			return;
		}

		const keepPlayerPins = gameState.playerPins;
		const keepPlayers = gameState.players;
		const keepImpostorCount = gameState.impostorCount;

		gameState = {
			playerPins: keepPlayerPins,
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
	<title>{$_('amongUs.title')}</title>
</svelte:head>

<div class="container">
	<!-- Setup Screen -->
	{#if currentScreen === 'setup'}
		<div class="screen fade-in">
			<h1>🎭 {$_('amongUs.heading')}</h1>
			<p class="subtitle">{$_('amongUs.subtitle')}</p>

			<div class="card">
				<h2>{$_('amongUs.setup.heading')}</h2>

				<div class="form-group">
					<label for="impostor-count">{$_('amongUs.setup.impostorCount')}</label>
					<select id="impostor-count" bind:value={impostorCount}>
						<option value={1}>{$_('amongUs.setup.impostorOption', { values: { count: 1 } })}</option>
						<option value={2}>{$_('amongUs.setup.impostorOption', { values: { count: 2 } })}</option>
						<option value={3}>{$_('amongUs.setup.impostorOption', { values: { count: 3 } })}</option>
					</select>
				</div>

				<div class="form-group">
					<label>{$_('amongUs.setup.players')}</label>
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
							placeholder={$_('amongUs.setup.playerPlaceholder')}
							autocomplete="off"
							onkeypress={handlePlayerKeypress}
						/>
						<button class="btn-secondary" onclick={addPlayer}>{$_('amongUs.setup.addButton')}</button>
					</div>
				</div>

				<button class="btn-primary btn-large" onclick={startGame}>{$_('amongUs.setup.startButton')}</button>
			</div>
		</div>
	{/if}

	<!-- Role Check Screen -->
	{#if currentScreen === 'roleCheck'}
		<div class="screen fade-in">
			<h1>🔍 {$_('amongUs.roleCheck.heading')}</h1>
			<p class="subtitle">{$_('amongUs.roleCheck.round', { values: { round: gameState.currentRound } })}</p>

			<div class="card">
				{#if roleCheckStep === 'selection'}
					<h2>{$_('amongUs.roleCheck.selectName')}</h2>
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
				{:else if roleCheckStep === 'pinSetup'}
					<h2>{$_('amongUs.pinSetup.heading')}</h2>
					<p class="player-name-display">{selectedPlayer}</p>
					<p class="pin-setup-hint">{$_('amongUs.pinSetup.hint')}</p>
					<input
						type="text"
						class="pin-input"
						bind:value={checkPin}
						placeholder={$_('amongUs.pinSetup.enterPin')}
						maxlength="4"
						inputmode="numeric"
						autocomplete="off"
					/>
					<input
						type="text"
						class="pin-input"
						bind:value={confirmPin}
						placeholder={$_('amongUs.pinSetup.confirmPin')}
						maxlength="4"
						inputmode="numeric"
						autocomplete="off"
						onkeypress={handlePinSetupKeypress}
					/>
					<div class="button-row">
						<button class="btn-secondary" onclick={cancelPinEntry}>{$_('common.back')}</button>
						<button class="btn-primary" onclick={setupPin}>{$_('amongUs.pinSetup.submitButton')}</button>
					</div>
				{:else if roleCheckStep === 'pin'}
					<h2>{$_('amongUs.pinEntry.heading')}</h2>
					<p class="player-name-display">{selectedPlayer}</p>
					<input
						type="text"
						class="pin-input"
						bind:value={checkPin}
						placeholder={$_('amongUs.pinEntry.placeholder')}
						maxlength="4"
						inputmode="numeric"
						autocomplete="off"
						onkeypress={handlePinKeypress}
					/>
					<div class="button-row">
						<button class="btn-secondary" onclick={cancelPinEntry}>{$_('common.back')}</button>
						<button class="btn-primary" onclick={revealRole}>{$_('amongUs.pinEntry.submitButton')}</button>
					</div>
				{:else if roleCheckStep === 'reveal'}
					<div class="role-display" class:impostor={selectedPlayerRole === 'impostor'} class:crewmate={selectedPlayerRole === 'crewmate'}>
						{#if selectedPlayerRole === 'impostor'}
							<span class="role-icon-large">🔪</span>
							<span class="role-name">{$_('amongUs.role.impostor')}</span>
							<p class="role-hint">
								{#if otherImpostors.length > 0}
									{#if otherImpostors.length === 1}
										{$_('amongUs.role.fellowImpostors', { values: { names: otherImpostors.join(', ') } })}
									{:else}
										{$_('amongUs.role.fellowImpostorsPlural', { values: { names: otherImpostors.join(', ') } })}
									{/if}
								{:else}
									{$_('amongUs.role.impostorHint')}
								{/if}
							</p>
						{:else}
							<span class="role-icon-large">👨‍🚀</span>
							<span class="role-name">{$_('amongUs.role.crewmate')}</span>
							<p class="role-hint">{$_('amongUs.role.crewmateHint')}</p>
						{/if}
					</div>
					<button class="btn-primary btn-large" onclick={hideRole}>{$_('amongUs.role.hideButton')}</button>
				{/if}
			</div>

			<div class="action-bar">
				<button class="btn-secondary" onclick={showRoundEnd}>{$_('amongUs.roleCheck.endRound')}</button>
				<span class="checked-count">{$_('amongUs.roleCheck.playersChecked', { values: { checked: gameState.checkedPlayers.length, total: gameState.players.length } })}</span>
			</div>
		</div>
	{/if}

	<!-- Round End Screen -->
	{#if currentScreen === 'roundEnd'}
		<div class="screen fade-in">
			<h1>🏁 {$_('amongUs.roundEnd.heading', { values: { round: gameState.currentRound } })}</h1>

			<div class="card">
				<h2>{$_('amongUs.roundEnd.whoWon')}</h2>
				<div class="winner-buttons">
					<button class="btn-crewmate btn-large" onclick={() => recordWin('crewmates')}>
						<span class="role-icon">👨‍🚀</span>
						{$_('amongUs.roundEnd.crewmatesWin')}
					</button>
					<button class="btn-impostor btn-large" onclick={() => recordWin('impostors')}>
						<span class="role-icon">🔪</span>
						{$_('amongUs.roundEnd.impostorsWin')}
					</button>
				</div>

				<div class="round-info">
					<h3>{$_('amongUs.roundEnd.impostorsWere')}</h3>
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
			<h1>📊 {$_('amongUs.scoreboard.heading')}</h1>

			<div class="card">
				<div class="score-summary">
					<div class="team-score crewmate-score">
						<span class="team-icon">👨‍🚀</span>
						<span class="team-name">{$_('amongUs.scoreboard.crewmates')}</span>
						<span class="score">{gameState.scores.crewmateWins}</span>
					</div>
					<div class="vs">{$_('amongUs.scoreboard.vs')}</div>
					<div class="team-score impostor-score">
						<span class="team-icon">🔪</span>
						<span class="team-name">{$_('amongUs.scoreboard.impostors')}</span>
						<span class="score">{gameState.scores.impostorWins}</span>
					</div>
				</div>

				<h2>{$_('amongUs.scoreboard.playerStats')}</h2>
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

				<h2>{$_('amongUs.scoreboard.roundHistory')}</h2>
				<div class="round-history">
					{#if gameState.roundHistory.length === 0}
						<p class="no-history">{$_('amongUs.scoreboard.noHistory')}</p>
					{:else}
						{#each [...gameState.roundHistory].reverse() as round}
							<div class="round-history-item">
								<strong>{$_('amongUs.scoreboard.roundResult', { values: { round: round.round } })}</strong>
								<span class="round-winner" class:crewmates={round.winner === 'crewmates'} class:impostors={round.winner === 'impostors'}>
									{round.winner === 'crewmates' ? '👨‍🚀 ' + $_('amongUs.scoreboard.crewmatesWon') : '🔪 ' + $_('amongUs.scoreboard.impostorsWon')}
								</span>
								<br /><small>{$_('amongUs.scoreboard.impostorsLabel', { values: { names: round.impostors.join(', ') } })}</small>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<div class="button-row">
				<button class="btn-secondary" onclick={backToGame}>{$_('amongUs.scoreboard.backToGame')}</button>
				<button class="btn-primary btn-large" onclick={startNewRound}>{$_('amongUs.scoreboard.nextRound')}</button>
			</div>
			<button class="btn-danger" onclick={resetGame}>{$_('amongUs.scoreboard.resetGame')}</button>
		</div>
	{/if}
</div>

<style>
	/* Screen animations */
	.screen {
		animation: fadeIn 0.3s ease;
	}

	/* PIN input masking */
	.pin-input {
		-webkit-text-security: disc;
		text-security: disc;
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

	.pin-setup-hint {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin-bottom: 16px;
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
