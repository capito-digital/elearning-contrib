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
        const menuContainers = document.getElementsByClassName(`page-course-id-${this.courseId}`);
        if (!menuContainers || menuContainers.length === 0) {
            console.log('no menuContainers found');
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

            // New response shape: { pages: [{ page_id, page_title, badges: [...] }] }
            const pages = Array.isArray(data.pages) ? data.pages : [];

            // Build HTML only if there is at least one badge across all pages
            const totalBadges = pages.reduce((sum, p) => sum + (Array.isArray(p.badges) ? p.badges.length : 0), 0);
            let badges_per_page_disabled = pages.length === 1 && !pages[0].page_id;
            let base_html = badges_per_page_disabled
                ? '<p>Sie haben diesen Kurs bereits gemacht und dabei diese Abzeichen bekommen:</p>'
                : '<p>Sie haben diesen Teil des Kurses bereits gemacht und dabei diese Abzeichen bekommen:</p>';

            if (totalBadges > 0) {
                pages.forEach(page => {
                    const badges = Array.isArray(page.badges) ? page.badges : [];
                    if (badges.length === 0) {
                        return;
                    }

                    let html = base_html;

                    html += '<div class="cs-badges">';
                    badges.forEach(badge => {
                        const imgUrl = `assets/${badge.locale}_${badge.level}.png`;
                        html += `<div><img src="${imgUrl}"  alt="${badge.locale} ${badge.level}"/><span>${badge.language_name} - ${badge.level_label}</span></div>`;
                    });
                    html += '</div>';
                    const target = badges_per_page_disabled
                        ? document.getElementsByClassName("menu__item-container boxmenu__item-container")[0]
                        : Array.from(menuContainers).filter((el) =>
                            el.classList.contains(`page-id-${page.id}`)
                        )[0].firstChild;

                    let more_badges_possible = badges.filter(badge => badge.level == "gold" && badge.locale == "Deutsch").length == 0;
                    if (more_badges_possible) {
                        html += '<p>Sie können den Kurs nochmal machen um noch mehr Abzeichen zu bekommen.</p>';
                    }
                    if (target) {
                        const badgesDiv = document.createElement('div');
                        badgesDiv.className = 'cs-badges';
                        badgesDiv.innerHTML = html;
                        target.insertBefore(badgesDiv, target.firstChild);
                    } else {
                        console.error('capitoBadgesView: Failed to find target element for badges:', page.id);
                    }
                });

                console.log(menuContainers)

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
