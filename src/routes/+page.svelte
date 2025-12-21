<script lang="ts">
	const games = [
		{
			slug: 'among-us-party',
			icon: '🎭',
			title: 'Among Us Party',
			description:
				'Play Among Us in real life! This app assigns Impostor and Crewmate roles secretly to each player using a PIN system. Track scores across multiple rounds.',
			tag: 'Party Game'
		}
	];
</script>

<svelte:head>
	<title>Web Games Collection</title>
</svelte:head>

<div class="home">
	<h1>🎮 Web Games</h1>
	<p class="subtitle">A collection of fun browser games</p>

	<div class="games-grid">
		{#each games as game}
			<a href="/{game.slug}" class="game-card">
				<div class="game-icon">{game.icon}</div>
				<div class="game-title">{game.title}</div>
				<div class="game-description">{game.description}</div>
				<span class="game-tag">{game.tag}</span>
			</a>
		{/each}
	</div>
</div>

<style>
	.home {
		max-width: 800px;
		margin: 0 auto;
		padding: 40px 20px;
	}

	.games-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 24px;
	}

	.game-card {
		background: var(--bg-card);
		border-radius: 16px;
		padding: 24px;
		display: block;
		transition:
			transform 0.2s,
			box-shadow 0.2s;
	}

	.game-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 8px 30px rgba(233, 69, 96, 0.3);
	}

	.game-icon {
		font-size: 3rem;
		margin-bottom: 16px;
	}

	.game-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 8px;
	}

	.game-description {
		color: var(--text-secondary);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.game-tag {
		display: inline-block;
		background: var(--accent);
		color: white;
		padding: 4px 12px;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 600;
		margin-top: 16px;
	}
</style>
