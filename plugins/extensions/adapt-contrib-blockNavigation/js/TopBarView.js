import Backbone from 'backbone';
import Adapt from 'core/js/adapt';

/**
 * TopBarView - Handles the top navigation bar with prev/next buttons and TTS toggle.
 * This is a sub-view of BlockNavigationView to properly scope events.
 */
export default class TopBarView extends Backbone.View {

    initialize(options) {
        this.parentView = options.parentView;
        this.listenTo(this.model, 'change', this.updateState);
    }

    className() {
        return 'block-navigation';
    }

    events() {
        return {
            'click .js-tts-toggle': 'onToggleTTS'
        };
    }

    getTemplate() {
        return Handlebars.templates['block-navigation-footer'];
    }

    render() {
        const data = this.model.toJSON();
        const title = data['title'];
        const template = this.getTemplate();

        this.$el.html(template({
            ...data,
            title,
        }));

        // Notify other extensions/components that the footer has rendered
        try {
            Adapt.trigger('blockNavigation:topBarRendered', {el: this.el});
        } catch (e) {
            // no-op
        }

        console.log('[blockNavigation:TopBarView] rendered', {
            current: data.current,
            total: data.total,
            disablePrev: data.disablePrev,
            disableNext: data.disableNext
        });

        return this;
    }

    updateState() {
        const data = this.model.toJSON();
        const globals = data?._globals?._extensions?._blockNavigation || {};
        const buttons = globals._buttons || {};

        const nextTooltip = data.disableNext
            ? buttons._next?.disabledTooltip
            : buttons._next?.enabledTooltip;
        const prevTooltip = data.disablePrev
            ? buttons._previous?.disabledTooltip
            : buttons._previous?.enabledTooltip;

        this.$('.js-block-nav-prev')
            .prop('disabled', !!data.disablePrev)
            .prop('title', prevTooltip || '');
        this.$('.js-block-nav-next')
            .prop('disabled', !!data.disableNext)
            .prop('title', nextTooltip || '');

        // Update title text in place (avoid re-rendering the whole top bar,
        // which would destroy any element that currently has focus, e.g. the Next button)
        const $title = this.$('.block-navigation__title h1');
        if ($title && $title.length) {
            const currentTitle = $title.html();
            const newTitle = data.title != null ? String(data.title) : '';
            if (currentTitle !== newTitle) {
                $title.html(newTitle);
            }
        }

        // Reflect TTS toggle state
        const $tts = this.$('.js-tts-toggle');
        if ($tts && $tts.length) {
            const ttsEnabled = !!data.ttsEnabled;
            $tts.attr('aria-pressed', ttsEnabled ? 'true' : 'false');
            $tts.text(ttsEnabled ? '🔊' : '🔈');
        }
    }


    onToggleTTS(e) {
        e.preventDefault();
        const current = !!this.model.get('ttsEnabled');
        const next = !current;
        console.log('[blockNavigation:TopBarView] tts toggle clicked', {next});
        this.model.set('ttsEnabled', next);
        // Bubble up to parent view
        this.parentView.trigger('tts:toggle', next);
    }

    remove() {
        this.stopListening();
        Backbone.View.prototype.remove.call(this);
    }
}