import Adapt from 'core/js/adapt';
import BlockNavigationView from './adapt-blockNavigationView';
import ChatView from './ChatView';
import data from 'core/js/data';
import a11y from 'core/js/a11y';


class BlockNavigation extends Backbone.Controller {
    initialize() {
        this.navBlocks = [];
        this.currentIndex = 0;
        this.currentArticle = null;
        this.footerView = null;
        this.ttsEnabled = this._loadTTSEnabled();
        this._audioEl = null;
        this._ttsRequeueTimer = null;
        this.currentSelection = null;
        this._cs = {
            toggleEl: null,
            panelEl: null,
            backdropEl: null,
            buttonsEl: null,
            styleEl: null
        };
        this._onNarrativeControlClick = this._onNarrativeControlClick.bind(this);
        this._onArrowKeydown = this._onArrowKeydown.bind(this);
        this.chatView = null; // persistent singleton chat
        this._chatIntroShown = false;

        this.listenTo(Adapt, 'pageView:ready', this.onPageReady);
        console.log('[blockNavigation] initializing; listening for pageView:ready');
        this.listenTo(Adapt, 'router:page', this.onPageChange);
        this.listenTo(Adapt.components, 'change:_isComplete', this.onComponentComplete);
        this.listenTo(Adapt, 'contentSelector:changed', this.onContentSelectorChanged);
        this.listenTo(Adapt, 'contentSelector:selectionChanged', this.onSelectionChanged);
        this.listenTo(Adapt, 'router:page', this._refreshChatCourseId);
        this.listenTo(Adapt, 'blockNavigation:rendered', ({el}) => {
            try {
                this._ensureContentSelectorUI(el);
            } catch (e) { /* noop */
            }
        });
        this.listenTo(Adapt, 'capitoBadges:showDialog', (html) => {
            try {
                this._showCsDialog(html);
            } catch (e) { /* noop */
            }
        });

        // Listen for Adapt popup openings (e.g., hotgraphic popups) to drive TTS by item index
        this.listenTo(Adapt, 'popup:opened', this._checkPopupReadable);
        // Listen for hotgraphic item changes within the popup
        this.listenTo(Adapt, 'hotgraphic:popupItemChanged', this._onHotgraphicPopupItemChanged);
        this.listenTo(Adapt, 'notify:closed', this._teardownHotgraphicPopupObserver);

        // Explanations feature: delegated handlers
        this._onExplClick = this._onExplClick?.bind ? this._onExplClick.bind(this) : (e) => this._onExplClick(e);
        this._onDocKeydown = this._onDocKeydown?.bind ? this._onDocKeydown.bind(this) : (e) => this._onDocKeydown(e);
        this._onComponentRendered = (view) => {
            try {
                // Apply explanations only to the rendered component container
                const explanations = this._getExplanations();
                if (!explanations?.length) return;
                const el = view?.$el?.get?.(0) || view?.el;
                if (!el) return;
                this._annotateElement(el, explanations);
            } catch (e) { /* noop */
            }
        };

        // Ensure chat is created early and persists across pages
        this._ensureChat();
        // Expose instance for other components that need currentSelection
        Adapt.blockNavigation = this;
        Adapt.trigger('blockNavigation:initialized', {instance: this});

        // Initialize content selector state early so visibility is applied even before UI attaches
        try {
            this._initContentSelectorState();
        } catch (e) { /* noop */
        }
        // Provide backwards compatible global helpers
        try {
            this._exposeCsGlobals();
        } catch (e) { /* noop */
        }
    }

    _checkPopupReadable(popup) {
        try {
            const popupEl = popup?.prevObject?.[0] || popup?.$el?.get?.(0) || document.querySelector('.hotgraphic-popup');
            const html = popupEl?.innerHTML || '';
            if (!html) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const countEl = tmp.querySelector('.hotgraphic-popup__count');
            if (!countEl) return;
            const text = (countEl.textContent || '').trim();
            this._handleHotgraphicPopupCount(text);
            this._setupHotgraphicPopupObserver(popupEl);
        } catch (e) {
            console.warn('[blockNavigation] failed to process popup:opened for TTS', e);
        }
    }

    _handleHotgraphicPopupCount(text) {
        // Expect formats like "1/5" or "1 / 5"
        const m = String(text || '').trim().match(/(\d+)\s*\/\s*(\d+)/);
        if (!m) return;
        const index = parseInt(m[1]) - 1;
        if (Number.isNaN(index) || index < 0) return;
        this._lastHotgraphicIndex = index;
        if (this.ttsEnabled) {
            this._playTTSForCurrentBlock(index);
        }
    }

    _setupHotgraphicPopupObserver(popupEl) {
        if (!popupEl) return;
        const countEl = popupEl.querySelector('.hotgraphic-popup__count');
        if (!countEl) return;
        this._teardownHotgraphicPopupObserver();
        this._hotgraphicCountObserver = new MutationObserver(() => {
            this._handleHotgraphicPopupCount(countEl.textContent || '');
        });
        this._hotgraphicCountObserver.observe(countEl, {
            characterData: true,
            childList: true,
            subtree: true
        });
        this._hotgraphicCountEl = countEl;
    }

    _teardownHotgraphicPopupObserver() {
        if (this._hotgraphicCountObserver) {
            this._hotgraphicCountObserver.disconnect();
            this._hotgraphicCountObserver = null;
            this._hotgraphicCountEl = null;
        }
    }

    _onHotgraphicPopupItemChanged(payload) {
        try {
            const index = payload?.index;
            if (index === undefined || index === null || Number.isNaN(index) || index < 0) return;
            this._lastHotgraphicIndex = index;
            if (this.ttsEnabled) {
                this._playTTSForCurrentBlock(index);
            }
        } catch (e) {
            console.warn('[blockNavigation] failed to process hotgraphic:popupItemChanged for TTS', e);
        }
    }

    _ensureChat() {
        try {
            if (this.chatView) return;
            this.chatView = new ChatView({parentView: null});
            this.chatView.render();
            // Append to body to avoid layout constraints
            this.chatView.$el.appendTo('body');
            // Set course id. The chat now stays hidden until the user clicks the
            // robot launcher in the navigation bar (which triggers 'bnChat:toggle').
            if (this.chatView.setCourseIdFromDOM) this.chatView.setCourseIdFromDOM();
        } catch (e) {
            console.warn('[blockNavigation] failed to ensure chat', e);
        }
    }

    _refreshChatCourseId() {
        try {
            if (this.chatView && this.chatView.setCourseIdFromDOM) {
                this.chatView.setCourseIdFromDOM();
            }
        } catch (e) { /* noop */
        }
    }

    onSelectionChanged(payload) {
        if (!payload) return;
        this.currentSelection = {
            locale: (payload.locale || 'de').toLowerCase(),
            proficiency: (payload.proficiency || 'original').toLowerCase()
        };
        console.log('[blockNavigation] selectionChanged', this.currentSelection);
        this._stopAudio();

        if (this.ttsEnabled) {
            this._playTTSForCurrentBlock();
        }

        // Re-apply explanations for new locale
        try {
            this._applyExplanationsToPage();
        } catch (e) {
            console.warn('[blockNavigation] failed to apply explanations after selection change', e);
        }

        // Update all i18n aria-labels for the new locale-proficiency
        try {
            this._updateI18nAttributes();
        } catch (e) {
            console.warn('[blockNavigation] failed to update i18n attributes after selection change', e);
        }
    }

    getGlobalConfig() {
        const globals = Adapt.course?.get('_globals');
        return globals || {};
    }

