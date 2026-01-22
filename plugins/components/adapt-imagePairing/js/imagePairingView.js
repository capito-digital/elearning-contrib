import QuestionView from 'core/js/views/questionView';

class ImagePairingView extends QuestionView {
    // Called before render; QuestionView will call setupQuestion()
    preRender() {
        super.preRender();
        this.listenTo(this.model, 'change:_isInteractionComplete', this.onInteractionComplete);
    }

    onInteractionComplete() {
        // This is called whenever _isInteractionComplete changes
        // checkCanSubmit is a method provided by QuestionView parent class
        this.model.checkCanSubmit();
    }

    // Called by QuestionView during preRender
    setupQuestion() {
        // Nothing to randomize here as model handles shuffle; just prep state flags
        this._dndBound = false;
        this._isRendered = false; // Add flag to track if DOM is ready
    }

    onQuestionRendered() {
        this._isRendered = true; // Mark as rendered
        this._cacheElements();
        this._renderLists();
        this._bindOverlayEvents();
        this.enableQuestion();
        this._refreshAssignmentUI();
        this.setReadyStatus();
    }

    _cacheElements() {
        const $el = this.$el;
        this.$leftList = $el.find('.js-left-list');
        this.$rightList = $el.find('.js-right-list');
        this.$overlay = $el.find('.js-image-overlay');
        this.$overlayImage = $el.find('.js-overlay-image');
        // ButtonsView will render into .btn__container; we don't manually cache buttons
    }

    _renderLists() {
        if (!this._isRendered) return; // Guard against premature calls

        const left = this.model.get('_leftItems') || [];
        const right = this.model.get('_rightItems') || [];

        const leftHtml = left.map((item, idx) => {
            const isImage = item.type === 'image';
            const content = isImage
                ? `<img src="${item.value}" alt="${item.alt || ''}">`
                : `<div class="imagePairing__text">${item.value}</div>`;
            const clickableClass = isImage ? 'is-clickable' : '';
            return `<li class="imagePairing__leftItem ${clickableClass}" draggable="true" data-left-id="${item.id}" data-index="${idx}">${content}</li>`;
        }).join('');
        this.$leftList.html(leftHtml);

        const rightHtml = right.map((item, idx) => {
            const isImage = item.type === 'image';
            const content = isImage
                ? `<img src="${item.value}" alt="${item.alt || ''}">`
                : `<div class="imagePairing__text">${item.value}</div>`;
            const clickableClass = isImage ? 'is-clickable' : '';
            return `<li class="imagePairing__rightItem js-dropzone ${clickableClass}" data-right-id="${item.id}" data-index="${idx}">
        <div class="imagePairing__rightInner">
          <div class="imagePairing__rightContent">${content}</div>
          <div class="imagePairing__assignmentBadge" aria-hidden="true"></div>
        </div>
      </li>`;
        }).join('');
        this.$rightList.html(rightHtml);

        // Cache original right content for restoration during UI refresh
        this.$rightList.find('.imagePairing__rightItem').each(function () {
            const $content = $(this).find('.imagePairing__rightContent');
            if ($content.data('originalHtml') == null) {
                $content.data('originalHtml', $content.html());
            }
        });
    }

    _bindOverlayEvents() {
        const onImageClick = (e) => {
            if (this._wasDragging) {
                this._wasDragging = false;
                return;
            }
            const $img = $(e.currentTarget).find('img');
            // In paired state, it might be in .imagePairing__pairedCard
            const src = $img.attr('src');
            const alt = $img.attr('alt');
            if (src) {
                this._openOverlay(src, alt);
            }
        };

        this.$leftList.on('click', '.imagePairing__leftItem.is-clickable', onImageClick);
        this.$rightList.on('click', '.imagePairing__rightItem.is-clickable', onImageClick);

        this.$el.on('click', '.js-overlay-close', () => this._closeOverlay());

        this.$overlay.on('click', (e) => {
            if (e.target === this.$overlay[0]) {
                this._closeOverlay();
            }
        });

        $(document).on('keydown.imagePairing', (e) => {
            if (e.key === 'Escape' && this.$overlay.is(':visible')) {
                this._closeOverlay();
            }
        });
    }

