import QuestionModel from 'core/js/models/questionModel';

class ImagePairingModel extends QuestionModel {
    init() {
        super.init();

        const normalizedPairs = this._normalizePairs();

        // Build items for left and right lists, each referencing the same pairId
        const leftItems = normalizedPairs.map((p, index) => ({
            id: `L-${index}`,
            pairId: p.id,
            type: p.left.type,
            value: p.left.value,
            alt: p.left.alt || '',
            isUnmatched: false
        }));

        const rightItems = normalizedPairs.map((p, index) => ({
            id: `R-${index}`,
            pairId: p.id,
            type: p.right.type,
            value: p.right.value,
            alt: p.right.alt || ''
        }));

        // Optional unmatched-left items: renderable on the left but never correct
        const extraLeftRaw = this.get('unmatchedLeft') || this.get('unmatched_left_items') || [];
        const extraLeft = Array.isArray(extraLeftRaw) ? extraLeftRaw.map(s => this._normalizeSide(s)) : [];
        const baseLeftCount = leftItems.length;
        extraLeft.forEach((item, i) => {
            leftItems.push({
                id: `L-${baseLeftCount + i}`,
                pairId: null,
                type: item.type,
                value: item.value,
                alt: item.alt || '',
                isUnmatched: true
            });
        });

        // Build correct mapping: left pairId -> right pairId (same)
        const correctPairs = {};
        normalizedPairs.forEach((p) => {
            correctPairs[p.id] = p.id;
        });

        this.shuffle(leftItems)
        this.shuffle(rightItems)

        this.set({
            _pairs: normalizedPairs,
            _leftItems: leftItems,
            _rightItems: rightItems,
            _assignments: {}, // leftId -> rightId
            _correctPairs: correctPairs,
            _isInteractionComplete: false,
            _isComplete: false,
            _isCorrect: undefined,
            _maxScore: rightItems.length
        });

        this._ensureButtonsAndDefaults();
    }

    _normalizePairs() {
        // Preferred config: pairs: [{ left: {image|text}, right: {image|text} }]
        const pairs = this.get('pairs');
        if (Array.isArray(pairs) && pairs.length) {
            return pairs.map((p, i) => ({
                id: p.id || `P-${i}`,
                left: this._normalizeSide(p.left),
                right: this._normalizeSide(p.right)
            }));
        }

        // Alternate config: image_left[], image_right[]; entries can be string (image URL) or {text: ''} or {image: ''}
        const leftArr = this.get('image_left') || [];
        const rightArr = this.get('image_right') || [];
        const len = Math.min(leftArr.length, rightArr.length);
        const out = [];
        for (let i = 0; i < len; i++) {
            out.push({
                id: `P-${i}`,
                left: this._normalizeSide(leftArr[i]),
                right: this._normalizeSide(rightArr[i])
            });
        }
        return out;
    }

    _normalizeSide(side) {
        if (!side && side !== 0) return {type: 'text', value: ''};
        if (typeof side === 'string') {
            // Assume string is image URL by default
            const looksLikeUrl = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(side) || /^(https?:)?\/\//i.test(side);
            return looksLikeUrl ? {type: 'image', value: side} : {type: 'text', value: side};
        }
        if (side.image) return {type: 'image', value: side.image, alt: side.alt};
        if (side.text || side.text === '') return {type: 'text', value: side.text};
        return {type: 'text', value: String(side)};
    }

    setUserAnswer(assignments) {
        // assignments is object leftId -> rightId
        this.set({_assignments: {...assignments}});
    }

    getUserAnswer() {
        // Return the internal assignments object
        return this.get('_assignments');
    }

    /**
     * Convert the internal assignments object into an array of numeric pairs
     * suitable for SCORM/xAPI suspend data storage. Example:
     * { "L-0": "R-1", "L-1": "R-0" } -> [ [0,1], [1,0] ]
     */
    _serializeAssignments(assignments = this.get('_assignments') || {}) {
        const pairs = [];
        for (const [leftId, rightId] of Object.entries(assignments)) {
            if (!leftId || !rightId) continue;
            const li = Number(String(leftId).split('-')[1]);
            const ri = Number(String(rightId).split('-')[1]);
            if (Number.isFinite(li) && Number.isFinite(ri)) pairs.push([li, ri]);
        }
        return pairs;
    }

