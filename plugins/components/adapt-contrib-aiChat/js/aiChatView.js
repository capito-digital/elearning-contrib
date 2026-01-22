import QuestionView from 'core/js/views/questionView';

class AiChatView extends QuestionView {

    events() {
        return {
            'click .js-aichat-button': 'onAiChatClick',
            'change .js-aichat-textarea': 'onTextareaChanged',
            'keyup .js-aichat-textarea': 'onTextareaChanged',
            'click .js-aichat-easier': 'onSelectEasier',
            'click .js-aichat-native': 'onSelectNative'
        };
    }

    setupQuestion() {
        // No special setup needed for AI chat
    }

    disableQuestion() {
        this.$('.js-aichat-button').prop('disabled', true);
    }

    enableQuestion() {
        this.$('.js-aichat-button').prop('disabled', false);
    }

    onQuestionRendered() {
        this.setReadyStatus();
    }

    // Handle textarea input changes
    onTextareaChanged(e) {
        const textareaValue = $(e.target).val();
        this.model.set('_userInput', textareaValue);
    }

    // Handle the AI chat button click
    async onAiChatClick(e) {
        e.preventDefault();

        if (this.model.get('_isLoading')) {
            return; // Prevent multiple clicks while loading
        }

        // Show loading state
        this.showLoadingState();

        // Make the API call
        await this.model.makeAiChatRequest();

        // Hide loading state and show response
        this.hideLoadingState();
        this.showAiResponse();
    }

    showLoadingState() {
        this.$('.js-aichat-button').prop('disabled', true);
        this.$('.js-aichat-loading').removeClass('is-hidden');
        this.$('.js-aichat-response').addClass('is-hidden');
    }

    hideLoadingState() {
        this.$('.js-aichat-button').prop('disabled', false);
        this.$('.js-aichat-loading').addClass('is-hidden');
    }

    showAiResponse() {
        const response = this.model.get('_aiResponse');
        this.$('.js-aichat-response-text').html(response);
        this.$('.js-aichat-response').removeClass('is-hidden');
    }

    onSelectEasier(e) {
        e.preventDefault();
        const chapterId = this.model.get('_chapterId');
        if (typeof window.selectContentPreference === 'function') {
            window.selectContentPreference('de', 'a2', chapterId);
        }
        document.querySelector('.trickle__back-btn').click()
    }

    onSelectNative(e) {
        e.preventDefault();
        const chapterId = this.model.get('_chapterId');
        if (typeof window.selectContentPreference === 'function') {
            window.selectContentPreference('bs', 'original', chapterId);
        }
        document.querySelector('.trickle__back-btn').click()
    }

    // This is important and should give the user feedback on how they answered the question
    showMarking() {
        // AI chat doesn't need traditional marking
        const isCorrect = this.model.get('_isCorrect');
        if (isCorrect) {
            this.$('.aichat__widget').addClass('is-correct');
        } else {
            this.$('.aichat__widget').addClass('is-incorrect');
        }
    }

    // Used by the question view to reset the look and feel of the component.
    resetQuestion() {
        this.$('.js-aichat-button').prop('disabled', false);
        this.$('.js-aichat-textarea').val('');
        this.$('.js-aichat-loading').addClass('is-hidden');
        this.$('.js-aichat-response').addClass('is-hidden');
        this.$('.js-aichat-response-text').html('');
        this.$('.aichat__widget').removeClass('is-correct is-incorrect');

        this.model.resetUserAnswer();
    }

    showCorrectAnswer() {
        // AI chat doesn't have a traditional "correct answer"
        this.showAiResponse();
    }

    hideCorrectAnswer() {
        // Nothing to hide for AI chat
    }

    // Blank method for question to fill out when the question cannot be submitted
    onCannotSubmit() {
        // AI chat automatically submits when response is received
    }

}

AiChatView.template = 'aichat.jsx';

export default AiChatView;