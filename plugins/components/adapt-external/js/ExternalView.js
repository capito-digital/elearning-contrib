import ComponentView from 'core/js/views/componentView';

class ExternalView extends ComponentView {
    postRender() {
        // Nothing special beyond rendering body content
        this.setReadyStatus();
        this.setupInview();
    }

    setupInview() {
        const selector = this.getInviewElementSelector();
        if (!selector) return this.setCompletionStatus();
        this.setupInviewCompletion(selector);
    }

    getInviewElementSelector() {
        return '.component__body';
    }
}

// Link to the template in this component's templates folder
ExternalView.template = 'external.jsx';

export default ExternalView;
