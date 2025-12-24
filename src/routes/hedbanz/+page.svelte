<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { _ } from 'svelte-i18n';

	// Types
	interface CategoryItem {
		name: string;
		emoji: string;
	}

	interface Category {
		id: string;
		icon: string;
		items: CategoryItem[];
	}

	// Categories data
	const categories: Category[] = [
		{
			id: 'movies',
			icon: '🎬',
			items: [
				{ name: 'Harry Potter', emoji: '🧙' },
				{ name: 'Darth Vader', emoji: '👨‍🚀' },
				{ name: 'Jack Sparrow', emoji: '🏴‍☠️' },
				{ name: 'Shrek', emoji: '👹' },
				{ name: 'Batman', emoji: '🦇' },
				{ name: 'Spider-Man', emoji: '🕷️' },
				{ name: 'Elsa', emoji: '❄️' },
				{ name: 'Woody', emoji: '🤠' },
				{ name: 'Iron Man', emoji: '🦾' },
				{ name: 'Gollum', emoji: '💍' },
				{ name: 'Forrest Gump', emoji: '🏃' },
				{ name: 'Indiana Jones', emoji: '🤠' },
				{ name: 'Terminator', emoji: '🤖' },
				{ name: 'E.T.', emoji: '👽' },
				{ name: 'Yoda', emoji: '🧝' }
			]
		},
		{
			id: 'animals',
			icon: '🦁',
			items: [
				{ name: 'León', emoji: '🦁' },
				{ name: 'Elefante', emoji: '🐘' },
				{ name: 'Pingüino', emoji: '🐧' },
				{ name: 'Cocodrilo', emoji: '🐊' },
				{ name: 'Águila', emoji: '🦅' },
				{ name: 'Delfín', emoji: '🐬' },
				{ name: 'Canguro', emoji: '🦘' },
				{ name: 'Jirafa', emoji: '🦒' },
				{ name: 'Pulpo', emoji: '🐙' },
				{ name: 'Koala', emoji: '🐨' },
				{ name: 'Tiburón', emoji: '🦈' },
				{ name: 'Mariposa', emoji: '🦋' },
				{ name: 'Tortuga', emoji: '🐢' },
				{ name: 'Búho', emoji: '🦉' },
				{ name: 'Camaleón', emoji: '🦎' }
			]
		},
		{
			id: 'professions',
			icon: '👨‍⚕️',
			items: [
				{ name: 'Médico', emoji: '👨‍⚕️' },
				{ name: 'Astronauta', emoji: '👨‍🚀' },
				{ name: 'Chef', emoji: '👨‍🍳' },
				{ name: 'Bombero', emoji: '👨‍🚒' },
				{ name: 'Piloto', emoji: '👨‍✈️' },
				{ name: 'Detective', emoji: '🕵️' },
				{ name: 'Veterinario', emoji: '👨‍⚕️' },
				{ name: 'Científico', emoji: '👨‍🔬' },
				{ name: 'Músico', emoji: '🎸' },
				{ name: 'Fotógrafo', emoji: '📸' },
				{ name: 'Arquitecto', emoji: '📐' },
				{ name: 'Maestro', emoji: '👨‍🏫' },
				{ name: 'Abogado', emoji: '⚖️' },
				{ name: 'Periodista', emoji: '📰' },
				{ name: 'Atleta', emoji: '🏃' }
			]
		},
		{
			id: 'food',
			icon: '🍕',
			items: [
				{ name: 'Pizza', emoji: '🍕' },
				{ name: 'Hamburguesa', emoji: '🍔' },
				{ name: 'Sushi', emoji: '🍣' },
				{ name: 'Tacos', emoji: '🌮' },
				{ name: 'Helado', emoji: '🍦' },
				{ name: 'Pasta', emoji: '🍝' },
				{ name: 'Chocolate', emoji: '🍫' },
				{ name: 'Paella', emoji: '🥘' },
				{ name: 'Hot Dog', emoji: '🌭' },
				{ name: 'Dona', emoji: '🍩' },
				{ name: 'Croissant', emoji: '🥐' },
				{ name: 'Ramen', emoji: '🍜' },
				{ name: 'Burrito', emoji: '🌯' },
				{ name: 'Waffles', emoji: '🧇' },
				{ name: 'Nachos', emoji: '🧀' }
			]
		},
		{
			id: 'objects',
			icon: '📱',
			items: [
				{ name: 'Teléfono', emoji: '📱' },
				{ name: 'Paraguas', emoji: '☂️' },
				{ name: 'Guitarra', emoji: '🎸' },
				{ name: 'Bicicleta', emoji: '🚲' },
				{ name: 'Reloj', emoji: '⌚' },
				{ name: 'Espejo', emoji: '🪞' },
				{ name: 'Lámpara', emoji: '💡' },
				{ name: 'Televisor', emoji: '📺' },
				{ name: 'Computadora', emoji: '💻' },
				{ name: 'Cámara', emoji: '📷' },
				{ name: 'Libro', emoji: '📖' },
				{ name: 'Tijeras', emoji: '✂️' },
				{ name: 'Martillo', emoji: '🔨' },
				{ name: 'Globo', emoji: '🎈' },
				{ name: 'Silla', emoji: '🪑' }
			]
		}
	];

	// State
	let activeCategories: Set<string> = $state(new Set(['movies', 'animals']));
	let customItems = $state('');
	let timerPreset = $state(60);
	let customTimerSeconds = $state('');
	let isPlaying = $state(false);
	let isFullscreen = $state(false);
	let isRevealed = $state(false);
	let timeRemaining = $state(0);
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let usedItems: Set<string> = $state(new Set());
	let currentItem: { name: string; emoji: string; categoryId: string } | null = $state(null);
	let isTimeUp = $state(false);

	// Derived state
	const availableItems = $derived(() => {
		const items: { name: string; emoji: string; categoryId: string }[] = [];

		for (const category of categories) {
			if (activeCategories.has(category.id)) {
				for (const item of category.items) {
					items.push({ ...item, categoryId: category.id });
				}
			}
		}

		// Add custom items
		if (customItems.trim()) {
			const customList = customItems.split('\n').filter(line => line.trim());
			for (const item of customList) {
				items.push({ name: item.trim(), emoji: '🎭', categoryId: 'custom' });
			}
		}

		return items;
	});

	const totalItems = $derived(availableItems().length);
	const remainingItems = $derived(availableItems().filter(item => !usedItems.has(`${item.categoryId}:${item.name}`)).length);

	const timerDuration = $derived(() => {
		if (customTimerSeconds && parseInt(customTimerSeconds) > 0) {
			return parseInt(customTimerSeconds);
		}
		return timerPreset === 0 ? 0 : timerPreset;
	});

	const progressPercent = $derived(() => {
		const duration = timerDuration();
		if (duration === 0) return 100;
		return (timeRemaining / duration) * 100;
	});

	const timerColor = $derived(() => {
		if (isTimeUp) return 'red';
		if (timeRemaining <= 10) return 'yellow';
		return 'green';
	});

	// Functions
	function toggleCategory(categoryId: string) {
		const newSet = new Set(activeCategories);
		if (newSet.has(categoryId)) {
			newSet.delete(categoryId);
		} else {
			newSet.add(categoryId);
		}
		activeCategories = newSet;
	}

	function getCategoryItemCount(categoryId: string): number {
		const category = categories.find(c => c.id === categoryId);
		return category ? category.items.length : 0;
	}

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function playBeep() {
		if (!browser) return;

		try {
			const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
			const oscillator = audioContext.createOscillator();
			const gainNode = audioContext.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(audioContext.destination);

			oscillator.frequency.value = 800;
			oscillator.type = 'sine';

			gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

			oscillator.start(audioContext.currentTime);
			oscillator.stop(audioContext.currentTime + 0.5);
		} catch {
			// Audio context not supported
		}
	}

	function startTimer() {
		const duration = timerDuration();
		if (duration === 0) return;

		timeRemaining = duration;
		isTimeUp = false;

		if (timerInterval) {
			clearInterval(timerInterval);
		}

		timerInterval = setInterval(() => {
			if (timeRemaining > 0) {
				timeRemaining--;
				if (timeRemaining === 0) {
					isTimeUp = true;
					playBeep();
				}
			}
		}, 1000);
	}

	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	function selectRandomItem() {
		const available = availableItems().filter(item => !usedItems.has(`${item.categoryId}:${item.name}`));

		if (available.length === 0) {
			// All items used, reset
			usedItems = new Set();
			return selectRandomItem();
		}

		const randomIndex = Math.floor(Math.random() * available.length);
		currentItem = available[randomIndex];
		isRevealed = false;
		isTimeUp = false;
	}

	function startGame() {
		if (totalItems === 0) {
			alert($_('hedbanz.noItemsAlert'));
			return;
		}

		usedItems = new Set();
		selectRandomItem();
		startTimer();
		isPlaying = true;
	}

	function nextItem() {
		if (currentItem) {
			usedItems = new Set([...usedItems, `${currentItem.categoryId}:${currentItem.name}`]);
		}
		selectRandomItem();
		stopTimer();
		startTimer();
	}

	function toggleReveal() {
		isRevealed = !isRevealed;
	}

	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
	}

	function exitFullscreen() {
		isFullscreen = false;
	}

	function resetGame() {
		stopTimer();
		isPlaying = false;
		isFullscreen = false;
		isRevealed = false;
		currentItem = null;
		usedItems = new Set();
		timeRemaining = 0;
		isTimeUp = false;
	}

	function getCategoryName(categoryId: string): string {
		const key = `hedbanz.categories.${categoryId}`;
		return $_(key);
	}

	function getCategoryIcon(categoryId: string): string {
		if (categoryId === 'custom') return '🎭';
		const category = categories.find(c => c.id === categoryId);
		return category ? category.icon : '❓';
	}

	onMount(() => {
		// Initialize
	});

	onDestroy(() => {
		stopTimer();
	});
