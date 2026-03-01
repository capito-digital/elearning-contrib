import Adapt from 'core/js/adapt';
// import Backbone from 'backbone';
import location from 'core/js/location';
import CapitoBadgesView from './adapt-capitoBadgesView';

class CapitoBadges extends Backbone.Controller {
    initialize() {
        // Listen to when the data is all loaded
        this.listenTo(Adapt, 'app:dataReady', this.onDataReady);
        // Keep track of current selection (locale, proficiency)
        this.currentSelection = {locale: 'de', proficiency: 'original'};
        // Listen to selection changes emitted by ContentSelectorView
        this.listenTo(Adapt, 'contentSelector:selectionChanged', this.onSelectionChanged);
        // Cache assessment results when an assessment completes
        this.listenTo(Adapt, 'assessments:complete', this.onAssessmentComplete);
        // Submit cached data when the user completes the course flow via blockNavigation
        this.listenTo(Adapt, 'blockNavigation:complete', this.onBlockNavigationComplete);

    }

    getConfig() {
        // Access the extension's config from course.json
        return Adapt.course.get('_capitoBadges') || {};
    }

    getGlobalConfig() {
        const globals = Adapt.course?.get('_globals');
        return globals || {};
    }

    showView() {
        const config = this.getGlobalConfig();
        config['_userId'] = this.getUserId();
        config['_userName'] = this.getUserDisplayName();
        config['_baseUrl'] = this.getGlobalConfig()['_dashboardBaseUrl'];
        config['_courseId'] = this.getGlobalConfig()['_courseId'];
        const view = new CapitoBadgesView({
            model: new Backbone.Model(config)
        });
    }

    loadEarnedBadges() {
        const config = this.getConfig();
        const baseUrl = config._baseUrl;

        console.log('Base URL:', baseUrl);
        // Use baseUrl for your API calls
    }

    onDataReady() {
        console.log('Plugin has loaded and data is ready');
        this.showView();
        this.loadEarnedBadges();
        this.courseId = this.getGlobalConfig()['_courseId']
    }

    onSelectionChanged(payload) {
        if (!payload) return;
        this.currentSelection = {
            locale: (payload.locale || 'de').toLowerCase(),
            proficiency: (payload.proficiency || 'original').toLowerCase()
        };
    }

    onAssessmentComplete(stateObject) {
        // Send chapter progress as soon as the assessment completes
        try {
            const trackingData = this.gatherAssessmentTrackingData(stateObject);
            this.sendTrackingData(trackingData, {complete: false});
            console.log('capitoBadges: sent chapter assessment results');
        } catch (e) {
            console.error('capitoBadges: failed to submit assessment data', e);
        }
    }

    onBlockNavigationComplete() {
        // Submit completion flag when the user clicks "Abschließen"
        try {
            const trackingData = this.buildCompletionTrackingData();
            this.sendTrackingData(trackingData, {complete: true});
        } catch (e) {
            console.error('capitoBadges: failed to submit on blockNavigation:complete', e);
        }
    }

    /**
     * @typedef {"1.2" | "2004"} ScormVersion
     */

    /**
     * @typedef {{ LMSGetValue(key: string): string }} Scorm12Api
     */

    /**
     * @typedef {{ GetValue(key: string): string }} Scorm2004Api
     */

    /**
     * @typedef {{ api: Scorm12Api, version: "1.2" } | { api: Scorm2004Api, version: "2004" }} ScormApiFound
     */

    /**
     * Find the SCORM runtime API in the current window/frame hierarchy.
     * Works for both SCORM 1.2 (API) and SCORM 2004 (API_1484_11).
     * @param {Window} win
     * @returns {ScormApiFound | null}
     */
    findScormApi(win = window) {
        const maxDepth = 50;
        let cur = win;

        for (let i = 0; i < maxDepth; i++) {
            try {
                if (cur?.API_1484_11) return {api: cur.API_1484_11, version: "2004"};
                if (cur?.API) return {api: cur.API, version: "1.2"};

                if (cur?.parent && cur.parent !== cur) cur = cur.parent;
                else break;
            } catch (e) {
                break;
            }
        }

        // sometimes it’s in the opener
        try {
            if (win.opener) return this.findScormApi(win.opener);
        } catch (e) {
            // ignore cross-origin / access errors
        }

        return null;
    }

    /**
     * Get a value from SCORM (either 1.2 or 2004). Returns null if missing/empty.
     * @param {string} key
     * @param {Window} win
     * @returns {string | null}
     */
    scormGet(key, win = window) {
        const found = this.findScormApi(win);
        if (!found) return null;

        const value = found.version === "2004"
            ? found.api.GetValue(key)
            : found.api.LMSGetValue(key);

        return value === "" ? null : value;
    }

    getUserId() {
        try {
            // Prefer SCORM 2004, fallback to SCORM 1.2
            return this.scormGet("cmi.learner_id") ?? this.scormGet("cmi.core.student_id") ?? undefined;
        } catch (err) {
            console.log("SCORM not available, either in anonymous course, or not in SCORM mode.");
        }
        return undefined;
    }

    getUserDisplayName() {
        try {
            // Prefer SCORM 2004, fallback to SCORM 1.2
            return this.scormGet("cmi.learner_name") ?? this.scormGet("cmi.core.student_name") ?? undefined;
        } catch (err) {
            console.log("SCORM not available, either in anonymous course, or not in SCORM mode.");
        }
        return undefined;
    }

