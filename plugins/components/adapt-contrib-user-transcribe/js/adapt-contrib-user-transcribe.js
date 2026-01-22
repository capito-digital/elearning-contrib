import UserTranscribeModel from "./UserTranscribeModel";
import UserTranscribeView from "./UserTranscribeView";
import components from 'core/js/components';

export default components.register('user-transcribe', {
    model: UserTranscribeModel,
    view: UserTranscribeView
});