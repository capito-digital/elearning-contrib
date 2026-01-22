import QuestionModel from 'core/js/models/questionModel';
import Adapt from 'core/js/adapt';

class RoleplayModel extends QuestionModel {

    init() {
        super.init();
        this.set({
            _isEnabled: true,
            _isInteractionComplete: false,
            _isCorrect: undefined,
            _canShowCorrectness: false,
            _shouldShowMarking: false,
            _isLoading: false,
            _status: 'ONGOING',
            _messages: [], // { author: 'ASSISTANT'|'USER', text: string }
            _description: '',
            _genericInstruction: 'Geben Sie Ihre Antwort in der Ich-Form ein und bleiben Sie in der Situation. Halten Sie sich an das berufliche Szenario. Klicken Sie auf Senden, um fortzufahren.',
            _aiPersonaLabel: 'AI'
        });
    }

    async loadRoleplayInfo() {
        const courseId = this.get('_courseId');
        const roleplayId = this.get('_roleplayId');
        if (!courseId || !roleplayId) {
            console.error('Course ID or Roleplay ID not provided');
            return;
        }
        try {
            const baseUrl = this.getBaseUrl();
            const url = `${baseUrl}/roleplay?course_id=${encodeURIComponent(courseId)}&roleplay_id=${encodeURIComponent(roleplayId)}`;
            const resp = await fetch(url, {method: 'GET'});
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const messages = this.get('_messages').slice();
            if (data.start_message && data.start_message.text) {
                messages.push({author: 'ASSISTANT', text: data.start_message.text});
            }
            this.set({
                _description: data.description || '',
                _aiPersonaLabel: data.ai_persona_label || 'AI',
                _genericInstruction: data.generic_instruction || this.get('_genericInstruction'),
                _messages: messages
            });
            // this.trigger('change');
        } catch (e) {
            console.error('Failed to load roleplay info', e);
        }
    }

    async sendMessage(userMessage) {
        const courseId = this.get('_courseId');
        const roleplayId = this.get('_roleplayId');
        if (!userMessage.trim()) return;

        this.set('_isLoading', true);

        try {
            const baseUrl = this.getBaseUrl();
            const response = await fetch(`${baseUrl}/roleplay`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({course_id: courseId, roleplay_id: roleplayId, user_message: userMessage})
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            const messages = this.get('_messages').slice();
            messages.push({author: 'ASSISTANT', text: data.displayed_message});

            this.set({
                _messages: messages,
                _status: data.status || 'ONGOING',
                _isLoading: false,
                _isInteractionComplete: data.status === 'COMPLETED'
            });
            // this.trigger('change');

        } catch (error) {
            console.error('Error sending roleplay message:', error);
            const messages = this.get('_messages').slice();
            messages.push({author: 'ASSISTANT', text: `Fehler: ${error.message}`});
            this.set({_messages: messages, _isLoading: false});
        }
    }

    resetUserAnswer() {
        this.set({_userInput: ''});
    }

    getBaseUrl() {
        const globals = Adapt.course?.get('_globals') || {};
        return globals._dashboardBaseUrl || Adapt.config.dashboardBaseUrl || '';
    }
}

export default RoleplayModel;
