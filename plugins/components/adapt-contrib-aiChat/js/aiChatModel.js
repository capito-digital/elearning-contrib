import QuestionModel from 'core/js/models/questionModel';

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
    }

    // Make API call to the AI chat endpoint
    async makeAiChatRequest() {
        const courseId = this.get('_courseId');
        const questionId = this.get('_questionId');
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
                user_message: textareaContent
            };

            const response = await fetch(`${baseUrl}/ai-chat/course/${courseId}/question/${questionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const evaluation = parseInt(data['evaluation']);
            const showFeedback = (evaluation <= 2);
            this.set({
                '_aiResponse': data['text'],
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