</script>

<svelte:head>
	<title>{$_('hedbanz.title')}</title>
</svelte:head>

{#if isFullscreen && isPlaying}
	<!-- Fullscreen Game View -->
	<div class="fullscreen-overlay">
		<button class="exit-fullscreen-btn" onclick={exitFullscreen}>
			{$_('hedbanz.game.exit')}
		</button>

		<div class="game-display">
			<div class="category-badge">
				{getCategoryIcon(currentItem?.categoryId || '')} {getCategoryName(currentItem?.categoryId || '')}
			</div>

			<div class="item-emoji" class:revealed={isRevealed}>
				{isRevealed ? currentItem?.emoji : '❓'}
			</div>

			<div class="item-name" class:revealed={isRevealed}>
				{isRevealed ? currentItem?.name : '???'}
			</div>

			<div class="timer-section">
				{#if timerDuration() > 0}
					<div class="timer-display" class:green={timerColor() === 'green'} class:yellow={timerColor() === 'yellow'} class:red={timerColor() === 'red'}>
						{formatTime(timeRemaining)}
					</div>
					<div class="progress-bar">
						<div
							class="progress-fill"
							class:green={timerColor() === 'green'}
							class:yellow={timerColor() === 'yellow'}
							class:red={timerColor() === 'red'}
							style="width: {progressPercent()}%"
						></div>
					</div>
				{/if}

				{#if isTimeUp}
					<div class="time-up-badge">
						{$_('hedbanz.game.timeUp')}
					</div>
				{/if}
			</div>

			<div class="game-controls">
				<button class="control-btn reveal-btn" onclick={toggleReveal}>
					{isRevealed ? $_('hedbanz.game.hide') : $_('hedbanz.game.reveal')}
				</button>
				<button class="control-btn next-btn" onclick={nextItem}>
					{$_('hedbanz.game.next')}
				</button>
			</div>

			<div class="item-counter">
				{$_('hedbanz.game.total')}: {totalItems} | {$_('hedbanz.game.remaining')}: {remainingItems}
			</div>
		</div>
	</div>
{:else}
	<div class="container">
		{#if !isPlaying}
			<!-- Setup Screen -->
			<div class="screen fade-in">
				<h1>🎯 {$_('hedbanz.heading')}</h1>
				<p class="subtitle">{$_('hedbanz.subtitle')}</p>

				<!-- Categories -->
				<div class="card">
					<h2>{$_('hedbanz.setup.categories')}</h2>
					<div class="category-tags">
						{#each categories as category}
							<button
								class="category-tag"
								class:active={activeCategories.has(category.id)}
								onclick={() => toggleCategory(category.id)}
							>
								{category.icon} {getCategoryName(category.id)}
								<span class="item-count">({getCategoryItemCount(category.id)})</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Custom Items -->
				<div class="card">
					<h2>{$_('hedbanz.setup.customItems')}</h2>
					<p class="hint">{$_('hedbanz.setup.customHint')}</p>
					<textarea
						class="custom-textarea"
						bind:value={customItems}
						placeholder={$_('hedbanz.setup.customPlaceholder')}
						rows="4"
					></textarea>
					{#if customItems.trim()}
						<p class="custom-count">
							🎭 {$_('hedbanz.setup.customCategory')}: {customItems.split('\n').filter(line => line.trim()).length} items
						</p>
					{/if}
				</div>

				<!-- Timer -->
				<div class="card">
					<h2>{$_('hedbanz.setup.timer')}</h2>
					<div class="timer-presets">
						<button
							class="preset-btn"
							class:active={timerPreset === 30 && !customTimerSeconds}
							onclick={() => { timerPreset = 30; customTimerSeconds = ''; }}
						>30s</button>
						<button
							class="preset-btn"
							class:active={timerPreset === 60 && !customTimerSeconds}
							onclick={() => { timerPreset = 60; customTimerSeconds = ''; }}
						>1 min</button>
						<button
							class="preset-btn"
							class:active={timerPreset === 90 && !customTimerSeconds}
							onclick={() => { timerPreset = 90; customTimerSeconds = ''; }}
						>1:30</button>
						<button
							class="preset-btn"
							class:active={timerPreset === 120 && !customTimerSeconds}
							onclick={() => { timerPreset = 120; customTimerSeconds = ''; }}
						>2 min</button>
						<button
							class="preset-btn"
							class:active={timerPreset === 0 && !customTimerSeconds}
							onclick={() => { timerPreset = 0; customTimerSeconds = ''; }}
						>{$_('hedbanz.setup.noLimit')}</button>
					</div>
					<div class="custom-timer">
						<label for="custom-timer">{$_('hedbanz.setup.customTimer')}</label>
						<input
							id="custom-timer"
							type="number"
							bind:value={customTimerSeconds}
							placeholder="60"
							min="1"
						/>
					</div>
				</div>

				<button class="btn-primary btn-large" onclick={startGame}>
					{$_('hedbanz.setup.startButton')}
				</button>
			</div>
		{:else}
			<!-- Game Screen (non-fullscreen) -->
			<div class="screen fade-in">
				<div class="game-header">
					<h1>🎯 {$_('hedbanz.heading')}</h1>
				</div>

				<div class="card game-card">
					<div class="category-badge small">
						{getCategoryIcon(currentItem?.categoryId || '')} {getCategoryName(currentItem?.categoryId || '')}
					</div>

					<div class="item-emoji" class:revealed={isRevealed}>
						{isRevealed ? currentItem?.emoji : '❓'}
					</div>

					<div class="item-name" class:revealed={isRevealed}>
						{isRevealed ? currentItem?.name : '???'}
					</div>

					{#if timerDuration() > 0}
						<div class="timer-display" class:green={timerColor() === 'green'} class:yellow={timerColor() === 'yellow'} class:red={timerColor() === 'red'}>
							{formatTime(timeRemaining)}
						</div>
						<div class="progress-bar">
							<div
								class="progress-fill"
								class:green={timerColor() === 'green'}
								class:yellow={timerColor() === 'yellow'}
								class:red={timerColor() === 'red'}
								style="width: {progressPercent()}%"
							></div>
						</div>
					{/if}

					{#if isTimeUp}
						<div class="time-up-badge">
							{$_('hedbanz.game.timeUp')}
						</div>
					{/if}
				</div>

				<div class="game-controls-inline">
					<button class="btn-secondary" onclick={toggleReveal}>
						{isRevealed ? $_('hedbanz.game.hide') : $_('hedbanz.game.reveal')}
					</button>
					<button class="btn-primary" onclick={nextItem}>
						{$_('hedbanz.game.next')}
					</button>
				</div>

				<div class="game-controls-inline">
					<button class="btn-secondary" onclick={toggleFullscreen}>
						{$_('hedbanz.game.fullscreen')}
					</button>
					<button class="btn-danger-outline" onclick={resetGame}>
						{$_('hedbanz.game.reset')}
					</button>
				</div>

				<div class="item-counter-inline">
					{$_('hedbanz.game.total')}: {totalItems} | {$_('hedbanz.game.remaining')}: {remainingItems}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Fullscreen overlay */
	.fullscreen-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%);
		z-index: 9999;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.exit-fullscreen-btn {
		position: absolute;
		top: 20px;
		right: 20px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 10px 20px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.exit-fullscreen-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.game-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 20px;
		width: 100%;
		max-width: 600px;
	}

	/* Category badge */
	.category-badge {
		background: var(--bg-card);
		padding: 12px 24px;
		border-radius: 30px;
		font-size: 1.2rem;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.category-badge.small {
		font-size: 1rem;
		padding: 8px 16px;
		margin-bottom: 10px;
	}

	/* Item display */
	.item-emoji {
		font-size: clamp(6rem, 20vw, 12rem);
		filter: drop-shadow(0 4px 20px rgba(233, 69, 96, 0.4));
		transition: all 0.3s ease;
	}

	.item-emoji:not(.revealed) {
		filter: drop-shadow(0 4px 20px rgba(255, 255, 255, 0.2));
	}

	.item-name {
		font-size: clamp(2rem, 6vw, 4rem);
		font-weight: bold;
		text-align: center;
		transition: all 0.3s ease;
	}

	.item-name.revealed {
		color: var(--accent);
		text-shadow: 0 0 30px rgba(233, 69, 96, 0.5);
	}

	.item-name:not(.revealed) {
		color: var(--text-secondary);
	}

	/* Timer section */
	.timer-section {
		width: 100%;
		max-width: 400px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}

	.timer-display {
		font-size: clamp(2rem, 8vw, 4rem);
		font-weight: bold;
		font-family: monospace;
		transition: all 0.3s ease;
	}

	.timer-display.green {
		color: #00d4aa;
		text-shadow: 0 0 20px rgba(0, 212, 170, 0.5);
	}

	.timer-display.yellow {
		color: #ffc107;
		text-shadow: 0 0 20px rgba(255, 193, 7, 0.5);
	}

	.timer-display.red {
		color: #ff4757;
		text-shadow: 0 0 20px rgba(255, 71, 87, 0.5);
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: var(--bg-input);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		transition: width 0.3s linear;
		border-radius: 4px;
	}

	.progress-fill.green {
		background: linear-gradient(90deg, #00d4aa, #00a080);
	}

	.progress-fill.yellow {
		background: linear-gradient(90deg, #ffc107, #ff9800);
	}

	.progress-fill.red {
		background: linear-gradient(90deg, #ff4757, #cc2f3d);
	}

	.time-up-badge {
		background: linear-gradient(135deg, #ff4757, #cc2f3d);
		color: white;
		padding: 12px 32px;
		border-radius: 30px;
		font-size: 1.2rem;
		font-weight: bold;
		animation: pulse 1s infinite;
	}

	@keyframes pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.05); }
	}

	/* Game controls */
	.game-controls {
		display: flex;
		gap: 16px;
		margin-top: 20px;
	}

	.control-btn {
		padding: 16px 32px;
		font-size: 1.2rem;
		border-radius: 12px;
		border: none;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.reveal-btn {
		background: var(--bg-input);
		color: white;
	}

	.reveal-btn:hover {
		background: #1a4a80;
	}

	.next-btn {
		background: linear-gradient(135deg, var(--accent), #d63050);
		color: white;
	}

	.next-btn:hover {
		box-shadow: 0 4px 20px rgba(233, 69, 96, 0.5);
	}

	.item-counter {
		color: var(--text-secondary);
		font-size: 1rem;
		margin-top: 20px;
	}

	/* Setup styles */
	.category-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.category-tag {
		padding: 10px 16px;
		border-radius: 20px;
		background: var(--bg-input);
		border: 2px solid transparent;
		color: var(--text-primary);
		cursor: pointer;
		font-size: 0.95rem;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.category-tag:hover {
		background: #1a4a80;
	}

	.category-tag.active {
		border-color: var(--accent);
		background: rgba(233, 69, 96, 0.2);
	}

	.item-count {
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	/* Custom items */
	.hint {
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin-bottom: 12px;
	}

	.custom-textarea {
		width: 100%;
		padding: 14px 16px;
		border: 2px solid transparent;
		border-radius: 10px;
		background: var(--bg-input);
		color: var(--text-primary);
		font-size: 1rem;
		font-family: inherit;
		resize: vertical;
		min-height: 100px;
	}

	.custom-textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.custom-textarea::placeholder {
		color: var(--text-secondary);
	}

	.custom-count {
		margin-top: 10px;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	/* Timer presets */
	.timer-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 16px;
	}

	.preset-btn {
		padding: 10px 16px;
		border-radius: 8px;
		background: var(--bg-input);
		border: 2px solid transparent;
		color: var(--text-primary);
		cursor: pointer;
		font-size: 0.95rem;
		transition: all 0.2s ease;
	}

	.preset-btn:hover {
		background: #1a4a80;
	}

	.preset-btn.active {
		border-color: var(--accent);
		background: rgba(233, 69, 96, 0.2);
	}

	.custom-timer {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.custom-timer label {
		white-space: nowrap;
		margin-bottom: 0;
	}

	.custom-timer input {
		width: 100px;
	}

	/* Game screen inline styles */
	.game-header {
		text-align: center;
		margin-bottom: 20px;
	}

	.game-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 30px 20px;
	}

	.game-card .item-emoji {
		font-size: clamp(4rem, 15vw, 8rem);
	}

	.game-card .item-name {
		font-size: clamp(1.5rem, 5vw, 2.5rem);
		margin-bottom: 20px;
	}

	.game-card .timer-display {
		font-size: clamp(1.5rem, 5vw, 2.5rem);
	}

	.game-card .progress-bar {
		max-width: 300px;
		margin-bottom: 10px;
	}

	.game-controls-inline {
		display: flex;
		gap: 10px;
		margin-bottom: 10px;
	}

	.game-controls-inline button {
		flex: 1;
	}

	.btn-danger-outline {
		background: transparent;
		color: var(--impostor-color);
		border: 2px solid var(--impostor-color);
	}

	.btn-danger-outline:hover {
		background: rgba(255, 71, 87, 0.1);
	}

	.item-counter-inline {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin-top: 10px;
	}

	/* Responsive */
	@media (max-width: 500px) {
		.game-controls {
			flex-direction: column;
			width: 100%;
		}

		.control-btn {
			width: 100%;
		}

		.category-tag {
			font-size: 0.85rem;
			padding: 8px 12px;
		}

		.timer-presets {
			justify-content: center;
		}
	}
</style>