    /**
     * Convert stored numeric pairs back into the assignments object.
     * [ [0,1], [1,0] ] -> { "L-0": "R-1", "L-1": "R-0" }
     */
    _deserializeUserAnswer(pairs) {
        const assignments = {};
        if (!Array.isArray(pairs)) return assignments;
        for (const pair of pairs) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const [li, ri] = pair;
            if (!Number.isFinite(li) || !Number.isFinite(ri)) continue;
            assignments[`L-${li}`] = `R-${ri}`;
        }
        return assignments;
    }

    storeUserAnswer() {
        // Persist current assignments in a suspend-data friendly format
        // SCORM suspend data only supports arrays of numbers/booleans/arrays
        // so we store an array of [leftIndex, rightIndex] numeric pairs
        const serialized = this._serializeAssignments();
        this.set('_userAnswer', serialized);
    }

    restoreUserAnswers() {
        const user = this.get('_userAnswer');
        // Support both the new numeric-pairs array and the legacy object mapping
        const assignments = Array.isArray(user)
            ? this._deserializeUserAnswer(user)
            : ({...(user || {})});
        this.set('_assignments', assignments);
    }

    resetUserAnswer() {
        this.set({
            _assignments: {},
            _isInteractionComplete: false,
            _isComplete: false,
            _isCorrect: undefined
        });
    }

    _ensureButtonsAndDefaults() {
        // Default question behaviours
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

        // ADD: Set up button text configuration required by ButtonsView
        if (!this.get('_buttons')) {
            this.set('_buttons', {
                _submit: {
                    buttonText: 'Submit',
                    ariaLabel: 'Submit'
                },
                _reset: {
                    buttonText: 'Reset',
                    ariaLabel: 'Reset'
                },
                _showCorrectAnswer: {
                    buttonText: 'Show Correct Answer',
                    ariaLabel: 'Show correct answer'
                },
                _hideCorrectAnswer: {
                    buttonText: 'Hide Correct Answer',
                    ariaLabel: 'Hide correct answer'
                },
                _showFeedback: {
                    buttonText: 'Show Feedback',
                    ariaLabel: 'Show feedback'
                },
                remainingAttemptsText: 'attempts remaining',
                remainingAttemptText: 'final attempt',
                disabledAriaLabel: 'This button is disabled at the moment'
            });
        }
    }

    isAllAssigned() {
        // Only require that all RIGHT items have exactly one left assigned
        const rightItems = this.get('_rightItems') || [];
        const assignments = this.get('_assignments') || {};
        const assignedRights = new Set(Object.values(assignments));
        // every right must be assigned
        return rightItems.every(r => assignedRights.has(r.id));
    }

    canSubmit() {
        return this.isAllAssigned();
    }

    isCorrect() {
        // Correct if every RIGHT item has a left assigned and pairIds match
        const rightItems = this.get('_rightItems') || [];
        const leftById = {};
        (this.get('_leftItems') || []).forEach(l => leftById[l.id] = l);
        const assignments = this.get('_assignments') || {};

        for (const right of rightItems) {
            // find left assigned to this right
            const leftId = Object.keys(assignments).find(k => assignments[k] === right.id);
            if (!leftId) return false;
            const left = leftById[leftId];
            if (!left || right.pairId !== left.pairId) return false;
        }
        return true;
    }

    shuffle(array) {
        // not ideal, since some permutations are preferred, but good enough
        array.sort(() => Math.random() - 0.5);
    }

    // QuestionModel will call markQuestion which uses isCorrect/setScore/storeUserAnswer
    // keep evaluate unused to avoid double handling

    setScore() {
        // Partial scoring: number of right tiles correctly paired
        const rightItems = this.get('_rightItems') || [];
        const leftById = {};
        (this.get('_leftItems') || []).forEach(l => leftById[l.id] = l);
        const assignments = this.get('_assignments') || {};

        let correctCount = 0;
        for (const right of rightItems) {
            const leftId = Object.keys(assignments).find(k => assignments[k] === right.id);
            if (!leftId) continue;
            const left = leftById[leftId];
            if (left && right.pairId === left.pairId) correctCount += 1;
        }
        this.set({_score: correctCount, _maxScore: rightItems.length});
    }
}

export default ImagePairingModel;
