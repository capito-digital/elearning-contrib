import QuestionView from 'core/js/views/questionView';

class ImageOrderingView extends QuestionView {
    preRender() {
        super.preRender();
    }

    setupQuestion() {
        this._isRendered = false;
        this._dndBound = false;
        this._userOrderBeforeShowCorrect = null;
    }

    onQuestionRendered() {
        this._isRendered = true;
        this._cacheElements();
        this._renderList();
        this._bindOverlayEvents();
        this.enableQuestion();
        this.setReadyStatus();
    }

    _cacheElements() {
        this.$list = this.$el.find('.js-order-list');
        this.$overlay = this.$el.find('.js-image-overlay');
        this.$overlayImage = this.$el.find('.js-overlay-image');
    }

    _renderList(order = null) {
        if (!this._isRendered) return;
        const items = this.model.get('_items') || [];
        const currentOrder = order || (this.model.get('_order') || items.map(i => i.id));
        const byId = {};
        items.forEach(it => byId[it.id] = it);
        const html = currentOrder.map((id, idx) => {
            const it = byId[id] || {};
            const isImage = it.type === 'image';
            const content = isImage
                ? `<img src="${it.value}" alt="${it.alt || ''}">`
                : `<div class="imageOrdering__text">${it.value}</div>`;
            const clickableClass = isImage ? 'is-clickable' : '';
            return `<li class="imageOrdering__item ${clickableClass}" draggable="true" data-id="${id}" data-index="${idx}">${content}</li>`;
        }).join('');
        this.$list.html(html);
        this._applyMarking();
    }

    _bindOverlayEvents() {
        this.$list.on('click', '.imageOrdering__item.is-clickable', (e) => {
            // Only open if we didn't just finish a drag
            if (this._wasDragging) {
                this._wasDragging = false;
                return;
            }
            const src = $(e.currentTarget).find('img').attr('src');
            const alt = $(e.currentTarget).find('img').attr('alt');
            this._openOverlay(src, alt);
        });

        this.$el.on('click', '.js-overlay-close', () => this._closeOverlay());

        // Close on overlay background click
        this.$overlay.on('click', (e) => {
            if (e.target === this.$overlay[0]) {
                this._closeOverlay();
            }
        });

        // Close on Esc key
        $(document).on('keydown.imageOrdering', (e) => {
            if (e.key === 'Escape' && this.$overlay.is(':visible')) {
                this._closeOverlay();
            }
        });
    }

    _openOverlay(src, alt) {
        this.$overlayImage.attr('src', src).attr('alt', alt);
        this.$overlay.fadeIn(200).attr('aria-hidden', 'false');
        $('body').css('overflow', 'hidden'); // Prevent scrolling
    }

    _closeOverlay() {
        this.$overlay.fadeOut(200).attr('aria-hidden', 'true');
        $('body').css('overflow', '');
    }

    remove() {
        $(document).off('keydown.imageOrdering');
        super.remove();
    }

    _bindDragDrop() {
        if (this._dndBound) return;
        let draggedId = null;
        let overId = null;
        this._wasDragging = false;

        this.$list.on('dragstart', '.imageOrdering__item', (e) => {
            draggedId = e.currentTarget.getAttribute('data-id');
            e.originalEvent.dataTransfer.setData('text/plain', draggedId);
            e.originalEvent.effectAllowed = 'move';
            e.currentTarget.classList.add('is-dragging');
            this._wasDragging = true;
        });

        this.$list.on('dragend', '.imageOrdering__item', function () {
            this.classList.remove('is-dragging');
        });

        this.$list.on('dragover', '.imageOrdering__item', function (e) {
            e.preventDefault();
            overId = this.getAttribute('data-id');
            this.classList.add('is-dragover');
        });
        this.$list.on('dragleave', '.imageOrdering__item', function () {
            this.classList.remove('is-dragover');
        });
        this.$list.on('drop', '.imageOrdering__item', (e) => {
            e.preventDefault();
            const fromId = e.originalEvent.dataTransfer.getData('text/plain') || draggedId;
            const toId = e.currentTarget.getAttribute('data-id') || overId;
            this.$list.find('.imageOrdering__item').removeClass('is-dragover');
            if (!fromId || !toId || fromId === toId) return;
            this._reorder(fromId, toId);
        });

        this._dndBound = true;
    }

    _reorder(fromId, toId) {
        const order = (this.model.get('_order') || []).slice();
        const fromIdx = order.indexOf(fromId);
        const toIdx = order.indexOf(toId);
        if (fromIdx === -1 || toIdx === -1) return;
        order.splice(toIdx, 0, ...order.splice(fromIdx, 1));
        this.model.setUserAnswer(order);
        if (typeof this.model.checkCanSubmit === 'function') this.model.checkCanSubmit();
        this._renderList(order);
    }

    disableQuestion() {
        if (!this._dndBound) return;
        this.$list.find('.imageOrdering__item').attr('draggable', 'false').addClass('is-disabled');
        this.$list.off('dragstart dragend dragover dragleave drop');
        this._dndBound = false;
    }

    enableQuestion() {
        this._renderList();
        if (!this.$list) return;
        this.$list.find('.imageOrdering__item').attr('draggable', 'true').removeClass('is-disabled');
        this._bindDragDrop();
    }

    showMarking() {
        this._applyMarking();
    }

    _applyMarking() {
        const correctness = this.model.get('_itemCorrectness') || [];
        const has = correctness.length > 0;
        const $items = this.$list.find('.imageOrdering__item');
        $items.removeClass('is-correct is-incorrect');
        if (!has) return;
        $items.each(function (idx) {
            const ok = !!correctness[idx];
            this.classList.add(ok ? 'is-correct' : 'is-incorrect');
        });
    }

    resetQuestion() {
        this.model.resetUserAnswer();
        this._renderList();
        this.enableQuestion();
        this.$el.removeClass('is-submitted is-correct is-incorrect show-correct-answer');
    }

    showCorrectAnswer() {
        super.showCorrectAnswer();
        // Save user order to allow hide-correct to restore
        this._userOrderBeforeShowCorrect = (this.model.get('_order') || []).slice();
        const correct = this.model.get('_correctOrder') || [];
        this._renderList(correct);
        this.$el.addClass('show-correct-answer');
        this.disableQuestion();
    }

    hideCorrectAnswer() {
        super.hideCorrectAnswer();
        const restore = this._userOrderBeforeShowCorrect || (this.model.get('_order') || []);
        this._renderList(restore);
        this.$el.removeClass('show-correct-answer');
        this._applyMarking();
    }

    onSubmit(e) {
        // Mark interaction complete and defer to base for marking and completion
        try {
            if (!this.model.get('_isInteractionComplete')) this.model.set('_isInteractionComplete', true);
        } catch (_) {
        }
        return super.onSubmit(e);
    }

    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

ImageOrderingView.template = 'imageOrdering';

export default ImageOrderingView;
