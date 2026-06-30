import Backbone from 'backbone';
import Adapt from 'core/js/adapt';

export default class ChatView extends Backbone.View {
    initialize(options) {
        this.parentView = options?.parentView || null;
        this.courseId = null;
        this.isMinimized = true; // Start closed; the launcher button now lives in the navigation bar
        this._introShown = false;

        // bind context
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onClickOutside = this.onClickOutside.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        // Listen for locale/proficiency changes
        this.listenTo(Adapt, 'contentSelector:selectionChanged', this.onSelectionChanged);
        // External toggle requests (e.g. from the nav-bar chat button)
        this.listenTo(Adapt, 'bnChat:toggle', this.onExternalToggle);
        Adapt.on('app:dataReady', this.setCourseId)
        // Get initial values
        this.locale = this._getCurrentLocale();
        this.proficiency = this._getCurrentProficiency();
    }

    onSelectionChanged(payload) {
        this.locale = payload?.locale || this.locale;
        this.proficiency = payload?.proficiency || this.proficiency;
        console.log('[ChatView] contentSelector:selectionChanged', {
            locale: this.locale,
            proficiency: this.proficiency
        });
        this.updatePlaceholder();
    }

    _getCurrentLocale() {
        // Read from localStorage (same approach as the controller)
        try {
            const stored = window.localStorage.getItem('contentSelector');
            if (stored) {
                const parsed = JSON.parse(stored);
                return (parsed?.locale || 'de').toLowerCase();
            }
        } catch (e) { /* noop */
        }
        return 'de';
    }

    _getCurrentProficiency() {
        try {
            const stored = window.localStorage.getItem('contentSelector');
            if (stored) {
                const parsed = JSON.parse(stored);
                return (parsed?.proficiency || 'original').toLowerCase();
            }
        } catch (e) { /* noop */
        }
        return 'original';
    }

