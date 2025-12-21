<script lang="ts">
	import '../app.css';
	import '$lib/i18n';
	import { page } from '$app/stores';
	import { _, isLoading } from 'svelte-i18n';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

	let { children } = $props();

	const isHome = $derived($page.url.pathname === '/');
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
</svelte:head>

{#if $isLoading}
	<div class="loading">Loading...</div>
{:else}
	<div class="app">
		<nav class="nav" class:nav-home={isHome}>
			{#if !isHome}
				<a href="/" class="nav-link">
					<span class="nav-icon">🎮</span>
					<span>{$_('common.games')}</span>
				</a>
			{/if}
			<div class="nav-spacer"></div>
			<LanguageSwitcher />
		</nav>

		<main>
			{@render children()}
		</main>
	</div>
{/if}

<style>
	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		color: var(--text-secondary);
	}

	.app {
		min-height: 100vh;
	}

	.nav {
		display: flex;
		align-items: center;
		padding: 12px 20px;
		background: rgba(22, 33, 62, 0.8);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.nav-home {
		justify-content: flex-end;
	}

	.nav-link {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		background: var(--bg-input);
		border-radius: 8px;
		font-weight: 500;
		transition: background 0.2s;
	}

	.nav-link:hover {
		background: #1a4a80;
	}

	.nav-icon {
		font-size: 1.2rem;
	}

	.nav-spacer {
		flex: 1;
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
