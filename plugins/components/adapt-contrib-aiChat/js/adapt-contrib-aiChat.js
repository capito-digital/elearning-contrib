import components from 'core/js/components';
import AiChatView from './aiChatView';
import AiChatModel from './aiChatModel';

export default components.register('aiChat', {
    view: AiChatView,
    model: AiChatModel
});