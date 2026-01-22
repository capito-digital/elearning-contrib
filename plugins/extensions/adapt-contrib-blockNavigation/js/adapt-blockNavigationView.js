import Adapt from 'core/js/adapt';
import ComponentView from 'core/js/views/componentView';
import TopBarView from './TopBarView';
import ProgressBarView from './ProgressBarView';
// // monkey-patch Adapt.trigger to log all events
// const originalTrigger = Adapt.trigger;
// Adapt.trigger = function(eventName, ...args) {
//     // if (!eventName.indexOf('ender:')) {
//     console.log('[Adapt event]', eventName, ...args);
//     // }
//   return originalTrigger.call(this, eventName, ...args);
// };
export default class BlockNavigationView extends ComponentView {
    initialize() {
        this.className = 'block-navigation-controller';
        this.listenTo(Adapt, 'remove', this.remove);

        // Create sub-views (they share the same model)
        this.topBarView = null;
        this.progressBarView = null;
        // ChatView is now managed as a singleton by the controller (adapt-blockNavigation.js)
        // to persist across page navigations.

        // Ensure the audio panel exists BEFORE we render
        try {
            this.ensureAudioPanel();
        } catch (e) {
            console.warn('[blockNavigation:view] ensureAudioPanel (pre-render) failed', e);
        }

        // Initial state sync
        try {
            this.updateState();
        } catch (e) {
            console.warn('[blockNavigation:view] updateState after render failed', e);
        }
    }

    className() {
        return 'extension-block-navigation';
    }

    events() {
        // Parent view no longer needs to handle these - sub-views do
        return {};
    }

    render() {
        if (!document.getElementById('wrapper')) return this;

        this.renderTopBar();
        this.renderBottomBar();
        // Chat is rendered by controller; do not render here

        return this;
    }

    renderTopBar() {
        // Remove existing top bar view if present
        if (this.topBarView) {
            this.topBarView.remove();
        }

        // Remove existing DOM element
        const existing = document.getElementById('block-navigation-container');
        if (existing) {
            existing.remove();
        }

        // Create new TopBarView
        this.topBarView = new TopBarView({
            model: this.model,
            parentView: this,
            id: 'block-navigation-container'
        });

        // Listen to events bubbled from sub-view
        this.listenTo(this.progressBarView, 'nav:prev', this.onPrev);
        this.listenTo(this.progressBarView, 'nav:next', this.onNext);
        this.listenTo(this.topBarView, 'tts:toggle', this.onToggleTTS);

        // Render and prepend to wrapper
        this.topBarView.render();
        this.topBarView.$el.attr('id', 'block-navigation-container');
        this.topBarView.$el.prependTo('#wrapper');

        // Attach audio panel next to the TTS button
        try {
            this.attachAudioPanel();
        } catch (e) {
            console.warn('[blockNavigation:view] attachAudioPanel failed', e);
        }

        // Notify
        try {
            Adapt.trigger('blockNavigation:rendered', {el: this.topBarView.el});
        } catch (e) {
            // no-op
        }
    }

    // Chat is handled by controller

    renderBottomBar() {
        // Remove existing progress bar view if present
        if (this.progressBarView) {
            this.progressBarView.remove();
        }

        // Remove existing DOM element
        const existingProgress = document.getElementById('block-navigation-progress-container');
        if (existingProgress) {
            existingProgress.remove();
        }

        // Create new ProgressBarView
        this.progressBarView = new ProgressBarView({
            model: this.model,
            parentView: this,
            id: 'block-navigation-progress-container'
        });

        // Render and append to wrapper
        this.progressBarView.render();
        this.progressBarView.$el.attr('id', 'block-navigation-progress-container');
        this.progressBarView.$el.appendTo('#wrapper');

        // Notify
        try {
            Adapt.trigger('blockNavigation:rendered', {el: this.progressBarView.el});
        } catch (e) {
            // no-op
        }
    }

    // default remove

