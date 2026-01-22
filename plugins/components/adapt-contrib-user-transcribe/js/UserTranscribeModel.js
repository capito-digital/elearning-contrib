import ComponentModel from 'core/js/models/componentModel';

export default class UserTranscribeModel extends ComponentModel {
    defaults() {
        return {
            ...super.defaults(),
            _component: 'user-transcribe',
            title: '',
            displayTitle: '',
            body: '',
            instruction: '',
            _options: []
        };
    }
}