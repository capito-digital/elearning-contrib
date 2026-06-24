import Backbone from 'backbone';
import Adapt from 'core/js/adapt';

/**
 * ProgressBarView - Handles the bottom progress bar display.
 * This is a sub-view of BlockNavigationView.
 */
export default class ProgressBarView extends Backbone.View {

    initialize(options) {
        this.parentView = options.parentView;
        this.completionStored = false;
        this.listenTo(this.model, 'change:current change:total', this.render);
        this.listenTo(Adapt, 'blockNavigation:completionStored', this.onCompletionStored);
    }

    className() {
        return 'block-navigation-progress';
    }

    events() {
        return {
            'click .js-block-nav-prev': 'onPrev',
            'click .js-block-nav-next': 'onNext',
            'click .js-chat-open': 'onChatOpen',
        };
    }

    onChatOpen(e) {
        e?.preventDefault?.();
        try {
            Adapt.trigger('bnChat:toggle');
        } catch (err) { /* noop */ }
    }

    getTemplate() {
        return Handlebars.templates['block-navigation-progress'];
    }

    computeProgressStrings(data) {
        const globals = data?._globals?._extensions?._blockNavigation || {};
        const textTpl = globals._progressIndicator?.text || 'Inhalt {current} von {total}';
        const ariaTpl = globals._progressIndicator?.ariaLabel || textTpl;
        const replace = (tpl) => String(tpl)
            .replace('{current}', data.current)
            .replace('{total}', data.total);
        return {progressText: replace(textTpl), progressAria: replace(ariaTpl)};
    }

    getCompleteButtonStrings(data) {
        const globals = data?._globals?._extensions?._blockNavigation || {};
        const complete = globals._buttons?._complete || {};
        return {
            text: complete.text || 'Abschließen',
            aria: complete.ariaLabel || complete.text || 'Abschließen'
        };
    }

    getBackToOverviewButtonStrings(data) {
        const globals = data?._globals?._extensions?._blockNavigation || {};
        const back = globals._buttons?._backToOverview || {};
        return {
            text: back.text || 'Zur',
            aria: back.ariaLabel || back.text || 'Zurück zur Übersicht'
        };
    }

    getProgressbarValue(current, total) {
        if (!total || total === 0) return 0;
        return Math.round((current / total) * 100);
    }

    isLastItem() {
        const current = Number(this.model.get('current') || 0);
        const total = Number(this.model.get('total') || 0);
        // Treat reaching or exceeding total as last step
        return total > 0 && current >= total;
    }

    render() {
        const data = this.model.toJSON();
        const {progressText, progressAria} = this.computeProgressStrings(data);
        const isLast = this.isLastItem();
        const completeStrings = this.getCompleteButtonStrings(data);
        const backToOverviewStrings = this.getBackToOverviewButtonStrings(data);
        const template = this.getTemplate();

        this.$el.html(template({
            ...data,
            progressText,
            progressAria,
            progress: this.getProgressbarValue(data.current, data.total),
            isLast,
            nextButtonText: isLast
                ? (this.completionStored ? backToOverviewStrings.text : completeStrings.text)
                : data?._globals?._extensions?._blockNavigation?._buttons?._next?.text,
            nextButtonAria: isLast
                ? (this.completionStored ? backToOverviewStrings.aria : completeStrings.aria)
                : data?._globals?._extensions?._blockNavigation?._buttons?._next?.ariaLabel,
        }));

        // Notify other extensions/components that the progress bar has rendered
        try {
            Adapt.trigger('blockNavigation:progressBarRendered', {el: this.el});
        } catch (e) {
            // no-op
        }

        console.log('[blockNavigation:ProgressBarView] rendered', {
            current: data.current,
            total: data.total,
            progress: this.getProgressbarValue(data.current, data.total),
            isLast
        });

        return this;
    }

    remove() {
        this.stopListening();
        Backbone.View.prototype.remove.call(this);
    }

    onPrev(e) {
        e.preventDefault();
        if (this.model.get('disablePrev')) return;
        console.log('[blockNavigation:TopBarView] prev clicked');
        // Bubble up to parent view
        this.parentView.trigger('nav:prev');
    }

    onNext(e) {
        e.preventDefault();
        if (this.model.get('disableNext')) return;
        const isLast = this.isLastItem();
        console.log('[blockNavigation:TopBarView] next clicked', {isLast});
        if (isLast) {
            if (this.completionStored) {
                window.history.back();
                return;
            }
            // Emit completion event for listeners (e.g., capitoBadges)
            try {
                Adapt.trigger('blockNavigation:complete');
            } catch (e) {
                // no-op
            }
        } else {
            // Bubble up to parent view to proceed to next content
            this.parentView.trigger('nav:next');
        }
    }

    onCompletionStored() {
        this.completionStored = true;
        this.render();
    }

}