    computeProgressStrings(data) {
        const globals = data?._globals?._extensions?._blockNavigation || {};
        const textTpl = globals._progressIndicator?.text || 'Inhalt {current} von {total}';
        const ariaTpl = globals._progressIndicator?.ariaLabel || textTpl;
        const replace = (tpl) => String(tpl)
            .replace('{current}', data.current)
            .replace('{total}', data.total);
        return {progressText: replace(textTpl), progressAria: replace(ariaTpl)};
    }

    updateState() {
        this.render();

        const data = this.model.toJSON();

        // Update sub-views state
        if (this.topBarView) {
            this.topBarView.updateState();
        }

        // Manage the external audio panel visibility and state
        try {
            this.ensureAudioPanel();
            this.attachAudioPanel();
            const ttsEnabled = !!data.ttsEnabled;
            this.toggleAudioPanel(ttsEnabled);

            // Loading indicator inside panel
            const isLoading = !!data.isLoadingAudio;
            if (this._bnAudioLoadingEl) {
                this._bnAudioLoadingEl.style.display = isLoading ? '' : 'none';
            }
            if (this._bnAudioPanel) {
                this._bnAudioPanel.setAttribute('aria-busy', isLoading ? 'true' : 'false');
            }

            // Update audio source if model provides it
            const url = data.ttsAudioUrl || data.audioSrc || null;
            if (url) this.setAudioSrc(url);
        } catch (e) {
            // no-op
        }

        console.log('[blockNavigation:view] state updated', {
            current: data.current,
            total: data.total,
            disablePrev: data.disablePrev,
            disableNext: data.disableNext,
            ttsEnabled: data.ttsEnabled,
            isLoadingAudio: data.isLoadingAudio
        });
    }

    // Event handlers - called when sub-views trigger events
    onPrev() {
        if (this.model.get('disablePrev')) return;
        console.log('[blockNavigation:view] prev triggered');
        this.trigger('nav:prev');
    }

    onNext() {
        console.log('[blockNavigation:view] next triggered');
        if (this.model.get('disableNext')) return;
        console.log('[blockNavigation:view] next triggered');
        this.trigger('nav:next');
    }

    onToggleTTS(enabled) {
        console.log('[blockNavigation:view] tts toggle triggered', {enabled});
        this.updateState();
        this.trigger('tts:toggle', enabled);
    }

    // ----- Audio panel management -----
    ensureAudioPanel() {
        // Create panel structure once
        const panel = document.getElementById('bn-audio-panel') || document.createElement('div');
        panel.id = 'bn-audio-panel';
        panel.className = 'bn-audio-panel';
        panel.setAttribute('aria-hidden', 'true');

        // inner
        const inner = document.createElement('div');
        inner.className = 'bn-audio__inner';

        // controls
        const controls = document.createElement('div');
        controls.className = 'bn-audio__controls';

        // restart
        const btnRestart = document.createElement('button');
        btnRestart.className = 'bn-audio__btn js-audio-restart';
        btnRestart.type = 'button';
        btnRestart.title = 'Von Anfang an';
        btnRestart.setAttribute('aria-label', 'Wiedergabe neu starten');
        btnRestart.textContent = '⟲';
        btnRestart.addEventListener('click', () => {
            if (!this._audio) return;
            this._audio.currentTime = 0;
            this._audio.play().catch(() => {
            });
            this.updatePlayButtonState();
        });

        // play/pause
        const btnPlay = document.createElement('button');
        btnPlay.className = 'bn-audio__btn js-audio-play';
        btnPlay.type = 'button';
        btnPlay.title = 'Abspielen/Pause';
        btnPlay.setAttribute('aria-pressed', 'false');
        btnPlay.setAttribute('aria-label', 'Abspielen');
        btnPlay.textContent = '▶';
        btnPlay.addEventListener('click', () => {
            if (!this._audio) return;
            if (this._audio.paused) {
                this._audio.play().catch(() => {
                });
            } else {
                this._audio.pause();
            }
            this.updatePlayButtonState();
        });

        // loading
        const loading = document.createElement('div');
        loading.className = 'bn-audio__loading';
        loading.setAttribute('role', 'status');
        loading.setAttribute('aria-live', 'polite');
        loading.textContent = '⏳ Audio wird geladen…';
        loading.style.display = 'none';

        // hidden audio element
        let audioEl = document.getElementById('bn-audio-el');
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = 'bn-audio-el';
            audioEl.preload = 'none';
            audioEl.controls = false;
            audioEl.style.display = 'none';
        }