    _openOverlay(src, alt) {
        this.$overlayImage.attr('src', src).attr('alt', alt);
        this.$overlay.fadeIn(200).attr('aria-hidden', 'false');
        $('body').css('overflow', 'hidden');
    }

    _closeOverlay() {
        this.$overlay.fadeOut(200).attr('aria-hidden', 'true');
        $('body').css('overflow', '');
    }

    remove() {
        $(document).off('keydown.imagePairing');
        super.remove();
    }

    _bindDragDrop() {
        const view = this;
        let draggedId = null;
        this._wasDragging = false;

        // Left items draggable
        this.$leftList.on('dragstart', '.imagePairing__leftItem', function (e) {
            draggedId = this.getAttribute('data-left-id');
            e.originalEvent.dataTransfer.setData('text/plain', draggedId);
            e.originalEvent.effectAllowed = 'move';
            this.classList.add('is-dragging');
            view._wasDragging = true;
        });
        this.$leftList.on('dragend', '.imagePairing__leftItem', function () {
            this.classList.remove('is-dragging');
        });

        // Right items dropzones
        this.$rightList.on('dragover', '.js-dropzone', function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = 'move';
            this.classList.add('is-dragover');
        });
        this.$rightList.on('dragleave', '.js-dropzone', function () {
            this.classList.remove('is-dragover');
        });
        this.$rightList.on('drop', '.js-dropzone', function (e) {
            e.preventDefault();
            this.classList.remove('is-dragover');
            const leftId = e.originalEvent.dataTransfer.getData('text/plain') || draggedId;
            if (!leftId) return;
            const rightId = this.getAttribute('data-right-id');
            view._assign(leftId, rightId);
        });
        this._dndBound = true;