    getSessionToken() {
        const fromStorage = localStorage.getItem('capito_session_token');
        if (fromStorage) return fromStorage;
        const m = document.cookie.match(/(?:^|;\s*)capito_session_token=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    }

    persistSessionToken(token) {
        if (!token) return;
        localStorage.setItem('capito_session_token', token);
        document.cookie = `capito_session_token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}`;
    }

    className() {
        return 'bn-chat is-hidden is-minimized';
    }

    events() {
        return {
            'click .js-chat-toggle': 'onToggle',
            'click .js-chat-send': 'onSend',
            'keypress .js-chat-input': 'onKeyPress',
            'mousedown .bn-chat__header': 'onDragStart'
        };
    }

    onExternalToggle() {
        // Triggered by the nav-bar robot button. Show the chat if hidden/minimized,
        // otherwise close it.
        if (this.$el.hasClass('is-hidden') || this.isMinimized) {
            this.$el.removeClass('is-hidden');
            if (this.isMinimized) this.onToggle();
        } else {
            this.onToggle();
        }
    }

    getTemplate() {
        return Handlebars.templates['chat-container'];
    }

    render() {
        const template = this.getTemplate();
        const placeholder = this.getChatPlaceholder();
        // Ensure root element has id and classes
        this.$el.attr('id', 'bn-chat');
        this.$el.addClass('bn-chat');
        this.$el.toggleClass('is-minimized', this.isMinimized);
        this.$el.html(template({
            placeholder,
            placeholderAria: placeholder
        }));

        const $btn = this.$('.js-chat-toggle');
        if ($btn && $btn.length) $btn.text(this.isMinimized ? '+' : '−');

        // Cache frequently used nodes
        this.$messages = this.$('.bn-chat__messages');
        this.$input = this.$('.js-chat-input');
        this.updatePlaceholder();

        // Listen for clicks outside to minimize
        document.addEventListener('mousedown', this.onClickOutside);
        document.addEventListener('keydown', this.onKeyDown);

        return this;
    }

    setCourseId() {
        try {
            this.courseId = Adapt.config?.get?.('_courseId')
                || Adapt.course?.get?.('_globals')?._courseId
                || Adapt.course?.get?.('_id')
                || null;
        } catch (e) {
            console.warn('[ChatView] Failed to resolve course id', e);
        }
        return this.courseId
    }

    showIfHidden(showIntro = false) {
        // Reveal the chat if hidden; optionally show intro once
        if (this.$el.hasClass('is-hidden')) {
            this.$el.removeClass('is-hidden');
        }
        if (showIntro && !this._introShown) {
            this.addSystemMessage('Du kannst mir hier Fragen stellen, wenn etwas im Kurs nicht klar für dich ist.');
            this._introShown = true;
        }
    }

    // --- UI events ---
    onToggle(e) {
        e?.preventDefault?.();
        this.isMinimized = !this.isMinimized;
        this.$el.toggleClass('is-minimized', this.isMinimized);

        if (this.isMinimized) {
            // Reset custom positioning when minimizing so it goes to bottom-right
            this.el.style.left = '';
            this.el.style.top = '';
            this.el.style.right = '';
            this.el.style.bottom = '';
        }

        const $btn = this.$('.js-chat-toggle');
        if ($btn && $btn.length) $btn.text(this.isMinimized ? '+' : '−');

        // Focus input when opened
        if (!this.isMinimized) {
            setTimeout(() => this.$input.focus(), 300);
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && !this.isMinimized) {
            this.onToggle();
        }
    }

    onClickOutside(e) {
        if (this.isMinimized) return;
        // If clicked outside the chat element, minimize it
        if (!this.el.contains(e.target)) {
            this.isMinimized = true;
            this.$el.addClass('is-minimized');

            // Reset custom positioning when minimizing
            this.el.style.left = '';
            this.el.style.top = '';
            this.el.style.right = '';
            this.el.style.bottom = '';

            const $btn = this.$('.js-chat-toggle');
            if ($btn && $btn.length) $btn.text('+');
        }
    }

    onKeyPress(e) {
        if (e.key === 'Enter') {
            // Allow Shift+Enter to insert a newline in the textarea
            if (e.shiftKey) return;
            e.preventDefault();
            this.onSend();
        }
    }

    async onSend() {
        if (!this.$input || !this.$messages) return;
        const message = String(this.$input.val() || '').trim();
        if (!message) return;

        // Add user message
        this.addUserMessage(message);
        this.$input.val('');

        try {
            if (!this.courseId && !this.setCourseId()) {
                console.warn('[ChatView] No course_id extracted, skipping POST');
                return;
            }
            this.addSystemMessage('… wird gesendet');
            const baseUrl = this.getBaseUrl();
            const headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',

            };
            const sessionToken = this.getSessionToken();
            if (sessionToken) {
                headers['X-Session-Token'] = sessionToken;
            }
            const resp = await fetch(`${baseUrl}/public/v1/ai-chat`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    locale: this.locale,
                    proficiency: this.proficiency,
                    course_id: this.courseId,
                    message: message
                }),
                credentials: 'include'
            });
            // Remove the sending status
            this.removeLastSystemSendingMessage();
            if (!resp.ok) {
                this.addSystemMessage('Fehler beim Senden: ' + resp.status);
                return;
            }
            const newToken = resp.headers.get('X-Session-Token');
            if (newToken) {
                this.persistSessionToken(newToken);
            }
            const contentType = resp.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await resp.json();
                if (data && data.message && data.message.text) {
                    this.addSystemMessage(String(data.message.text));
                } else {
                    this.addSystemMessage('Unbekannter Fehler beim Senden.');
                }

            } else {
                const txt = await resp.text();
                const div = document.createElement('div');
                div.innerHTML = txt;
                this.addSystemMessage(div.textContent || div.innerText || txt);
            }
        } catch (e) {
            this.removeLastSystemSendingMessage();
            console.error('[ChatView] send error', e);
            this.addSystemMessage('Netzwerkfehler beim Senden.');
        }
    }

    // --- Dragging ---
    onDragStart(e) {
        // Establish drag offsets relative to the container
        const rect = this.el.getBoundingClientRect();
        this.dragging = true;
        this.dragOffset = {x: e.clientX - rect.left, y: e.clientY - rect.top};
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    onMouseMove(e) {
        if (!this.dragging) return;
        // Calculate constrained position
        const x = e.clientX - (this.dragOffset?.x || 0);
        const y = e.clientY - (this.dragOffset?.y || 0);
        const maxX = window.innerWidth - this.el.offsetWidth;
        const maxY = window.innerHeight - this.el.offsetHeight;
        const constrainedX = Math.max(0, Math.min(x, maxX));
        const constrainedY = Math.max(0, Math.min(y, maxY));
        this.el.style.left = constrainedX + 'px';
        this.el.style.top = constrainedY + 'px';
        this.el.style.right = 'auto';
        this.el.style.bottom = 'auto';
    }

    onMouseUp() {
        this.dragging = false;
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }

    // --- Message helpers ---
    removeLastSystemSendingMessage() {
        const nodes = this.$messages ? this.$messages.find('.bn-chat__message--system').toArray() : [];
        if (!nodes || nodes.length === 0) return;
        const last = nodes[nodes.length - 1];
        if (last && last.textContent && last.textContent.includes('wird gesendet')) {
            last.remove();
        }
    }

    addUserMessage(text) {
        this.addMessage(text, 'user');
    }

    addSystemMessage(text) {
        this.addMessage(text, 'system');
    }

    addMessage(text, type) {
        if (!this.$messages) return;
        const $message = $(
            `<div class="bn-chat__message bn-chat__message--${type} new"><p></p></div>`
        );
        $message.find('p').html(String(text));
        this.$messages.append($message);
        // Scroll to bottom
        this.$messages.scrollTop(this.$messages[0].scrollHeight);
        // Remove 'new' class after animation
        setTimeout(() => $message.removeClass('new'), 300);
    }

    // --- i18n placeholder ---
    updatePlaceholder() {
        if (!this.$input || !this.$input.length) return;
        const text = this.getChatPlaceholder();
        if (!text) return;
        this.$input.attr('placeholder', text);
        this.$input.attr('aria-label', text);
    }

    getChatPlaceholder() {
        const locale = (this.locale || this._getCurrentLocale() || 'de').toLowerCase();
        const globals = Adapt.course?.get('_globals') || {};
        const chatConfig = globals?._extensions?._blockNavigation?._chat || {};
        const placeholders = chatConfig.placeholders || chatConfig.placeholder || chatConfig;

        let placeholder = null;
        if (typeof placeholders === 'string') {
            placeholder = placeholders;
        } else if (placeholders && typeof placeholders === 'object') {
            placeholder =
                placeholders[locale] ||
                placeholders[locale.toUpperCase()] ||
                placeholders.default ||
                placeholders.DEFAULT ||
                null;
        }

        if (!placeholder) {
            placeholder = this.getDefaultPlaceholder(locale);
        }
        return String(placeholder);
    }

    getDefaultPlaceholder(locale) {
        switch (String(locale || '').toLowerCase()) {
            case 'de':
                return 'Nachricht eingeben oder Mikrofon benutzen...';
            case 'en':
                return 'Type a message or use the microphone...';
            case 'fr':
                return 'Saisissez un message...';
            case 'es':
                return 'Escribe un mensaje...';
            case 'it':
                return 'Scrivi un messaggio...';
            case 'pt':
                return 'Digite uma mensagem...';
            case 'nl':
                return 'Typ een bericht...';
            default:
                return 'Type a message...';
        }
    }

    remove() {
        this.stopListening();
        try {
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
            document.removeEventListener('mousedown', this.onClickOutside);
            document.removeEventListener('keydown', this.onKeyDown);
        } catch (e) { /* noop */
        }
        Backbone.View.prototype.remove.call(this);
    }

    getBaseUrl() {
        const globals = Adapt.course?.get('_globals') || {};
        return globals._dashboardBaseUrl || Adapt.config.dashboardBaseUrl || '';
    }
}
