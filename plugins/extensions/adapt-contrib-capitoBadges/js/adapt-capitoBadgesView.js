import Adapt from 'core/js/adapt';
import ComponentView from 'core/js/views/componentView';

export default class CapitoBadgesView extends ComponentView {

    className() {
        return 'extension';
    }

    initialize() {
        this.courseId = this.model.get('_courseId');

        // On initialize start the render process
        this.preRender();
        // Listen to Adapt 'remove' event which is called
        // when navigating through the router
        // This cleans up zombie views and prevents memory leaks
        this.listenTo(Adapt, 'remove', this.remove);

    }

    get template() {
        return 'capito-badge-dialog';
    }

    clearRenderedBadges() {
        const menuContainers = document.getElementsByClassName(`page-course-id-${this.courseId}`);
        if (!menuContainers || menuContainers.length === 0) {
            return;
        }

        Array.from(menuContainers).forEach((menuContainer) => {
            const existing = menuContainer.querySelectorAll('.cs-badges-container');
            existing.forEach((node) => node.remove());
        });
    }

    renderBadges(pages) {
        const menuContainers = document.getElementsByClassName(`page-course-id-${this.courseId}`);
        if (!menuContainers || menuContainers.length === 0) {
            console.log('no menuContainers found');
            return;
        }
        this.clearRenderedBadges();

        // Build HTML only if there is at least one badge across all pages
        const totalBadges = pages.reduce((sum, p) => sum + (Array.isArray(p.badges) ? p.badges.length : 0), 0);
        let badges_per_page_disabled = pages.length === 1 && !pages[0].page_id;
        let base_html = badges_per_page_disabled
            ? '<p>Sie haben diesen Kurs bereits gemacht und dabei diese Abzeichen bekommen:</p>'
            : '<p>Sie haben diesen Teil des Kurses bereits gemacht und dabei diese Abzeichen bekommen:</p>';

        if (totalBadges <= 0) {
            return;
        }

        const style = `
            <style>
                .cs-badges-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
                .cs-badge { display: flex; flex-direction: column; align-items: center; text-align: center; }
                .cs-badge img { min-width: auto; width: auto; height: auto; max-height: 120px; display: block; }
                @media (max-width: 900px) { .cs-badges-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
                @media (max-width: 600px) { .cs-badges-grid { grid-template-columns: repeat(1, minmax(0, 1fr)); } }
            </style>
        `;
        pages.forEach(page => {
            const badges = Array.isArray(page.badges) ? page.badges : [];
            if (badges.length === 0) {
                return;
            }

            let html = style + base_html;

            html += '<div class="cs-badges-grid">';
            badges.forEach(badge => {
                const imgUrl = `assets/${badge.locale}_${badge.level}.png`;
                html += `<div class="cs-badge"><img src="${imgUrl}"  alt="${badge.locale} ${badge.level}"/><span>${badge.language_name} - ${badge.level_label}</span></div>`;
            });
            html += '</div>';
            const target = badges_per_page_disabled
                ? document.getElementsByClassName("boxmenu__header-inner")[0]?.lastChild
                : Array.from(menuContainers).find((el) =>
                    el.classList.contains(`page-id-${page.page_id}`)
                )?.querySelector('.boxmenu-item__progress');
            if (target == null)
                return

            let more_badges_possible = badges.filter(badge => badge.level == "gold" && badge.locale == "de").length == 0;
            if (more_badges_possible) {
                html += '<p>Sie können den Kurs nochmal machen um noch mehr Abzeichen zu bekommen.</p>';
            }
            if (target) {
                const badgesDiv = document.createElement('div');
                badgesDiv.className = 'cs-badges-container';
                badgesDiv.innerHTML = html;
                if(badges_per_page_disabled) {
                    target.after(badgesDiv);
                } else {
                    target.insertBefore(badgesDiv, target.firstChild);
                }
            } else {
                console.error('capitoBadgesView: Failed to find target element for badges:', page.id);
            }
        });
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