    getCurrentPageId() {
        const pageId = location?._contentType === 'page' ? location._currentId : location?._lastVisitedPage;
        return typeof pageId === 'string' ? pageId.replace(/^page-/, '') : pageId;
    }

    gatherAssessmentTrackingData(stateObject) {
        const pageId = stateObject?.pageId;
        const pageIdValue = typeof pageId === 'string' ? pageId.replace(/^page-/, '') : pageId;
        const trackingData = {
            assessmentId: stateObject?.id,
            score: stateObject?.score,
            scoreAsPercent: stateObject?.scoreAsPercent,
            maxScore: stateObject?.maxScore,
            isPass: stateObject?.isPass,
            assessmentWeight: stateObject?.assessmentWeight,
            attempts: stateObject?.attempts,
            questions: [],
            locale: this.currentSelection?.locale,
            proficiency: this.currentSelection?.proficiency,
            course_id: this.courseId,
            page_id: pageIdValue,
            user_id: this.getUserId(),
            user_name: this.getUserDisplayName()
        };

        // Gather question-level data
        if (stateObject?.questions && stateObject?.questionModels) {
            const questions = stateObject.questions;
            const questionModels = stateObject.questionModels.models || [];
            const questionMap = new Map();

            questions.forEach((question, idx) => {
                const questionModel = questionModels[idx];
                if (questionModel) {
                    const questionId = questionModel.get('_questionId') || questionModel.get('_id');
                    const questionData = {
                        questionId,
                        componentId: questionModel.get('_id'),
                        componentType: questionModel.get('_component'),
                        isCorrect: question._isCorrect,
                        score: question.score || 0,
                        maxScore: question.maxScore || 0
                    };
                    if (questionId) {
                        questionMap.set(questionId, questionData);
                    }
                }
            });
            trackingData.questions = Array.from(questionMap.values());
        }
        return trackingData;
    }

    buildCompletionTrackingData() {
        return {
            questions: [],
            locale: this.currentSelection?.locale,
            proficiency: this.currentSelection?.proficiency,
            course_id: this.courseId,
            user_id: this.getUserId(),
            user_name: this.getUserDisplayName(),
            page_id: this.getCurrentPageId()
        };
    }

    async sendTrackingData(trackingData, {complete = false} = {}) {
        const globals = this.getGlobalConfig();
        const baseUrl = globals._dashboardBaseUrl || Adapt.config.dashboardBaseUrl;
        const courseId = trackingData.course_id;

        // Prepare request body according to TrackProgressRequest
        const body = {
            lms_user_id: trackingData.user_id || 'anonymous',
            locale: trackingData.locale,
            proficiency: trackingData.proficiency,
            page_id: trackingData.page_id,
            complete
        };
        if (!complete) {
            body.questions = trackingData.questions.map(q => ({
                question_id: q.questionId,
                correct: q.isCorrect,
                user_answer: null // Not captured by current gatherAssessmentTrackingData
            }));
        }

        let sessionToken = localStorage.getItem('capito_session_token');
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        try {
            const response = await fetch(`${baseUrl}/public/v1/courses/${courseId}/progress`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                credentials: 'include',
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

            // Build simple HTML from JSON response for the dialog
            // In the future, we might want to use a template for this
            let html = '';

            // Inject basic styles if not present (simplified for now)
            const style = `
                <style>
                    .cs-badges { display: flex; flex-wrap: wrap; gap: 16px; }
                    .cs-badges > div { width: 120px; text-align: center; display: flex; flex-direction: column; align-items: center; background: white; border-radius: 10px; padding: 5px 0; }
                    .cs-badges img { max-width: 100%; height: auto; display: block; }
                </style>
            `;
            const more_lessons_available = data.more_lessons_available || false;
            if (data.status === 'completed') {
                html += '<div class="alert alert-success">';
                html += `<h3>Gratulation! Sie haben ${more_lessons_available ? "die Lektion" : "den Kurs"} abgeschlossen!</h3>`;
                if (data.earned_badges.length > 0) {
                    html += '<p>Sie haben folgende Abzeichen erhalten:</p>';
                    html += '<div class="cs-badges">';
                    data.earned_badges.forEach(badge => {
                        const imgUrl = `assets/${badge.locale}_${badge.level}${badge.is_new ? "_new" : ""}.png`;
                        html += `<div><img src="${imgUrl}"  alt="${badge.locale} ${badge.level}"/><span>${badge.language_name} - ${badge.level_label}</span></div>`;
                    });
                    html += '</div>';
                }
                const hasGoldGerman = data.earned_badges.some(b => b.locale === 'de' && b.level === 'gold');
                if (!hasGoldGerman) {
                    html += '<p>Sie können den Kurs noch einmal machen. Dann können Sie noch mehr Abzeichen bekommen.</p>';
                }
                html += '</div>';
                Adapt.trigger('capitoBadges:showDialog', html + style);
            } else if (complete) {
                html += '<div class="alert alert-info">';
                html += '<h3>Fortschritt gespeichert</h3>';
                html += '<p>Ihre Antworten wurden gespeichert. Machen Sie mit der nächsten Lektion weiter, um den Kurs abzuschließen.</p>';
                html += '</div>';


                // Ask ContentSelectorView to show the dialog with provided HTML
                Adapt.trigger('capitoBadges:showDialog', html + style);
            }
        } catch (error) {
            console.error('capitoBadges: Failed to send tracking data:', error);
        }
    }
}

Adapt.capitoBadges = new CapitoBadges();

export default Adapt.capitoBadges;
