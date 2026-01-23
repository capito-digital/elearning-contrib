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

        const userIdStr = this.userId ? this.userId : "anonymous";
        console.log('loading badges for course_id ' + this.courseId + ' and user_id "' + userIdStr + '"');

        let sessionToken = localStorage.getItem('capito_session_token');
        const headers = {
            'Accept': 'application/json'
        };
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        try {
            const response = await fetch(`${this.baseUrl}/public/v1/courses/${this.courseId}/badges/${userIdStr}`, {
                method: 'GET',
                headers: headers,
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Save token from response
            const newToken = response.headers.get('X-Session-Token');
            if (newToken) {
                localStorage.setItem('capito_session_token', newToken);
            }

            const data = await response.json();
            
            if (data.badges && data.badges.length > 0) {
                let html = '';
                html += '<p>Sie haben diesen Kurs bereits gemacht und dabei diese Abzeichen bekommen:</p>';

                data.badges.forEach(badge => {
                    const imgUrl = `assets/${badge.locale}_${badge.level}.png`;
                    html += `<div><img src="${imgUrl}"  alt="${badge.locale} ${badge.level}"/><span>${badge.language_name} - ${badge.level_label}</span></div>`;
                });
                html += '<p>Sie können den Kurs nochmal machen um noch mehr Abzeichen zu bekommen.</p>';
                let target = menuContainer[0].querySelector('.menu-item__details-inner');
                if (target) {
                    const badgesDiv = document.createElement('div');
                    badgesDiv.className = 'cs-badges';
                    badgesDiv.innerHTML = html;
                    target.insertBefore(badgesDiv, target.firstChild);
                }
            }
            this.badgesLoaded = true;
        } catch (error) {
            console.error('capitoBadgesView: Failed to load badges:', error);
        }
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