    onPageChange() {

        console.log('[blockNavigation] router:page -> teardown');
        this.teardown();
        // Persist chat across page changes
        this._ensureChat();
        // Re-apply content selector CSS on navigation
        try {
            this._applyCsVisibilityCSS();
        } catch (e) { /* noop */
        }
    }

    teardown() {
        $(document).off('keydown.blockNavArrows', this._onArrowKeydown);
        if (this.footerView) {
            this.footerView.remove();
            this.footerView = null;
        }
        this._stopAudio();
        this._detachNarrativeControlListeners();
        this._teardownExplanations();
        Adapt.off('componentView:postRender', this._onComponentRendered);
        (this.navBlocks || []).forEach(b => b?.$el?.removeClass('block-navigation-hidden'));
        try {
            this._showAllArticleHeadings();
        } catch (e) { /* noop */
        }
        this.navBlocks = [];
        this.currentArticle = null;
        this.currentIndex = 0;
        // Reset last hotgraphic index on teardown to avoid cross-page carryover
        this._lastHotgraphicIndex = undefined;
    }

    onPageReady(view) {
        const article = view?.model;
        if (!article) return;

        console.log('[blockNavigation] pageView:ready', {id: article.get ? article.get('_id') : undefined});

        const pageEnabled = this.getSettingFromModel(article, '_isEnabled');
        if (pageEnabled === false) return;

        // collect descendant blocks
        const blocks = article.findDescendantModels ? article.findDescendantModels('block') : [];
        if (!blocks?.length) return;

        // filter special cases and enabled blocks
        this.navBlocks = blocks.filter(block => this.isBlockNavigable(block));
        if (this.navBlocks.length <= 1) return; // nothing to paginate

        this.currentArticle = article;
        this.currentIndex = 0;

        // Build quick lookup for indices by block id
        this._blockIndexById = {};
        this.navBlocks.forEach((b, i) => {
            this._blockIndexById[b.get('_id')] = i;
        });

        // Hide all except first; some blocks may not have rendered yet, so defer hiding until their views are ready
        this.navBlocks.forEach((block, idx) => {
            this._setBlockHidden(block, idx !== 0);
        });
        this._deferInitialHideUntilBlocksRender();

        // build footer UI
        this.createOrUpdateFooter();

        // Attach delegated listeners for narrative prev/next controls
        this._attachNarrativeControlListeners();

        // keyboard support
        $(document).off('keydown.blockNavArrows').on('keydown.blockNavArrows', this._onArrowKeydown);

        this.announceCurrent();
        Adapt.trigger('blockNavigation:changed', {oldIndex: -1, newIndex: 0});
        // Ensure article headings reflect visibility
        this._updateArticleHeadings();

        // If TTS is enabled, try to play for the current block
        if (this.ttsEnabled) this._playTTSForCurrentBlock();

        // Apply explanations to current page
        try {
            this._applyExplanationsToPage();
            // Also listen for components that render later
            Adapt.off('componentView:postRender', this._onComponentRendered);
            Adapt.on('componentView:postRender', this._onComponentRendered);
        } catch (e) {
            console.warn('[blockNavigation] failed to apply explanations on page ready', e);
        }

        // Ensure content selector UI is attached for this page
        try {
            this._ensureContentSelectorUI(document.getElementById('block-navigation-container'));
        } catch (e) { /* noop */
        }
    }

    onContentSelectorChanged = () => {
        // Re-evaluate block list but keep position when possible
        const oldIndex = this.currentIndex;
        this.refreshBlocks();
        this.showBlock(oldIndex);
    };

    refreshBlocks() {
        if (!this.currentArticle) return;
        const blocks = this.currentArticle.findDescendantModels ? this.currentArticle.findDescendantModels('block') : [];
        this.navBlocks = blocks.filter(block => this.isBlockNavigable(block));
        // ensure current index in range
        if (this.currentIndex >= this.navBlocks.length) this.currentIndex = this.navBlocks.length - 1;
        if (this.currentIndex < 0) this.currentIndex = 0;
    }

    isBlockNavigable(block) {
        const id = block.get('_id');

        if (id.startsWith('block-content-selector')) return false;
        if (id.startsWith('roleplay-block')) return false;
        const cfg = block.get('_blockNavigation');
        // If explicitly disabled
        if (cfg && cfg._isEnabled === false) return false;

        // If article has _onChildren true, treat missing cfg as enabled; otherwise allow by default
        return true;
    }

    // ================== Content Selector (migrated) ==================
    _getCsConfig() {
        const globals = this.getGlobalConfig();
        const cfg = globals?._extensions?._blockNavigation?._contentSelector || {};
        const defLocale = (cfg._defaultLocale || 'de').toLowerCase();
        const defProf = (cfg._defaultProficiency || 'original').toLowerCase();
        const remember = cfg._rememberSelection !== false;
        const options = Array.isArray(cfg._options) ? cfg._options : [];
        return {defLocale, defProf, remember, options};
    }

    _initContentSelectorState() {
        const {defLocale, defProf} = this._getCsConfig();
        const stored = this._readStoredSelection();
        const sel = stored || {locale: defLocale, proficiency: defProf};
        this.currentSelection = {locale: sel.locale, proficiency: sel.proficiency};
        this._applyCsVisibilityCSS();
        // Broadcast once so other features (e.g., explanations) can initialize
        Adapt.set('_contentSelectorSelection', {...this.currentSelection});
        Adapt.trigger('contentSelector:selectionChanged', {...this.currentSelection});
    }

    _ensureContentSelectorUI(navEl) {
        const host = (navEl instanceof Element) ? navEl.querySelector('#block-navigation-cs-locale') : document.getElementById('block-navigation-cs-locale');
        if (!host) return;
        // Create toggle if missing
        if (!this._cs.toggleEl) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cs-locale-toggle';
            const i18nMap = this._getI18nMap();
            const localeProfKey = `${this.currentSelection?.locale || 'de'}-${this.currentSelection?.proficiency || 'original'}`;
            const label = i18nMap['cs.toggle.aria']?.[localeProfKey] || 'Klicken Sie hier, um den Text einfacher zu machen, oder in einer anderen Sprache anzuzeigen.';
            btn.title = label;
            btn.setAttribute('aria-label', label);
            btn.setAttribute('data-i18n-aria', 'cs.toggle.aria');
            btn.setAttribute('data-i18n-title', 'cs.toggle.aria');
            btn.setAttribute('aria-haspopup', 'dialog');
            btn.setAttribute('aria-expanded', 'false');
            const img = document.createElement('img');
            const imgAlt = i18nMap['cs.toggle.imgAlt']?.[localeProfKey] || 'Aktuelle Sprache';
            img.alt = imgAlt;
            img.setAttribute('data-i18n-alt', 'cs.toggle.imgAlt');
            img.src = this._getFlagPath(this.currentSelection?.locale);
            btn.appendChild(img);
            this._applyProficiencyClass(btn, this.currentSelection?.proficiency);
            this._applyProficiencyClass(img, this.currentSelection?.proficiency);
            btn.addEventListener('click', () => this._toggleCsPanel());
            this._cs.toggleEl = btn;
        } else {
            const img = this._cs.toggleEl.querySelector('img');
            if (img) img.src = this._getFlagPath(this.currentSelection?.locale);
            this._applyProficiencyClass(this._cs.toggleEl, this.currentSelection?.proficiency);
            this._applyProficiencyClass(img, this.currentSelection?.proficiency);
        }

