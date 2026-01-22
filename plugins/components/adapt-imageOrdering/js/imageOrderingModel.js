import QuestionModel from 'core/js/models/questionModel';

class ImageOrderingModel extends QuestionModel {
    init() {
        super.init();

        const normalizedItems = this._normalizeItems();

        // Correct order is the original order of provided items
        const correctOrder = normalizedItems.map((it) => it.id);

        // Start with a shuffled order for display
        const order = correctOrder.slice();
        this._shuffle(order);

        this.set({
            _items: normalizedItems,
            _correctOrder: correctOrder, // array of ids
            _order: order,               // current array of ids
            _itemCorrectness: [],        // boolean per index (filled on submit)
            _isInteractionComplete: false,
            _isComplete: false,
            _isCorrect: undefined,
            _maxScore: normalizedItems.length
        });

        this._ensureButtonsAndDefaults();
    }

    _normalizeItems() {
        // Accept `items` or legacy arrays `image_left` (treated as items)
        const items = this.get('items') || this.get('_items') || this.get('image_left') || [];
        const out = [];
        items.forEach((raw, i) => {
            const norm = this._normalizeEntry(raw);
            out.push({
                id: norm.id || `I-${i}`,
                type: norm.type,
                value: norm.value,
                alt: norm.alt || '',
                correctIndex: i
            });
        });
        return out;
    }

    _normalizeEntry(entry) {
        if (!entry && entry !== 0) return {type: 'text', value: ''};
        if (typeof entry === 'string') {
            const looksLikeUrl = /(\.png|\.jpe?g|\.gif|\.webp|\.svg)(\?.*)?$/i.test(entry) || /^(https?:)?\/\//i.test(entry);
            return looksLikeUrl ? {type: 'image', value: entry} : {type: 'text', value: entry};
        }
        if (entry.image) return {type: 'image', value: entry.image, alt: entry.alt, id: entry.id};
        if (entry.text || entry.text === '') return {type: 'text', value: entry.text, id: entry.id};
        return {type: 'text', value: String(entry)};
    }

    // Public API used by the view
    setUserAnswer(orderIds) {
        // orderIds is an array of item ids in their current order
        this.set({_order: orderIds.slice()});
    }

    getUserAnswer() {
        return this.get('_order');
    }

    // Persistence helpers
    storeUserAnswer() {
        // store as array of indices relative to correct order for compactness
        const order = this.get('_order') || [];
        const correct = this.get('_correctOrder') || [];
        const indexArray = order.map(id => Math.max(0, correct.indexOf(id)));
        this.set('_userAnswer', indexArray);
    }

    restoreUserAnswers() {
        const saved = this.get('_userAnswer');
        if (Array.isArray(saved) && saved.length) {
            const correct = this.get('_correctOrder') || [];
            const order = saved.map(i => correct[i]).filter(Boolean);
            if (order.length === correct.length) this.set('_order', order);
        }
    }

    resetUserAnswer() {
        // Reset to a fresh shuffle
        const correct = (this.get('_correctOrder') || []).slice();
        this._shuffle(correct);
        this.set({
            _order: correct,
            _itemCorrectness: [],
            _isInteractionComplete: false,
            _isComplete: false,
            _isCorrect: undefined
        });
    }

    _ensureButtonsAndDefaults() {
        const defaults = {
            _canShowModelAnswer: true,
            _canShowFeedback: true,
            _canShowMarking: true,
            _shouldDisplayAttempts: false,
            _questionWeight: 1,
            _recordInteraction: true,
            _attempts: 1
        };
        Object.keys(defaults).forEach(k => {
            if (this.get(k) === undefined) this.set(k, defaults[k]);
        });
        if (!this.get('_buttons')) {
            this.set('_buttons', {
                _submit: {buttonText: 'Submit', ariaLabel: 'Submit'},
                _reset: {buttonText: 'Reset', ariaLabel: 'Reset'},
                _showCorrectAnswer: {buttonText: 'Show Correct Answer', ariaLabel: 'Show correct answer'},
                _hideCorrectAnswer: {buttonText: 'Hide Correct Answer', ariaLabel: 'Hide correct answer'},
                _showFeedback: {buttonText: 'Show Feedback', ariaLabel: 'Show feedback'},
                remainingAttemptsText: 'attempts remaining',
                remainingAttemptText: 'final attempt',
                disabledAriaLabel: 'This button is disabled at the moment'
            });
        }
    }

    canSubmit() {
        // Always can submit as the list is complete; defer to base for attempts etc.
        return true;
    }

    isCorrect() {
        const order = this.get('_order') || [];
        const correct = this.get('_correctOrder') || [];
        if (order.length !== correct.length) return false;
        return order.every((id, i) => id === correct[i]);
    }

    setScore() {
        const order = this.get('_order') || [];
        const correct = this.get('_correctOrder') || [];
        const items = this.get('_items') || [];
        const idToIndex = {};
        correct.forEach((id, idx) => idToIndex[id] = idx);
        const correctness = order.map((id, i) => id === correct[i]);
        const correctCount = correctness.filter(Boolean).length;
        this.set({_score: correctCount, _maxScore: items.length, _itemCorrectness: correctness});
    }

    _shuffle(array) {
        array.sort(() => Math.random() - 0.5);
    }
}

export default ImageOrderingModel;
