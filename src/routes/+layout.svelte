<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let { children } = $props();

	const isHome = $derived($page.url.pathname === '/');
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
</svelte:head>

<div class="app">
	{#if !isHome}
		<nav class="nav">
			<a href="/" class="nav-home">
				<span class="nav-icon">🎮</span>
				<span>Games</span>
			</a>
		</nav>
	{/if}

	<main>
		{@render children()}
	</main>
</div>

<style>
	.app {
		min-height: 100vh;
	}

	.nav {
		padding: 12px 20px;
		background: rgba(22, 33, 62, 0.8);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.nav-home {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		background: var(--bg-input);
		border-radius: 8px;
		font-weight: 500;
		transition: background 0.2s;
	}

	.nav-home:hover {
		background: #1a4a80;
	}

	.nav-icon {
		font-size: 1.2rem;
	}

	main {
		animation: fadeIn 0.3s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
