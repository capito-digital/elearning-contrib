import Adapt from 'core/js/adapt';
import ComponentView from 'core/js/views/componentView';

export default class CapitoBadgesView extends ComponentView {

    className() {
        return 'extension';
    }

    initialize() {
        this.baseUrl = this.model.get('_baseUrl');
        this.courseId = this.model.get('_courseId');
        this.userId = this.model.get('_userId');

        this.badgesLoaded = false;

        // On initialize start the render process
        this.preRender();
        // this.render();
        Adapt.on('menuView:postReady', () => {
            this.loadBadges();
        })
        // Listen to Adapt 'remove' event which is called
        // when navigating through the router
        // This cleans up zombie views and prevents memory leaks
        this.listenTo(Adapt, 'remove', this.remove);

    }

    get template() {
        return 'capito-badge-dialog';
    }

    async loadBadges() {
        if (this.badgesLoaded) return;
        const menuContainer = document.getElementsByClassName('page-' + this.courseId);
        if (!menuContainer) {
            console.log('menuContainer not found');
            return;
        }

        const userIdStr = this.userId ? this.userId : "";
        console.log('loading badges for course_id ' + this.courseId + ' and user_id "' + userIdStr + '"');
        const response = await fetch(this.baseUrl + '/course-progress/' + this.courseId + '/badges/' + userIdStr, {
            method: 'GET',
            headers: {
                'Accept': 'text/html',
                'HX-Request': true,
            },
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        let target = menuContainer[0].querySelector('.menu-item__details-inner');
        target.innerHTML = html + target.innerHTML
        this.badgesLoaded = true;
    }

    events() {
        return {
            'click .clickableElement': 'onElementClicked'
        };
    }

    preRender() {
    }

    render() {
        // Convert model data into JSON
        const data = this.model.toJSON();
        // Get handlebars template
        const template = Handlebars.templates.extension;
        // Push data into template and append template
        this.$el.html(template(data)).appendTo('#wrapper');
        // Defer is used here to make sure the template has rendered
        // before calling postRender
        // This way postRender can manipulate this view after it has
        // been rendered
        _.defer(() => {
            this.postRender();
        });

        // Return this so we can change the render method
        // this.render().$el.addClass('explode');
        return this;

    }

    postRender() {
    }

}
