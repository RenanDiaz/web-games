<script lang="ts">
	import { locale } from 'svelte-i18n';
	import { browser } from '$app/environment';

	const languages = [
		{ code: 'en', name: 'EN', flag: '🇺🇸' },
		{ code: 'es', name: 'ES', flag: '🇪🇸' }
	];

	function changeLanguage(event: Event) {
		const target = event.target as HTMLSelectElement;
		const newLocale = target.value;
		locale.set(newLocale);
		if (browser) {
			localStorage.setItem('locale', newLocale);
		}
	}
</script>

<div class="language-switcher">
	<select onchange={changeLanguage} value={$locale?.substring(0, 2) || 'en'}>
		{#each languages as lang}
			<option value={lang.code}>
				{lang.flag} {lang.name}
			</option>
		{/each}
	</select>
</div>

<style>
	.language-switcher {
		display: flex;
		align-items: center;
	}

	select {
		background: var(--bg-input);
		color: var(--text-primary);
		border: none;
		padding: 8px 12px;
		border-radius: 8px;
		font-size: 0.9rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	select:hover {
		background: #1a4a80;
	}

	select:focus {
		outline: none;
		box-shadow: 0 0 0 2px var(--accent);
	}
</style>
