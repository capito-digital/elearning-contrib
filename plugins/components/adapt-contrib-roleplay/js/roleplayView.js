import QuestionView from 'core/js/views/questionView';

class RoleplayView extends QuestionView {
    events() {
        return {
            'click .js-roleplay-send': 'onSend',
            'change .js-roleplay-textarea': 'onTextareaChanged',
            'keyup .js-roleplay-textarea': 'onTextareaChanged'
        };
    }

    setupQuestion() {
    }

    disableQuestion() {
        this.$('.js-roleplay-send').prop('disabled', true);
        this.$('.js-roleplay-textarea').prop('disabled', true);
    }

    enableQuestion() {
        this.$('.js-roleplay-send').prop('disabled', false);
        this.$('.js-roleplay-textarea').prop('disabled', false);
    }

    onQuestionRendered() {
        this.listenTo(this.model, 'change:_messages', this.renderMessages);
        this.model.loadRoleplayInfo();
        this.setReadyStatus();
        // initial render
        this.renderMessages();
    }

    onTextareaChanged(e) {
        const v = (e.target.value || '');
        this.model.set('_userInput', v);
    }

    async onSend(e) {
        e.preventDefault();
        if (this.model.get('_isLoading')) return;

        const text = (this.model.get('_userInput') || '').trim();
        if (!text) return;

        // push user message into UI immediately
        const messages = this.model.get('_messages').slice();
        messages.push({author: 'USER', text});
        this.model.set({_messages: messages, _userInput: ''});
        this.renderMessages();

        this.showLoadingState();
        await this.model.sendMessage(text);
        document.getElementById('roleplay-component-textarea').value = '';
        this.hideLoadingState();
        this.renderMessages();
    }

    showLoadingState() {
        this.$('.js-roleplay-send').prop('disabled', true);
        this.$('.js-roleplay-loading').removeClass('is-hidden');
    }

    hideLoadingState() {
        this.$('.js-roleplay-send').prop('disabled', false);
        this.$('.js-roleplay-loading').addClass('is-hidden');
    }

    renderMessages() {
        const list = this.$('.js-roleplay-messages');
        const msgs = this.model.get('_messages') || [];
        const aiLabel = this.model.get('_aiPersonaLabel') || 'AI';
        list.empty();
        msgs.forEach(m => {
            const isUser = m.author === 'USER';
            const side = isUser ? 'user' : 'ai';
            const label = isUser ? 'Sie' : aiLabel;
            const item = $(`
        <div class="roleplay__message roleplay__message--${side}">
          <div class="roleplay__label">${this.escapeHtml(label)}</div>
          <div class="roleplay__bubble">${this.escapeHtml(m.text)}</div>
        </div>`);
            list.append(item);
        });
        const scroller = this.$('.js-roleplay-scroller');
        scroller.scrollTop(scroller.prop('scrollHeight'));
    }

    escapeHtml(text) {
        return String(text).replace(/[&<>"]+/g, function (s) {
            const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'};
            return map[s] || s;
        });
    }
}

RoleplayView.template = 'roleplay.jsx';

export default RoleplayView;
