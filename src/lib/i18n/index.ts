import { browser } from '$app/environment';
import { init, register, getLocaleFromNavigator } from 'svelte-i18n';

const defaultLocale = 'en';

register('en', () => import('./locales/en.json'));
register('es', () => import('./locales/es.json'));

init({
	fallbackLocale: defaultLocale,
	initialLocale: browser ? localStorage.getItem('locale') || getLocaleFromNavigator() : defaultLocale
});
