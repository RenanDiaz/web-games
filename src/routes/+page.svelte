<script lang="ts">
	import { _ } from 'svelte-i18n';

	const games = [
		{
			slug: 'among-us-party',
			icon: '🎭',
			titleKey: 'home.games.amongUs.title',
			descriptionKey: 'home.games.amongUs.description',
			tagKey: 'home.games.amongUs.tag'
		}
	];
</script>

<svelte:head>
	<title>{$_('home.title')}</title>
</svelte:head>

<div class="home">
	<h1>🎮 {$_('home.heading')}</h1>
	<p class="subtitle">{$_('home.subtitle')}</p>

	<div class="games-grid">
		{#each games as game}
			<a href="/{game.slug}" class="game-card">
				<div class="game-icon">{game.icon}</div>
				<div class="game-title">{$_(game.titleKey)}</div>
				<div class="game-description">{$_(game.descriptionKey)}</div>
				<span class="game-tag">{$_(game.tagKey)}</span>
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
