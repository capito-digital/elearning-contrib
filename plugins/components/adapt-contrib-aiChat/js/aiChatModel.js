import QuestionModel from 'core/js/models/questionModel';
import Adapt from 'core/js/adapt';

class AiChatModel extends QuestionModel {

    init() {
        super.init();

        this.set({
            _isEnabled: true,
            _isInteractionComplete: false,
            _isCorrect: undefined,
            _canShowCorrectness: false,
            _shouldShowMarking: false,
            _aiResponse: '',
            _isLoading: false,
            _showFeedbackOptions: false
        });
        this.listenTo(Adapt, 'contentSelector:selectionChanged', this.onContentSelectorChanged);
        this.listenTo(Adapt, 'blockNavigation:initialized', ({instance}) => {
            if (instance?.currentSelection) this.onContentSelectorChanged(instance.currentSelection);
        });
        const currentSelection = Adapt.blockNavigation?.currentSelection;
        if (currentSelection) this.onContentSelectorChanged(currentSelection);
        const storedSelection = Adapt.get('_contentSelectorSelection');
        if (storedSelection) this.onContentSelectorChanged(storedSelection);
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

    // Make API call to the AI chat endpoint
    async makeAiChatRequest() {
        const questionId = this.get('_questionId');
        const courseId = this.get('_courseId');
        const baseUrl = this.get('_baseUrl');

        if (!courseId || !questionId) {
            console.error('Course ID or Question ID not provided');
            return;
        }

        // Get the content of the textarea
        const textareaContent = this.get('_userInput') || '';

        this.set('_isLoading', true);
        try {
            const requestBody = {
                course_id: courseId,
                question_id: questionId,
                message: textareaContent,
                locale: this._locale || 'de',
                proficiency: this._proficiency || 'original'
            };

            let sessionToken = this.getSessionToken();
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            if (sessionToken) {
                headers['X-Session-Token'] = sessionToken;
            }

            const response = await fetch(`${baseUrl}/public/v1/ai-chat`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Save token from response
            const newToken = response.headers.get('X-Session-Token');
            if (newToken) {
                this.persistSessionToken(newToken);
            }

            const data = await response.json();
            const evaluation = data['evaluation'] ? parseInt(data['evaluation']) : 5;
            const showFeedback = (evaluation <= 2);
            this.set({
                '_aiResponse': data.message.text,
                '_isInteractionComplete': !showFeedback,
                '_isCorrect': !showFeedback,
                '_isSubmitted': true,
                '_isComplete': true,
                '_isLoading': false,
                '_showFeedbackOptions': showFeedback
            });
            // Trigger completion
            this.setCompletionStatus();

        } catch (error) {
            console.error('Error making AI chat request:', error);
            this.set({
                '_aiResponse': `Error: ${error.message}`,
                '_isInteractionComplete': true,
                '_isComplete': true,
                '_isSubmitted': true,
                '_isCorrect': false,
                '_isLoading': false
            });
        }
    }

    onContentSelectorChanged(payload) {
        const locale = (payload?.locale || '').toLowerCase();
        const proficiency = (payload?.proficiency || '').toLowerCase();
        if (locale) this._locale = locale;
        if (proficiency) this._proficiency = proficiency;
    }

    // Override parent methods that aren't needed for AI chat
    setupRandomisation() {
        // No randomization needed for AI chat
    }

    restoreUserAnswers() {
        // No user answers to restore for AI chat
    }

    resetUserAnswer() {
        this.set({
            '_aiResponse': '',
            '_isInteractionComplete': false,
            '_isCorrect': undefined,
            '_isLoading': false,
            '_userInput': ''
        });
    }

    getResponse() {
        return this.get('_aiResponse');
    }

    getResponseType() {
        return 'ai-chat';
    }

    setScore() {
        // AI chat is always considered complete when response is received
        const score = this.get('_isInteractionComplete') ? this.get('_questionWeight') : 0;
        this.set('_score', score);
    }
}

export default AiChatModel;
