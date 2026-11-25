import Adapt from 'core/js/adapt';
import data from 'core/js/data';

/**
 * Chapter jump list for AUTHOR PREVIEW builds only (CAI-626).
 *
 * The Kurs-Generator writes `_globals._extensions._blockNavigation._isPreview = true`
 * into course.json for preview builds; published builds carry no such key, and then
 * this module is completely inert (no listeners act, no DOM is added).
 *
 * In a preview it inserts a <select> listing every chapter (= Adapt article with at
 * least one navigable block, across all pages, course order) into the bottom progress
 * bar. Picking a chapter on the current page shows its first block; a chapter on
 * another page is reached through Adapt's router (`#/id/article-<chapter id>`), where
 * the controller's preview start logic (`previewStartIndex`) picks it up.
 *
 * It is a separate module on purpose, so the chapter list does not touch the
 * progress-bar template. It still uses the controller's navigation state
 * (`navBlocks`, `currentBlock()`, `showBlock()`, `isBlockNavigable()`,
 * `currentSelection`, `_getI18nMap()`).
 */
export const CHAPTER_JUMP_CLASS = 'block-navigation__chapter-jump';
const I18N_KEY = 'chapterJump.aria';
const FALLBACK_LABEL = 'Zu Kapitel springen';

export function isPreview() {
    return Adapt.course?.get('_globals')?._extensions?._blockNavigation?._isPreview === true;
}

/** The id a `#/id/<id>` route names, or null (also for a malformed escape). */
export function routedId(hash = window.location.hash) {
    const m = String(hash || '').match(/^#\/id\/([^/?#]+)/);
    if (!m) return null;
    try {
        return decodeURIComponent(m[1]);
    } catch (e) {
        return null;
    }
}

/** Keys that move a closed <select>'s value: browsing, not a decision to jump. */
const BROWSE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * Index into `navBlocks` the page should open at. In a preview: the routed block, or
 * the first block of the routed article (chapter). Otherwise — and for any id that is
 * not on this page — 0, exactly as before.
 */
export function previewStartIndex(navBlocks, hash = window.location.hash) {
    if (!isPreview()) return 0;
    const id = routedId(hash);
    if (!id) return 0;
    const index = navBlocks.findIndex(b => b.get('_id') === id || b.get('_parentId') === id);
    return index < 0 ? 0 : index;
}

/** Plain text of a rendered localized title for the active locale/proficiency. */
export function localizedTitle(html, selection) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    const loc = (selection?.locale || '').toLowerCase();
    const prof = (selection?.proficiency || '').toLowerCase();
    const match = loc && prof && tmp.querySelector(`.localized-content.locale-${loc}.proficiency-${prof}`);
    const first = tmp.querySelector('.localized-content');
    return ((match || first || tmp).textContent || '').trim();
}

export default class ChapterJump {
    constructor(controller) {
        this.controller = controller;
        this.selectEl = null;
        Adapt.on('blockNavigation:progressBarRendered', ({el} = {}) => {
            if (isPreview()) this.attach(el);
        });
        Adapt.on('blockNavigation:changed', () => {
            if (isPreview()) this.syncValue();
        });
        Adapt.on('contentSelector:selectionChanged', () => {
            if (isPreview()) this.relabel();
        });
        // Before the router reads the URL: a preview link to a chapter that is not in
        // the build (no content, or deleted since) would leave Adapt on its loading
        // screen ("Bad id"). Open the course start instead.
        Adapt.once('adapt:start', () => {
            const id = routedId();
            if (isPreview() && id && !data.findById(id)) window.location.replace('#/');
        });
    }

    chapters() {
        const articles = Adapt.course?.findDescendantModels?.('article') || [];
        return articles.filter(article => {
            const blocks = article.findDescendantModels?.('block') || [];
            return blocks.some(b => this.controller.isBlockNavigable(b));
        });
    }

    attach(progressEl) {
        const inner = progressEl?.querySelector?.('.block-navigation-progress-container__inner');
        if (!inner) return;
        const chapters = this.chapters();
        if (chapters.length < 2) return; // nothing to jump between

        const select = document.createElement('select');
        select.className = CHAPTER_JUMP_CLASS;
        select.setAttribute('data-i18n-aria', I18N_KEY);
        select.setAttribute('data-i18n-title', I18N_KEY);
        chapters.forEach(article => {
            const option = document.createElement('option');
            option.value = article.get('_id');
            select.appendChild(option);
        });
        // A closed <select> fires `change` on every arrow key; jumping (and moving
        // focus away) there would make the list unusable from the keyboard. Arrow
        // keys only browse; Enter, a mouse pick or a picker's own commit jumps.
        let browsing = false;
        select.addEventListener('keydown', (event) => {
            if (BROWSE_KEYS.has(event.key)) {
                browsing = true;
            } else if (event.key === 'Enter') {
                event.preventDefault();
                browsing = false;
                this.jumpTo(select.value);
            }
        });
        select.addEventListener('mousedown', () => { browsing = false; });
        select.addEventListener('change', () => {
            if (!browsing) this.jumpTo(select.value);
        });
        // Browsed away without committing: show the current chapter again.
        select.addEventListener('blur', () => {
            browsing = false;
            this.syncValue();
        });

        const progress = inner.querySelector('progress');
        if (progress) progress.insertAdjacentElement('afterend', select); else inner.appendChild(select);
        this.selectEl = select;
        this.relabel();
        this.syncValue();
    }

    relabel() {
        const select = this.selectEl;
        // Not `document.contains`: the progress bar announces itself before it is
        // appended to the page, so the first labelling runs on a detached element.
        if (!select) return;
        const selection = this.controller.currentSelection;
        const key = `${selection?.locale || 'de'}-${selection?.proficiency || 'original'}`;
        const label = this.controller._getI18nMap()?.[I18N_KEY]?.[key] || FALLBACK_LABEL;
        select.setAttribute('aria-label', label);
        select.setAttribute('title', label);
        // No numbers: chapters without content are not in the build, so a position in
        // this list would not match the chapter's number in the editor.
        Array.from(select.options).forEach((option) => {
            const article = data.findById(option.value);
            option.textContent = article ? localizedTitle(article.get('displayTitle') || article.get('title'), selection) : '';
        });
    }

    syncValue() {
        const select = this.selectEl;
        const block = this.controller.currentBlock?.();
        if (!select || !block) return;
        select.value = block.get('_parentId');
    }

    jumpTo(articleId) {
        const navBlocks = this.controller.navBlocks || [];
        const index = navBlocks.findIndex(b => b.get('_parentId') === articleId);
        if (index >= 0) {
            // Keep focus on the list (the controller would move it to the chapter title)
            this.controller.showBlock(index, {moveFocus: false});
            requestAnimationFrame(() => this.selectEl?.focus());
            return;
        }
        // Chapter on another page: let Adapt's router render that page; the
        // controller's onPageReady then starts at this chapter (previewStartIndex).
        Backbone.history.navigate(`#/id/${articleId}`, {trigger: true});
    }
}