        // Insert before Next if present
        const nextBtn = host.querySelector('.js-block-nav-next');
        if (nextBtn && nextBtn.parentElement === host) host.insertBefore(this._cs.toggleEl, nextBtn); else host.appendChild(this._cs.toggleEl);

        // Ensure panel exists and is populated
        this._ensureCsPanel();
        this._buildCsButtons();
        this._updateCsActive();
    }

    _ensureCsPanel() {
        if (!this._cs.styleEl) {
            const style = document.createElement('style');
            style.id = 'content-selector-inline-style';
            style.textContent = '';
            document.head.appendChild(style);
            this._cs.styleEl = style;
        }
        if (!this._cs.backdropEl) {
            const backdrop = document.createElement('div');
            backdrop.id = 'content-selector-backdrop';
            backdrop.className = 'cs-flag-backdrop';
            backdrop.addEventListener('click', () => this._toggleCsPanel(false));
            this._cs.backdropEl = backdrop;
        }
        if (!this._cs.panelEl) {
            const panel = document.createElement('div');
            panel.id = 'content-selector-panel';
            panel.className = 'cs-flag-panel';
            panel.setAttribute('aria-hidden', 'true');
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            const i18nMap = this._getI18nMap();
            const lpKey = `${this.currentSelection?.locale || 'de'}-${this.currentSelection?.proficiency || 'original'}`;
            panel.setAttribute('aria-label', i18nMap['cs.panel.aria']?.[lpKey] || 'Sprache und Sprachstufe wählen');
            panel.setAttribute('data-i18n-aria', 'cs.panel.aria');

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'cs-flag-panel__close';
            closeBtn.setAttribute('aria-label', i18nMap['cs.close.aria']?.[lpKey] || 'Schließen');
            closeBtn.setAttribute('data-i18n-aria', 'cs.close.aria');
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => this._toggleCsPanel(false));

            const inner = document.createElement('div');
            inner.className = 'cs-flag-panel__inner';
            const info = document.createElement('div');
            info.className = 'content-selector-info';
            info.id = 'content-selector-info';
            info.textContent = i18nMap['cs.panel.info']?.[lpKey] || 'Sie können den Text einfacher machen. Klicken Sie dafür auf die Sprache und Sprachstufe, die Ihnen passt.';
            info.setAttribute('data-i18n-text', 'cs.panel.info');
            const buttons = document.createElement('div');
            buttons.className = 'content-selector-buttons';
            buttons.id = 'content-selector-buttons';
            inner.appendChild(info);
            inner.appendChild(buttons);
            panel.appendChild(closeBtn);
            panel.appendChild(inner);
            this._cs.panelEl = panel;
            this._cs.buttonsEl = buttons;
        }
        if (document.body) {
            if (!document.body.contains(this._cs.backdropEl)) document.body.appendChild(this._cs.backdropEl);
            if (!document.body.contains(this._cs.panelEl)) document.body.appendChild(this._cs.panelEl);
        }
    }

    _buildCsButtons() {
        const opts = this._getCsConfig().options || [];
        if (!this._cs.buttonsEl) return;
        this._cs.buttonsEl.innerHTML = '';

        const desiredOrder = ['de-original', 'de-b1', 'de-a2', 'bo-original'];
        const normalize = v => (v || '').toLowerCase();
        const orderIndex = new Map(desiredOrder.map((v, i) => [v, i]));
        const sorted = opts.slice().sort((a, b) => {
            const av = normalize(a[1]);
            const bv = normalize(b[1]);
            const ai = orderIndex.has(av) ? orderIndex.get(av) : Number.MAX_SAFE_INTEGER;
            const bi = orderIndex.has(bv) ? orderIndex.get(bv) : Number.MAX_SAFE_INTEGER;
            if (ai !== bi) return ai - bi;
            return 0;
        });

        const deriveLabel = (val, fallback) => {
            if (fallback && String(fallback).trim().length > 0) return fallback;
            const [lang, prof] = (val || '').split('-');
            const langLabel = (lang || '').toUpperCase();
            let profLabel = (prof || '').toLowerCase();
            if (profLabel === 'original') profLabel = 'Original'; else profLabel = profLabel.toUpperCase();
            return `${langLabel} - ${profLabel}`;
        };

        sorted.forEach(([label, value]) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'content-selector-item';
            item.setAttribute('data-value', value);
            item.setAttribute('aria-pressed', 'false');

            const img = document.createElement('img');
            img.className = 'content-selector-btn';
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            img.src = this._getFlagPathFromValue(value);
            const [, proficiency] = (value || '').split('-');

            const span = document.createElement('span');
            span.className = 'content-selector-label';
            span.textContent = deriveLabel(value, label);

            const onSelect = () => {
                const [locale, proficiency] = (value || '').split('-');
                this._selectContent(locale, proficiency);
                this._updateCsActive();
                this._toggleCsPanel(false);
            };
            item.addEventListener('click', onSelect);

            const imgWrap = document.createElement('div');
            imgWrap.className = 'content-selector-flag';
            imgWrap.setAttribute('aria-hidden', 'true');
            this._applyProficiencyClass(imgWrap, proficiency);
            this._applyProficiencyClass(img, proficiency);
            imgWrap.appendChild(img);
            item.appendChild(imgWrap);
            item.appendChild(span);
            this._cs.buttonsEl.appendChild(item);
        });
    }

    _updateCsActive() {
        const cur = `${(this.currentSelection?.locale || '').toLowerCase()}-${(this.currentSelection?.proficiency || '').toLowerCase()}`;
        const container = document.getElementById('content-selector-buttons');
        if (!container) return;
        Array.from(container.querySelectorAll('.content-selector-item')).forEach(item => {
            const val = (item.getAttribute('data-value') || '').toLowerCase();
            const isActive = val === cur;
            if (isActive) item.classList.add('active'); else item.classList.remove('active');
            item.setAttribute('aria-pressed', String(isActive));
        });
    }

    _toggleCsPanel(force) {
        const panel = this._cs.panelEl;
        const backdrop = this._cs.backdropEl;
        if (!panel || !backdrop) return;
        let show = force;
        if (typeof show !== 'boolean') {
            const isOpen = panel.classList.contains('is-open') || panel.getAttribute('aria-hidden') === 'false';
            show = !isOpen;
        }
        if (show) {
            panel.classList.add('is-open');
            backdrop.classList.add('is-open');
            panel.setAttribute('aria-hidden', 'false');
            if (this._cs.toggleEl) this._cs.toggleEl.setAttribute('aria-expanded', 'true');
            // Focus the close button inside the dialog
            const closeBtn = panel.querySelector('.cs-flag-panel__close');
            if (closeBtn) requestAnimationFrame(() => closeBtn.focus());
            // Attach focus trap and Escape handler
            this._attachCsPanelKeyHandler();
        } else {
            panel.classList.remove('is-open');
            backdrop.classList.remove('is-open');
            panel.setAttribute('aria-hidden', 'true');
            if (this._cs.toggleEl) this._cs.toggleEl.setAttribute('aria-expanded', 'false');
            this._detachCsPanelKeyHandler();
            // Return focus to the toggle button
            if (this._cs.toggleEl && typeof this._cs.toggleEl.focus === 'function') {
                this._cs.toggleEl.focus();
            }
        }
        // Keep icon in sync when opening
        if (show && this._cs.toggleEl) {
            const img = this._cs.toggleEl.querySelector('img');
            if (img) img.src = this._getFlagPath(this.currentSelection?.locale);
            this._applyProficiencyClass(this._cs.toggleEl, this.currentSelection?.proficiency);
            this._applyProficiencyClass(img, this.currentSelection?.proficiency);
        }
    }

    _attachCsPanelKeyHandler() {
        if (this._csPanelKeyHandler) return;
        this._csPanelKeyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this._toggleCsPanel(false);
                return;
            }
            if (e.key === 'Tab') {
                this._trapFocusInCsPanel(e);
            }
        };
        document.addEventListener('keydown', this._csPanelKeyHandler, true);
    }

    _detachCsPanelKeyHandler() {
        if (this._csPanelKeyHandler) {
            document.removeEventListener('keydown', this._csPanelKeyHandler, true);
            this._csPanelKeyHandler = null;
        }
    }

    _trapFocusInCsPanel(e) {
        const panel = this._cs.panelEl;
        if (!panel) return;
        const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    // ================== i18n Attribute Updater ==================

    _getI18nMap() {
        const globals = this.getGlobalConfig();
        return globals?._i18nMap || {};
    }

    _updateI18nAttributes() {
        const sel = this.currentSelection;
        if (!sel) return;
        const localeProfKey = `${sel.locale}-${sel.proficiency}`;
        const i18nMap = this._getI18nMap();

        // Update aria-label attributes
        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            const map = i18nMap[key];
            if (map && map[localeProfKey]) {
                el.setAttribute('aria-label', map[localeProfKey]);
            }
        });

        // Update title attributes
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const map = i18nMap[key];
            if (map && map[localeProfKey]) {
                el.setAttribute('title', map[localeProfKey]);
            }
        });

        // Update alt attributes (prepared for future image alt-text support)
        document.querySelectorAll('[data-i18n-alt]').forEach(el => {
            const key = el.getAttribute('data-i18n-alt');
            const map = i18nMap[key];
            if (map && map[localeProfKey]) {
                el.setAttribute('alt', map[localeProfKey]);
            }
        });

        // Update textContent for elements with data-i18n-text
        document.querySelectorAll('[data-i18n-text]').forEach(el => {
            const key = el.getAttribute('data-i18n-text');
            const map = i18nMap[key];
            if (map && map[localeProfKey]) {
                el.textContent = map[localeProfKey];
            }
        });
    }

    _selectContent(locale, proficiency, chapterId = null) {
        if (!locale || !proficiency) return;
        const loc = String(locale).toLowerCase();
        const prof = String(proficiency).toLowerCase();
        this.currentSelection = {locale: loc, proficiency: prof};
        this._storeSelection(this.currentSelection);
        this._applyCsVisibilityCSS();
        Adapt.set('_contentSelectorSelection', {...this.currentSelection});
        // Update toggle icon
        if (this._cs.toggleEl) {
            const img = this._cs.toggleEl.querySelector('img');
            if (img) img.src = this._getFlagPath(loc);
            this._applyProficiencyClass(this._cs.toggleEl, prof);
            this._applyProficiencyClass(img, prof);
        }
        // Notify others
        Adapt.trigger('contentSelector:selectionChanged', {locale: loc, proficiency: prof});
        Adapt.trigger('contentSelector:changed');
        // Scroll focus to first matching span
        const selector = `.localized-content.locale-${loc}.proficiency-${prof}`;
        const matchingSpans = document.querySelectorAll(selector);
        if (!chapterId && matchingSpans && matchingSpans.length > 0) {
            const targetContainer = matchingSpans[0].closest('.component') || matchingSpans[0].closest('[data-adapt-id]') || matchingSpans[0];
            try {
                targetContainer.scrollIntoView({behavior: 'smooth', block: 'start'});
            } catch (e) { /* noop */
            }
        } else if (chapterId) {
            const targetSpan = document.querySelector(`[id^="block-${chapterId}-"] .localized-content.locale-${loc}.proficiency-${prof}`);
            const targetElement = targetSpan ? (targetSpan.closest('.component') || targetSpan.closest('[data-adapt-id]')) : null;
            if (targetElement) try {
                targetElement.scrollIntoView({behavior: 'smooth', block: 'start'});
            } catch (e) { /* noop */
            }
        }
    }

    _applyCsVisibilityCSS() {
        // Ensure <style> exists
        if (!this._cs.styleEl || !document.contains(this._cs.styleEl)) {
            const style = document.createElement('style');
            style.id = 'content-selector-inline-style';
            document.head.appendChild(style);
            this._cs.styleEl = style;
        }
        const loc = (this.currentSelection?.locale || 'de').toLowerCase();
        const prof = (this.currentSelection?.proficiency || 'original').toLowerCase();
        const css = `\n/* Content Selector dynamic rules (auto-generated) */\n.localized-content { display: none !important; aria-hidden: true; }\n.localized-block { display: none !important; aria-hidden: true; }\n.localized-content.locale-${loc}.proficiency-${prof} { display: inline !important; aria-hidden: false; }\n.localized-block.locale-${loc}.proficiency-${prof} { display: block !important; aria-hidden: false; }\n`;
        this._cs.styleEl.textContent = css;
    }

    _readStoredSelection() {
        // New key
        try {
            const s = window.localStorage.getItem('contentSelector');
            if (s) {
                const o = JSON.parse(s);
                if (o && o.locale && o.proficiency) return {
                    locale: String(o.locale).toLowerCase(),
                    proficiency: String(o.proficiency).toLowerCase()
                };
            }
        } catch (e) { /* noop */
        }
        // Legacy key used in some builds
        try {
            const raw = window.localStorage.getItem('adapt-content-selector');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const loc = parsed?.locale ? String(parsed.locale).toLowerCase() : null;
            const prof = parsed?.proficiency ? String(parsed.proficiency).toLowerCase() : null;
            if (loc && prof) return {locale: loc, proficiency: prof};
        } catch (e) { /* noop */
        }
        return null;
    }

    _storeSelection(sel) {
        try {
            window.localStorage.setItem('contentSelector', JSON.stringify(sel));
        } catch (e) { /* noop */
        }
    }

    _getFlagPath(locale) {
        const l = (locale || '').toLowerCase();
        return `assets/flags/${l}.webp`;
    }

    _getFlagPathFromValue(val) {
        try {
            const [lang] = (val || '').split('-');
            return `assets/flags/${String(lang).toLowerCase()}.webp`;
        } catch (_e) {
            return '';
        }
    }

    _normalizeProficiency(proficiency) {
        const prof = String(proficiency || 'original').toLowerCase();
        return ['original', 'b1', 'a2', 'a1'].includes(prof) ? prof : 'original';
    }

    _applyProficiencyClass(el, proficiency) {
        if (!el?.classList) return;
        const prof = this._normalizeProficiency(proficiency);
        const allClasses = [
            'cs-flag-proficiency-original',
            'cs-flag-proficiency-b1',
            'cs-flag-proficiency-a2',
            'cs-flag-proficiency-a1'
        ];
        allClasses.forEach(cls => el.classList.remove(cls));
        el.classList.add(`cs-flag-proficiency-${prof}`);
    }

    // Dialog support moved here (uses template markup injected into footer)
    _setupDialogHandlers() {
        const dlg = document.getElementById('cs-dialog');
        if (!dlg) return;
        dlg.addEventListener('click', (e) => {
            const t = e.target;
            if (t && t.hasAttribute && t.hasAttribute('data-cs-dialog-close')) this._closeCsDialog();
        });
        const btn = dlg.querySelector('.cs-dialog__close');
        if (btn) btn.addEventListener('click', () => this._closeCsDialog());
        if (!this._onDlgEsc) {
            this._onDlgEsc = (e) => {
                if (e.key === 'Escape') this._closeCsDialog();
            };
            document.addEventListener('keydown', this._onDlgEsc);
        }
        // Focus trap inside the dialog (Tab / Shift+Tab cycle within dialog)
        if (!this._onDlgKeydown) {
            this._onDlgKeydown = (e) => {
                if (e.key !== 'Tab') return;
                const dialog = document.getElementById('cs-dialog');
                if (!dialog || dialog.getAttribute('aria-hidden') === 'true') return;
                const focusables = dialog.querySelectorAll(
                    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (!focusables.length) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            };
            document.addEventListener('keydown', this._onDlgKeydown);
        }
    }

    _showCsDialog(html) {
        this._setupDialogHandlers();
        const dlg = document.getElementById('cs-dialog');
        const content = document.getElementById('cs-dialog-content');
        if (!dlg || !content) return;
        // Remember which element had focus so we can restore it on close
        this._csDialogPreviousFocus = document.activeElement;
        content.innerHTML = html || '';

        // Provide an accessible name for the dialog by referencing the first heading
        // inside the injected content (WAI-ARIA APG "Dialog (Modal)" pattern).
        const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) {
            dlg.setAttribute('aria-labelledby', heading.id);
        } else {
            dlg.removeAttribute('aria-labelledby');
            dlg.setAttribute('aria-label', 'Dialog');
        }

        dlg.setAttribute('aria-hidden', 'false');
        dlg.setAttribute('aria-modal', 'true');

        // Defer focus until after the dialog is actually in the a11y tree / rendered.
        // Focus a meaningful interactive child (the close button) rather than the
        // dialog container itself — this is what screen readers reliably announce.
        window.requestAnimationFrame(() => {
            const focusTarget = heading || dlg;
            focusTarget.setAttribute('tabindex', '-1');
            focusTarget.focus();
        });
    }

    _closeCsDialog() {
        const dlg = document.getElementById('cs-dialog');
        if (!dlg) return;
        dlg.setAttribute('aria-hidden', 'true');

        // Restore focus: prefer the block-navigation "next" button, then fall back
        // to whatever was focused before the dialog opened.
        window.requestAnimationFrame(() => {
            const nextBtn = document.querySelector('.js-block-nav-next');
            if (nextBtn && typeof nextBtn.focus === 'function') {
                nextBtn.focus();
                return;
            }
            const prev = this._csDialogPreviousFocus;
            if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) {
                prev.focus();
            }
            this._csDialogPreviousFocus = null;
        });
    }

    // Expose simple global helpers for backwards compatibility
    _exposeCsGlobals() {
        window.suggestEasierContent = (chapterId) => {
            const cur = this.currentSelection?.proficiency || 'original';
            if (String(cur).toLowerCase() === 'original') this._selectContent(this.currentSelection?.locale || 'de', 'b1', chapterId);
        };
        window.selectContentPreference = (locale, proficiency, chapterId = null) => {
            this._selectContent(locale, proficiency, chapterId);
        };
    }

    // Resolve forward/backward permission based on current block settings
    canNavigateForward() {
        const block = this.currentBlock();
        if (!block) return true;
        const setting = block.get('_blockNavigation')?._canNavigateForward;
        if (setting === false) return false;
        if (setting === true || setting === undefined) return true;
        if (setting === 'completion') return !!block.get('_isComplete');
        return true;
    }

    canNavigateBack() {
        const block = this.currentBlock();
        if (!block) return true;
        const setting = block.get('_blockNavigation')?._canNavigateBack;
        if (setting === false) return false;
        if (setting === true || setting === undefined) return true;
        if (setting === 'completion') return !!block.get('_isComplete');
        return true;
    }

    currentBlock() {
        return this.navBlocks[this.currentIndex];
    }

    showBlock(index) {
        if (!this.navBlocks.length) return;
        if (index < 0 || index >= this.navBlocks.length) return;
        const oldIndex = this.currentIndex;
        const oldBlock = this.navBlocks[oldIndex];
        const newBlock = this.navBlocks[index];
        const articleChanged = oldBlock && newBlock && oldBlock.get('_parentId') !== newBlock.get('_parentId');
        this.currentIndex = index;
        console.log('[blockNavigation] showBlock', {
            oldIndex,
            newIndex: index,
            total: this.navBlocks.length,
            articleChanged
        });

        // Do ALL DOM mutations first, so the currently-focused Next/Prev button
        // is not destroyed while it still has focus. Then defer focus movement
        // to the next animation frame so layout has been committed and the new
        // target is actually focusable.

        // 1. Show the new block
        this._setBlockHidden(newBlock, false);

        // 2. Hide all other blocks
        this.navBlocks.forEach((b, i) => {
            if (i !== index) this._setBlockHidden(b, true);
        });

        // 3. Update headings so focus targets are ready
        this._updateArticleHeadings();

        // 4. Update the footer (non-destructive: preserves focus on Next button)
        this.createOrUpdateFooter();

        // 5. After layout is committed, move focus to the new block / navigation title
        requestAnimationFrame(() => {
            this.announceCurrent(articleChanged);
        });

        Adapt.trigger('blockNavigation:changed', {oldIndex, newIndex: index});
        this.checkAllCompleted();

        // Auto-play TTS when enabled
        if (this.ttsEnabled) this._playTTSForCurrentBlock();
    }

    announceCurrent(articleChanged = false) {
        // Note: we intentionally do NOT call Adapt.a11y.announce() here.
        // Moving focus is the industry-standard pattern (WAI-ARIA APG) for
        // navigation actions, and most screen readers drop pending polite
        // aria-live announcements when focus moves — causing double / garbled
        // announcements. We rely on focus management alone.

        // When crossing article (chapter) boundaries, focus the article/chapter title
        if (articleChanged) {
            const focusElement = $(`.block-navigation__title`);
            a11y.focusFirst(focusElement);
            return;
        }

        // Same chapter: focus the block's heading element (semantic, has an
        // accessible name). Falling back to the component wrapper or block itself.
        // The component wrapper typically has role="presentation" and no accessible
        // name, which causes SR to read ancestor/document context instead.
        const $blockEl = this._getBlock$(this.currentBlock());
        if (!$blockEl || !$blockEl.length) return;

        let targetEl = null;
        const $heading = $blockEl.find('[role="heading"]').first();
        if ($heading && $heading.length) {
            targetEl = $heading.get(0);
        } else {
            const $component = $blockEl.find('.component').first();
            targetEl = ($component && $component.length) ? $component.get(0) : $blockEl.get(0);
        }

        if (!targetEl) return;
        if (!targetEl.getAttribute('tabindex')) {
            targetEl.setAttribute('tabindex', '-1');
        }
        targetEl.focus();
        try {
            targetEl.scrollIntoView({behavior: 'smooth', block: 'start'});
        } catch (e) { /* noop */
        }
    }

    navigateNext() {
        console.log('[blockNavigation] navigateNext called', {index: this.currentIndex, total: this.navBlocks.length});
        if (this.currentIndex >= this.navBlocks.length - 1) return;
        if (!this.canNavigateForward()) {
            this.showBlockedMessage();
            Adapt.trigger('blockNavigation:blocked', {direction: 'next', index: this.currentIndex});
            return;
        }
        this.showBlock(this.currentIndex + 1);
    }

    navigatePrevious() {
        console.log('[blockNavigation] navigatePrevious called', {
            index: this.currentIndex,
            total: this.navBlocks.length
        });
        if (this.currentIndex <= 0) return;
        if (!this.canNavigateBack()) {
            this.showBlockedMessage();
            Adapt.trigger('blockNavigation:blocked', {direction: 'prev', index: this.currentIndex});
            return;
        }
        this.showBlock(this.currentIndex - 1);
    }

    showBlockedMessage() {
        // Simple a11y announcement; real implementations may use notify
        const msg = 'Navigation is blocked until you complete this block.';
        if (Adapt.a11y?.announce) Adapt.a11y.announce(msg);
    }

    onComponentComplete(component) {
        // When any component completes, check its ancestor block
        const block = component?.findAncestor?.('block');
        if (!block) return;
        this.checkBlockCompletion(block);
    }

    checkBlockCompletion(block) {
        if (!block?.findDescendantModels) return;
        const components = block.findDescendantModels('component') || [];
        const required = components.filter(c => !c.get('_isOptional'));
        const allComplete = required.every(c => c.get('_isComplete'));
        if (allComplete) {
            block.set('_isComplete', true);
            this.createOrUpdateFooter();
        }
    }

    checkAllCompleted() {
        const allBlocksComplete = this.navBlocks.length > 0 && this.navBlocks.every(b => !!b.get('_isComplete'));
        if (allBlocksComplete) Adapt.trigger('blockNavigation:completed');
    }

    // Determine whether extension is enabled for this article or on blocks
    getSettingFromModel(articleModel, key) {
        const articleCfg = articleModel.get('_blockNavigation') || {};
        const onChildren = !!articleCfg._onChildren;
        if (key === '_isEnabled') {
            // if explicitly disabled on article
            if (articleCfg._isEnabled === false) return false;
            // otherwise defer to global enablement
            const globalEnabled = this.getGlobalConfig()._isEnabled !== false;
            return globalEnabled || articleCfg._isEnabled === true || onChildren;
        }
        return articleCfg[key];
    }

    // DOM helpers
    _getBlock$(block) {
        if (!block) return null;
        if (block.view?.$el) return block.view.$el;
        if (block.$el) return block.$el;
        try {
            const id = block.get('_id');
            let $el = $(`[data-adapt-id="${id}"]`);
            if (!$el || !$el.length) $el = $(`.block[data-adapt-id="${id}"]`);
            if (!$el || !$el.length) $el = $(`#${id}`);
            return $el && $el.length ? $el : null;
        } catch (_e) {
            return null;
        }
    }

    getConfig() {
        // Access the extension's config from course.json
        return Adapt.course.get('_blockNavigation') || {};
    }

    _setBlockHidden(block, hidden) {
        const $el = this._getBlock$(block);
        if ($el && $el.length) {
            $el.toggleClass('block-navigation-hidden', hidden);
            console.log('[blockNavigation] setBlockHidden', {id: block?.get ? block.get('_id') : undefined, hidden});
            return true;
        }
        // If element not yet in DOM, queue for when the view becomes ready
        if (!this._pendingHideIds) this._pendingHideIds = new Set();
        const id = block?.get('_id');
        if (id) {
            if (hidden) this._pendingHideIds.add(id);
            else this._pendingHideIds.delete(id);
        }
        return false;
    }

    _deferInitialHideUntilBlocksRender() {
        if (!this._pendingHideIds || this._pendingHideIds.size === 0) return;
        // Listen until all pending ids are hidden once
        const handler = (view) => {
            const model = view?.model;
            const id = model?.get && model.get('_id');
            if (!id) return;
            if (!this._pendingHideIds.has(id)) return;
            // Decide visibility from currentIndex (we keep only first visible)
            const idx = this._blockIndexById?.[id];
            const shouldHide = typeof idx === 'number' ? idx !== this.currentIndex : true;
            this._setBlockHidden(model, shouldHide);
            this._pendingHideIds.delete(id);
            if (this._pendingHideIds.size === 0) {
                Adapt.off('blockView:ready', handler);
                // After initial hide completes, refresh headings
                this._updateArticleHeadings();
            }
        };
        Adapt.on('blockView:ready', handler);
    }

    // Footer
    createOrUpdateFooter() {
        const blockNavigation = this.getGlobalConfig()?._extensions?._blockNavigation;
        const total = this.navBlocks.length;
        if (!total) return;
        const current = this.currentIndex + 1;
        const disablePrev = this.currentIndex === 0 || !this.canNavigateBack();
        const disableNext = this.currentIndex !== total - 1 && !this.canNavigateForward();
        const title = this.navBlocks[this.currentIndex].get('_parent')?.get('title', "")

        const model = new Backbone.Model({
            _globals: {_extensions: {_blockNavigation: blockNavigation}},
            current,
            total,
            disablePrev,
            disableNext,
            title,
            ttsEnabled: !!this.ttsEnabled,
            isLoadingAudio: !!this._isLoadingAudio
        });

        if (!this.footerView) {
            this.footerView = new BlockNavigationView({model});
            // Wire footer events to controller actions
            this.listenTo(this.footerView, 'nav:next', () => this.navigateNext());
            this.listenTo(this.footerView, 'nav:prev', () => this.navigatePrevious());
            this.listenTo(this.footerView, 'tts:toggle', (enabled) => this._onTTSToggled(enabled));
        } else {
            this.footerView.model.set(model.toJSON());
            this.footerView.updateState?.();
        }
        console.log('[blockNavigation] footer state', model.toJSON());
    }

    // Listen for clicks on narrative prev/next controls to auto-play correct TTS entry
    _attachNarrativeControlListeners() {
        // Support multiple selector variants used by different themes/templates
        const selectors = [
            '.narrative__controls-left .btn-icon',
            '.narrative__controls-right .btn-icon',
            '.btn-icon.narrative__controls-left',
            '.btn-icon.narrative__controls-right'
        ].join(', ');
        $(document).on('click.blockNavNarrCtl', selectors, this._onNarrativeControlClick);
        console.log('[blockNavigation] attached narrative control listeners');
    }

    _detachNarrativeControlListeners() {
        $(document).off('click.blockNavNarrCtl');
        if (this._ttsRequeueTimer) {
            clearTimeout(this._ttsRequeueTimer);
            this._ttsRequeueTimer = null;
        }
        console.log('[blockNavigation] detached narrative control listeners');
    }

    _onNarrativeControlClick(_e) {
        if (!this.ttsEnabled) return;
        // Defer playback slightly so the narrative component updates its active index
        if (this._ttsRequeueTimer) clearTimeout(this._ttsRequeueTimer);
        this._ttsRequeueTimer = setTimeout(() => {
            this._ttsRequeueTimer = null;
            try {
                console.log('[blockNavigation] narrative control clicked -> play TTS for active page');
                this._playTTSForCurrentBlock();
            } catch (err) {
                console.warn('[blockNavigation] failed to play TTS after narrative control click', err);
            }
        }, 150);
    }

    _onArrowKeydown(event) {
        if (!event) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName))) return;

        const openNotifyPopup = document.querySelector('.notify__popup[open]');
        if (openNotifyPopup) {
            if (openNotifyPopup.classList.contains('hotgraphic')) {
                if (event.key === 'ArrowRight') {
                    const nextHotgraphicBtn = openNotifyPopup.querySelector('.hotgraphic-popup__controls.next');
                    if (nextHotgraphicBtn && !nextHotgraphicBtn.classList.contains('is-disabled')) nextHotgraphicBtn.click();
                    return;
                }

                if (event.key === 'ArrowLeft') {
                    const backHotgraphicBtn = openNotifyPopup.querySelector('.hotgraphic-popup__controls.back');
                    if (backHotgraphicBtn && !backHotgraphicBtn.classList.contains('is-disabled')) backHotgraphicBtn.click();
                    return;
                }
            }
            return;
        }

        if (event.key === 'ArrowRight') {
            const nextButton = document.querySelector('.js-block-nav-next');
            if (nextButton && !nextButton.disabled) nextButton.click();
            return;
        }

        if (event.key === 'ArrowLeft') {
            const backButton = document.querySelector('.js-block-nav-prev, .js-block-nav-back');
            if (backButton && !backButton.disabled) backButton.click();
        }
    }

    // TTS: state persistence
    _loadTTSEnabled() {
        try {
            const v = window.localStorage.getItem('blockNavigation.ttsEnabled');
            return v === 'true';
        } catch (_e) {
            return false;
        }
    }

    _saveTTSEnabled(value) {
        try {
            window.localStorage.setItem('blockNavigation.ttsEnabled', String(!!value));
        } catch (_e) { /* noop */
        }
    }

    _onTTSToggled(enabled) {
        this.ttsEnabled = !!enabled;
        this._saveTTSEnabled(this.ttsEnabled);
        console.log('[blockNavigation] TTS toggled', {enabled: this.ttsEnabled});
        if (this.footerView) {
            this.footerView.model.set('ttsEnabled', this.ttsEnabled);
            this.footerView.updateState?.();
        }
        if (this.ttsEnabled) this._playTTSForCurrentBlock();
        else this._stopAudio();
    }

    _ensureAudioEl() {
        // Try to find audio element inside footer
        if (this._audioEl && document.body.contains(this._audioEl)) return this._audioEl;
        const el = document.getElementById('bn-audio-el');
        if (el) {
            this._audioEl = el;
            this._bindAudioEventsOnce();
        }
        return this._audioEl;
    }

    _bindAudioEventsOnce() {
        if (!this._audioEl) return;
        if (this._audioEventsBound) return;
        this._audioEventsBound = true;
        const audio = this._audioEl;
        const setLoading = (flag, reason) => {
            // Avoid redundant renders
            if (this._isLoadingAudio === flag) return;
            this._isLoadingAudio = flag;
            if (this.footerView) {
                this.footerView.model.set('isLoadingAudio', !!flag);
                this.footerView.updateState?.();
            }
            console.log('[blockNavigation] audio loading state', {isLoading: flag, reason});
        };
        audio.addEventListener('loadstart', () => setLoading(true, 'loadstart'));
        audio.addEventListener('waiting', () => setLoading(true, 'waiting'));
        audio.addEventListener('stalled', () => setLoading(true, 'stalled'));
        audio.addEventListener('canplay', () => setLoading(false, 'canplay'));
        audio.addEventListener('loadeddata', () => setLoading(false, 'loadeddata'));
        audio.addEventListener('playing', () => setLoading(false, 'playing'));
        audio.addEventListener('ended', () => setLoading(false, 'ended'));
        audio.addEventListener('error', () => setLoading(false, 'error'));
    }

    _stopAudio() {
        const audio = this._ensureAudioEl();
        if (!audio) return;
        try {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            // Clear loading indicator when audio is explicitly stopped
            if (this._isLoadingAudio) {
                this._isLoadingAudio = false;
                if (this.footerView) {
                    this.footerView.model.set('isLoadingAudio', false);
                    this.footerView.updateState?.();
                }
            }
        } catch (_e) { /* noop */
        }
    }

    _playTTSForCurrentBlock(index) {
        const audio = this._ensureAudioEl();
        if (!audio) {
            console.warn('[blockNavigation] audio element not found');
            return;
        }
        const speechId = this._findSpeechIdForCurrentBlock();
        if (!speechId) {
            console.log('[blockNavigation] no _speechToTextId found for current block');
            this._stopAudio();
            return;
        }

        const locale = this.currentSelection?.locale.toUpperCase() || 'DE';
        const proficiency = this.currentSelection?.proficiency.toUpperCase() || 'ORIGINAL';
        const globals = this.getGlobalConfig();
        const baseUrl = globals._dashboardBaseUrl || Adapt.config.dashboardBaseUrl;
        if (!baseUrl) return;
        const indexQuery = (index !== undefined && index !== null) ? `&index=${encodeURIComponent(index)}` : '';

        const url = `${baseUrl}/public/v1/audio/text-to-speech/${encodeURIComponent(speechId)}?proficiency=${proficiency}&locale=${locale}${indexQuery}`;
        try {
            // Mark as loading before we start fetching the new source
            if (!this._isLoadingAudio) {
                this._isLoadingAudio = true;
                if (this.footerView) {
                    this.footerView.model.set('isLoadingAudio', true);
                    // this.footerView.updateState?.();
                }
            }
            // Reset and set new source
            audio.src = url;
            audio.load();
            const playPromise = audio.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise.catch(e => console.warn('[blockNavigation] audio play blocked or failed', e));
            }
        } catch (e) {
            console.warn('[blockNavigation] failed to play audio', e);
            // On error, clear loading state
            if (this._isLoadingAudio) {
                this._isLoadingAudio = false;
                if (this.footerView) {
                    this.footerView.model.set('isLoadingAudio', false);
                    this.footerView.updateState?.();
                }
            }
        }
    }

    _findSpeechIdForCurrentBlock() {
        const block = this.currentBlock();
        if (!block?.findDescendantModels) return null;
        const components = block.findDescendantModels('component') || [];
        for (const comp of components) {
            if (!comp?.attributes?._isVisible) {
                continue;
            }
            const stt = comp.get && comp.get('_speechToTextId');
            if (!stt) continue;
            const isNarrative = comp.get('_component') === 'narrative';
            if (Array.isArray(stt)) {
                let idx = 0;
                if (isNarrative) idx = this._getNarrativeActiveIndex(comp);
                if (idx < 0 || idx >= stt.length) idx = 0;
                const val = stt[idx];
                if (val) return val;
                continue;
            }
            return stt; // scalar id
        }
        return null;
    }

    _getNarrativeActiveIndex(component) {
        const componentId = component.attributes._id
        if (!componentId) return 0;
        const narrativeModel = data.findById(componentId);
        let activeItemIndex = narrativeModel?.get('_activeItemIndex');
        if (activeItemIndex !== undefined) return activeItemIndex;

        try {
            const $el = this._getBlock$(component) || component.view?.$el;
            if ($el && $el.length) {
                const $dots = $el.find('.narrative__progress .btn.is-selected, .narrative__progress .is-selected');
                if ($dots && $dots.length) return $dots.last().index();
            }
        } catch (_e3) {
        }
        return 0;
    }

    // Heading visibility control: hide headings of non-active articles
    _updateArticleHeadings() {
        try {
            const $allArticles = $('.article');
            if (!$allArticles.length) return;
            const $currentBlock = this._getBlock$(this.currentBlock());
            const $activeArticle = $currentBlock ? $currentBlock.closest('.article') : null;
            $allArticles.each((i, el) => {
                const $article = $(el);
                const isActive = $activeArticle && $article.is($activeArticle);
                //const $heading = $article.find('.js-heading-inner').first();
                const $heading = $article.find('.article__inner').first();
                if ($heading.length) {
                    $heading.toggleClass('block-navigation-hidden', !isActive);
                }
            });
            console.log('[blockNavigation] updated article headings');
        } catch (e) {
            console.warn('[blockNavigation] failed to update article headings', e);
        }
    }

    _showAllArticleHeadings() {
        const $allArticles = $('.article .js-heading-inner');
        $allArticles.removeClass('block-navigation-hidden');
    }

    // ================== Explanations Feature ==================
    _getCurrentLocaleKey() {
        // Prefer selection from content selector integration
        const locale = this.currentSelection?.locale || this._readContentSelectorLocale() || 'de';
        return (locale || 'de').toUpperCase();
    }

    _readContentSelectorLocale() {
        // Fallback: read from localStorage used by contentSelector component
        try {
            const raw = window.localStorage.getItem('adapt-content-selector');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed?.locale?.toLowerCase() || null;
        } catch (_e) {
            return null;
        }
    }

    _getExplanations() {
        // Structure expected: _globals._extensions._blockNavigation._explanations = { LOCALE: [ {term, explanation}, ... ] }
        const globals = this.getGlobalConfig();
        const byLocale = globals?._extensions?._blockNavigation?._explanations || {};
        const localeKey = this._getCurrentLocaleKey();
        const list = byLocale?.[localeKey] || [];
        // Normalize and filter
        return list
            .filter(it => it && typeof it.term === 'string' && it.term.trim().length)
            .map(it => ({term: it.term.trim(), explanation: String(it.explanation ?? '').trim()}));
    }

    _applyExplanationsToPage() {
        // Clear previous overlays and unwrap any existing links
        this._teardownExplanations();
        const explanations = this._getExplanations();
        if (!explanations?.length) return;

        // Apply to all rendered component content in the current article
        const $scope = $('#wrapper');
        if (!$scope.length) return;
        const selectors = [
            '.component__body',
            '.component__instruction',
            '.component__title'
        ].join(',');
        $scope.find(selectors).each((i, el) => this._annotateElement(el, explanations));

        // Bind delegated click and keydown handlers once
        $(document).off('click.bnExpl').on('click.bnExpl', '.bn-expl-link', this._onExplClick);
        $(document).off('keydown.bnExpl').on('keydown.bnExpl', this._onDocKeydown);
    }

    _teardownExplanations() {
        // Remove overlays
        $('.bn-expl-overlay').remove();
        // Unwrap links by replacing each link with its text node content
        $('.bn-expl-link').each((i, el) => {
            const $el = $(el);
            $el.replaceWith(document.createTextNode($el.text()));
        });
        $(document).off('click.bnExpl');
        $(document).off('keydown.bnExpl');
    }

    _annotateElement(rootEl, explanations) {
        if (!rootEl) return;
        const SKIP = new Set(['A', 'BUTTON', 'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);

        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (!p || SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
                if (p.closest && p.closest('.bn-expl-link, .bn-expl-overlay')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const patterns = explanations.map(({term, explanation}) => ({
            term,
            explanation,
            // case-insensitive, word boundary around term if it looks like a word, otherwise literal
            regex: this._buildTermRegex(term)
        }));

        const toProcess = [];
        let node;
        while ((node = walker.nextNode())) toProcess.push(node);

        toProcess.forEach(textNode => {
            let text = textNode.nodeValue;
            let hasMatch = false;
            const fragments = [{type: 'text', text}];
            // Apply each pattern in sequence, splitting fragments
            patterns.forEach(pat => {
                const next = [];
                fragments.forEach(frag => {
                    if (frag.type !== 'text') {
                        next.push(frag);
                        return;
                    }
                    let lastIndex = 0;
                    text = frag.text;
                    pat.regex.lastIndex = 0;
                    let m;
                    while ((m = pat.regex.exec(text))) {
                        hasMatch = true;
                        const start = m.index;
                        const end = start + m[0].length;
                        if (start > lastIndex) next.push({type: 'text', text: text.slice(lastIndex, start)});
                        next.push({
                            type: 'link',
                            text: text.slice(start, end),
                            term: pat.term,
                            explanation: pat.explanation
                        });
                        lastIndex = end;
                        // Prevent infinite loops on zero-length matches
                        if (pat.regex.lastIndex === m.index) pat.regex.lastIndex++;
                    }
                    if (lastIndex < text.length) next.push({type: 'text', text: text.slice(lastIndex)});
                });
                fragments.splice(0, fragments.length, ...next);
            });

            if (!hasMatch) return;

            const span = document.createElement('span');
            fragments.forEach(f => {
                if (f.type === 'text') span.appendChild(document.createTextNode(f.text));
                else {
                    const a = document.createElement('a');
                    a.href = 'javascript:void(0)';
                    a.className = 'bn-expl-link';
                    a.setAttribute('data-expl-term', f.term);
                    a.setAttribute('data-expl-text', f.explanation);
                    a.setAttribute('aria-haspopup', 'dialog');
                    a.setAttribute('role', 'button');
                    a.textContent = f.text;
                    span.appendChild(a);
                }
            });
            textNode.parentNode.replaceChild(span, textNode);
        });
    }

    _buildTermRegex(term) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isWord = /[\p{L}\p{N}_]/u.test(term);
        const pattern = isWord ? `\\b${escaped}\\b` : escaped;
        return new RegExp(pattern, 'giu');
    }

    _onExplClick(e) {
        e.preventDefault();
        const el = e.currentTarget;
        const $existing = $('.bn-expl-overlay');
        const term = el.getAttribute('data-expl-term') || '';
        const text = el.getAttribute('data-expl-text') || '';
        if (!text) return;
        // Remove existing overlay
        $existing.remove();
        const overlay = document.createElement('div');
        overlay.className = 'bn-expl-overlay';
        overlay.setAttribute('role', 'dialog');
        const i18nMap = this._getI18nMap();
        const lpKey = `${this.currentSelection?.locale || 'de'}-${this.currentSelection?.proficiency || 'original'}`;
        const explLabel = i18nMap['explanation.overlay.aria']?.[lpKey] || 'Explanation';
        const closeLabel = i18nMap['explanation.close.aria']?.[lpKey] || 'Close';
        overlay.setAttribute('aria-label', term || explLabel);
        overlay.innerHTML = `
            <div class="bn-expl-overlay__inner">
              <div class="bn-expl-overlay__header">
                <span class="bn-expl-overlay__title">${this._escapeHtml(term)}</span>
                <button class="bn-expl-overlay__close" aria-label="${this._escapeHtml(closeLabel)}" data-i18n-aria="explanation.close.aria">×</button>
              </div>
              <div class="bn-expl-overlay__body">${this._escapeHtml(text)}</div>
            </div>`;
        document.body.appendChild(overlay);

        // Position near clicked element
        const rect = el.getBoundingClientRect();
        const orect = overlay.getBoundingClientRect();
        let top = window.scrollY + rect.bottom + 8;
        let left = window.scrollX + rect.left;
        // Prevent overflow
        const maxLeft = window.scrollX + document.documentElement.clientWidth - orect.width - 8;
        if (left > maxLeft) left = maxLeft;
        if (top + orect.height > window.scrollY + window.innerHeight) top = window.scrollY + rect.top - orect.height - 8;
        overlay.style.top = `${Math.max(window.scrollY + 8, top)}px`;
        overlay.style.left = `${Math.max(window.scrollX + 8, left)}px`;

        overlay.querySelector('.bn-expl-overlay__close')?.addEventListener('click', () => $(overlay).remove());
    }

    _onDocKeydown(e) {
        if (e.key === 'Escape') {
            $('.bn-expl-overlay').remove();
        }
    }

    _escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

Adapt.blockNavigation = new BlockNavigation();

export default Adapt.blockNavigation;