        controls.appendChild(btnRestart);
        controls.appendChild(btnPlay);

        inner.appendChild(controls);
        inner.appendChild(loading);
        inner.appendChild(audioEl);
        panel.innerHTML = '';
        panel.appendChild(inner);

        // store refs
        this._bnAudioPanel = panel;
        this._bnAudioLoadingEl = loading;
        this._bnAudioBtnPlay = btnPlay;

        // Use the audio element as our single source of truth
        if (this._audio !== audioEl) {
            // Detach old listeners if any
            if (this._audio) {
                try {
                    this._audio.removeEventListener('play', this._onAudioPlay);
                    this._audio.removeEventListener('pause', this._onAudioPause);
                    this._audio.removeEventListener('ended', this._onAudioEnded);
                } catch (e) { /* no-op */
                }
            }
            this._audio = audioEl;
            // Bind listeners
            this._onAudioPlay = () => this.updatePlayButtonState();
            this._onAudioPause = () => this.updatePlayButtonState();
            this._onAudioEnded = () => this.updatePlayButtonState();
            this._audio.addEventListener('play', this._onAudioPlay);
            this._audio.addEventListener('pause', this._onAudioPause);
            this._audio.addEventListener('ended', this._onAudioEnded);
        }
    }

    attachAudioPanel() {
        if (!this._bnAudioPanel) return;

        // Find the TTS wrapper in the top bar view
        const root = this.topBarView?.$el?.[0] || document.querySelector('.block-navigation');
        if (!root) return;

        const ttsWrap = root.querySelector('.block-navigation__tts');
        if (!ttsWrap) return;

        if (this._bnAudioPanel.parentElement !== ttsWrap) {
            ttsWrap.appendChild(this._bnAudioPanel);
        }
    }

    toggleAudioPanel(open) {
        if (!this._bnAudioPanel) return;
        const shouldOpen = !!open;
        this._bnAudioPanel.classList.toggle('is-open', shouldOpen);
        this._bnAudioPanel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');

        // Reflect open state on container for styling if needed
        try {
            const root = this.topBarView?.$el?.[0] || document.querySelector('.block-navigation');
            const ttsWrap = root?.querySelector('.block-navigation__tts');
            if (ttsWrap) ttsWrap.classList.toggle('is-open', shouldOpen);
        } catch (e) { /* no-op */
        }

        Adapt.trigger('blockNavigation:audioPanelToggled', {open: shouldOpen, el: this._bnAudioPanel});
    }

    setAudioSrc(url) {
        if (!this._audio) this.ensureAudioPanel();
        if (!this._audio) return;
        if (this._audio.src === url) return;
        this._audio.src = url;
        this._audio.load();
        Adapt.trigger('blockNavigation:audioReady', {url});
        this.updatePlayButtonState();
    }

    updatePlayButtonState() {
        if (!this._bnAudioBtnPlay || !this._audio) return;
        const playing = !this._audio.paused && !this._audio.ended;
        this._bnAudioBtnPlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
        this._bnAudioBtnPlay.textContent = playing ? '⏸' : '▶';
    }

    remove() {
        // Clean up sub-views
        if (this.topBarView) {
            this.stopListening(this.topBarView);
            this.topBarView.remove();
            this.topBarView = null;
        }
        if (this.progressBarView) {
            this.stopListening(this.progressBarView);
            this.progressBarView.remove();
            this.progressBarView = null;
        }

        // Clean up audio listeners
        if (this._audio) {
            try {
                this._audio.removeEventListener('play', this._onAudioPlay);
                this._audio.removeEventListener('pause', this._onAudioPause);
                this._audio.removeEventListener('ended', this._onAudioEnded);
            } catch (e) { /* no-op */
            }
        }

        // Call parent remove
        ComponentView.prototype.remove.call(this);
    }
}