        // Pair reset handlers - DELEGATE on $rightList instead of $el
        // This ensures buttons created dynamically in _refreshAssignmentUI will be captured
        this.$rightList.on('click', '.imagePairing__resetPair', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const leftId = this.getAttribute('data-left-id');
            if (leftId) view._unassign(leftId);
        });
        this.$rightList.on('keydown', '.imagePairing__resetPair', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                const leftId = this.getAttribute('data-left-id');
                if (leftId) view._unassign(leftId);
            }
        });
    }

    _bindResetHandlers() {
        // Bind reset handlers with event delegation on the component root
        // This allows handlers to work even when buttons are re-rendered
        this.$el.on('click', '.imagePairing__resetPair', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const btn = e.currentTarget;
            const leftId = btn.getAttribute('data-left-id');
            if (leftId) this._unassign(leftId);
        });
        this.$el.on('keydown', '.imagePairing__resetPair', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                const btn = e.currentTarget;
                const leftId = btn.getAttribute('data-left-id');
                if (leftId) this._unassign(leftId);
            }
        });
    }


    _assign(leftId, rightId) {
        const assignments = {...(this.model.get('_assignments') || {})};

        // Unassign any existing mapping using this leftId
        Object.keys(assignments).forEach(k => {
            if (k === leftId) return;
        });

        // Ensure right is unique: remove any left mapped to this right
        for (const k of Object.keys(assignments)) {
            if (assignments[k] === rightId) delete assignments[k];
        }
        assignments[leftId] = rightId;
        this.model.setUserAnswer(assignments);

        // Re-evaluate submit availability based on current assignments
        // Do NOT set _isInteractionComplete here; this will now be set only on submit.
        if (typeof this.model.checkCanSubmit === 'function') this.model.checkCanSubmit();

        this._refreshAssignmentUI();
    }

    _refreshAssignmentUI() {
        const assignments = this.model.get('_assignments') || {};

        // Reset visuals
        this.$leftList.find('.imagePairing__leftItem').removeClass('is-placed');
        // Do not show numeric indicator anymore
        this.$rightList.find('.imagePairing__assignmentBadge').text('');
        this.$rightList.find('.imagePairing__rightItem').removeClass('has-assignment is-paired');

        // Restore original right tile contents before applying any paired visuals
        this.$rightList.find('.imagePairing__rightItem').each(function () {
            const $item = $(this);
            const $content = $item.find('.imagePairing__rightContent');
            const original = $content.data('originalHtml');
            if (original != null) $content.html(original);
        });

        // Build convenience maps
        const leftIndexById = {};
        this.$leftList.find('.imagePairing__leftItem').each(function () {
            leftIndexById[this.getAttribute('data-left-id')] = this.getAttribute('data-index');
        });

        // Build lookup of items by id
        const leftById = {};
        (this.model.get('_leftItems') || []).forEach(l => leftById[l.id] = l);
        const rightById = {};
        (this.model.get('_rightItems') || []).forEach(r => rightById[r.id] = r);

        const renderItem = (item) => {
            if (!item) return '';
            if (item.type === 'image') {
                return `<img src="${item.value}" alt="${item.alt || ''}">`;
            }
            return `<span class="imagePairing__text imagePairing__text--paired">${item.value}</span>`;
        };

        for (const [leftId, rightId] of Object.entries(assignments)) {
            const leftIndex = leftIndexById[leftId];
            const leftItem = leftById[leftId];
            const rightItem = rightById[rightId];
            const $left = this.$leftList.find(`.imagePairing__leftItem[data-left-id="${leftId}"]`);
            const $right = this.$rightList.find(`.imagePairing__rightItem[data-right-id="${rightId}"]`);
            $left.addClass('is-placed');
            $right.addClass('has-assignment');
            // No numeric badge display per new requirement

            // Always show paired visualization (image, text, or mixed)
            if (leftItem && rightItem) {
                const $content = $right.find('.imagePairing__rightContent');
                const leftHtml = renderItem(leftItem);
                const rightHtml = renderItem(rightItem);
                // Overlapped "stacked cards" layout with ~70% sized items
                const showReset = !this.$el.hasClass('is-submitted') && !this.$el.hasClass('is-disabled');
                const resetBtn = showReset ? `<button type="button" class="imagePairing__resetPair" data-left-id="${leftId}" data-right-id="${rightId}" aria-label="Remove pair" title="Remove pair">&times;</button>` : '';
                const pairedHtml = `
          <div class="imagePairing__pairedOver">
            <div class="imagePairing__pairedCard imagePairing__pairedCard--base">${rightHtml}</div>
            <div class="imagePairing__pairedCard imagePairing__pairedCard--top">${leftHtml}</div>
            ${resetBtn}
          </div>`;
                $content.html(pairedHtml);
                $right.addClass('is-paired');
            }
        }
    }

    // QuestionView lifecycle hooks
    enableQuestion() {
        // Re-render lists to ensure DOM and rebind
        this._renderLists();
        this.$leftList.find('.imagePairing__leftItem').attr('draggable', 'true').removeClass('is-disabled');
        this._bindDragDrop();
        this._bindResetHandlers();
    }

    disableQuestion() {
        if (!this._dndBound) return;
        this.$leftList.find('.imagePairing__leftItem').attr('draggable', 'false').addClass('is-disabled');
        this.$rightList.off('dragover dragleave drop');
        this.$leftList.off('dragstart dragend');
        // Unbind reset handlers
        this.$el.off('click', '.imagePairing__resetPair');
        this.$el.off('keydown', '.imagePairing__resetPair');
        this._dndBound = false;
    }

    showMarking() {
        // Add visual correctness/incorrectness on paired items
        const assignments = this.model.get('_assignments') || {};
        const rightById = {};
        (this.model.get('_rightItems') || []).forEach(r => rightById[r.id] = r);
        const leftById = {};
        (this.model.get('_leftItems') || []).forEach(l => leftById[l.id] = l);

        // Reset
        this.$leftList.find('.imagePairing__leftItem').removeClass('is-correct is-incorrect');
        this.$rightList.find('.imagePairing__rightItem').removeClass('is-correct is-incorrect');

        for (const [leftId, rightId] of Object.entries(assignments)) {
            const left = leftById[leftId];
            const right = rightById[rightId];
            if (!left || !right) continue;
            const isPairCorrect = left.pairId === right.pairId;
            const $l = this.$leftList.find(`.imagePairing__leftItem[data-left-id="${leftId}"]`);
            const $r = this.$rightList.find(`.imagePairing__rightItem[data-right-id="${rightId}"]`);
            $l.addClass(isPairCorrect ? 'is-correct' : 'is-incorrect');
            $r.addClass(isPairCorrect ? 'is-correct' : 'is-incorrect');
        }
    }

    resetQuestion() {
        if (!this._isRendered) return; // Guard against premature calls

        this.model.resetUserAnswer();
        this._renderLists();
        this.enableQuestion();
        this._refreshAssignmentUI();
        this.$el.removeClass('is-submitted is-correct is-incorrect show-correct-answer');
    }

    showCorrectAnswer() {
        super.showCorrectAnswer();
        // Visualise all correct pairs by stacking each correct left on its matching right
        // 1) Restore right tiles to original markup to ensure a clean slate
        this.$rightList.find('.imagePairing__rightItem').each(function () {
            const $item = $(this);
            const $content = $item.find('.imagePairing__rightContent');
            const original = $content.data('originalHtml');
            if (original != null) $content.html(original);
            $item.removeClass('has-assignment is-paired is-correct is-incorrect');
        });

        // 2) Build lookups for left/right items keyed by pairId
        const rightByPair = {};
        (this.model.get('_rightItems') || []).forEach(r => {
            if (r && r.pairId != null) rightByPair[r.pairId] = r;
        });

        const leftItems = this.model.get('_leftItems') || [];

        const renderItem = (item) => {
            if (!item) return '';
            if (item.type === 'image') return `<img src="${item.value}" alt="${item.alt || ''}">`;
            return `<span class="imagePairing__text imagePairing__text--paired">${item.value}</span>`;
        };

        // 3) For every left, render its correct pair overlay in the corresponding right tile
        leftItems.forEach(l => {
            const right = rightByPair[l.pairId];
            if (!right) return;
            const $l = this.$leftList.find(`.imagePairing__leftItem[data-left-id="${l.id}"]`);
            const $r = this.$rightList.find(`.imagePairing__rightItem[data-right-id="${right.id}"]`);
            if ($r.length === 0) return;

            const $content = $r.find('.imagePairing__rightContent');
            const leftHtml = renderItem(l);
            const rightHtml = renderItem(right);
            const pairedHtml = `
          <div class="imagePairing__pairedOver">
            <div class="imagePairing__pairedCard imagePairing__pairedCard--base">${rightHtml}</div>
            <div class="imagePairing__pairedCard imagePairing__pairedCard--top">${leftHtml}</div>
          </div>`;
            $content.html(pairedHtml);
            $r.addClass('is-paired is-correct-pair');
            $l.addClass('is-correct-pair');
        });

        // 4) Toggle component state and disable interactions
        this.$el.addClass('show-correct-answer');
        this.disableQuestion();
    }

    hideCorrectAnswer() {
        super.hideCorrectAnswer();
        this.$leftList.find('.imagePairing__leftItem').removeClass('is-correct-pair');
        this.$rightList.find('.imagePairing__rightItem').removeClass('is-correct-pair');
        this.$el.removeClass('show-correct-answer');
        // Restore user's submitted pairs view and marking
        this._refreshAssignmentUI();
        this.showMarking();
    }

    // Ensure interaction is only considered complete at the moment of submission
    onSubmit(e) {
        try {
            // Only now mark interaction complete so ButtonsView/QuestionModel proceed
            if (!this.model.get('_isInteractionComplete')) {
                this.model.set('_isInteractionComplete', true);
            }
        } catch (_) { /* no-op */
        }
        // Defer to parent to handle marking, scoring, completion and disabling
        return super.onSubmit(e);
    }

    onCannotSubmit() {
        // Simple visual hint: shake unmatched targets or add an aria-live message
        const allAssigned = this.model.canSubmit ? this.model.canSubmit() : this.model.isAllAssigned();
        if (!allAssigned) {
            // Highlight right items without assignment
            const assignments = this.model.get('_assignments') || {};
            this.$rightList.find('.imagePairing__rightItem').each(function () {
                const id = this.getAttribute('data-right-id');
                if (!Object.values(assignments).includes(id)) {
                    this.classList.add('needs-assignment');
                    setTimeout(() => this.classList.remove('needs-assignment'), 600);
                }
            });
        }
    }

    _unassign(leftId) {
        const assignments = {...(this.model.get('_assignments') || {})};
        if (assignments[leftId]) {
            delete assignments[leftId];
            this.model.setUserAnswer(assignments);
            // Re-evaluate submit availability; interaction completeness now handled on submit
            if (typeof this.model.checkCanSubmit === 'function') this.model.checkCanSubmit();
            this._refreshAssignmentUI();
        }
    }
}

ImagePairingView.template = 'imagePairing';

export default ImagePairingView;
