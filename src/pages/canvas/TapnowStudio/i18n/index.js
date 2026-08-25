import { createInstance } from 'i18next';
import en from './locales/en.json';

export const normalizeCanvasLanguage = (language) => {
    const raw = String(language || '').toLowerCase();
    return raw.startsWith('en') ? 'en' : 'zh';
};

export const toReelmaxLanguage = (language) => normalizeCanvasLanguage(language) === 'en' ? 'en-US' : 'zh-CN';

const getInitialLanguage = () => {
    try {
        const storedLanguage = window.localStorage.getItem('jellyfish_language');
        if (storedLanguage) return normalizeCanvasLanguage(storedLanguage);

        const browserLanguage = window.navigator.languages?.[0] || window.navigator.language;
        return normalizeCanvasLanguage(browserLanguage);
    } catch {
        return 'zh';
    }
};

const resources = {
    zh: { translation: {} },
    en: { translation: en }
};

const i18n = createInstance();

i18n.init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'zh',
    interpolation: { escapeValue: false },
    returnEmptyString: false
});

export default i18n;
