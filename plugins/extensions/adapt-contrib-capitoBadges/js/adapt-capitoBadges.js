import Adapt from 'core/js/adapt';
// import Backbone from 'backbone';
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
        this.listenTo(Adapt, 'blockNavigation:c' +
            'omplete', this.onBlockNavigationComplete);

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
        // Cache the latest assessment state but DO NOT submit yet
        try {
            this._lastAssessmentState = stateObject;
            this._lastTrackingData = this.gatherAssessmentTrackingData(stateObject);
            console.log('capitoBadges: cached assessment results for deferred submit');
        } catch (e) {
            console.error('capitoBadges: failed to cache assessment data', e);
        }
    }

    onBlockNavigationComplete() {
        // Submit cached tracking data when the user clicks "Abschließen"
        try {
            if (this._lastTrackingData) {
                this.sendTrackingData(this._lastTrackingData);
            } else if (this._lastAssessmentState) {
                // Fallback: build now if only state was cached
                const trackingData = this.gatherAssessmentTrackingData(this._lastAssessmentState);
                this.sendTrackingData(trackingData);
            } else {
                console.warn('capitoBadges: no assessment data available to submit on completion');
            }
        } catch (e) {
            console.error('capitoBadges: failed to submit on blockNavigation:complete', e);
        }
    }

    getUserId() {
        try {
            return pipwerks.SCORM.get("cmi.core.student_id")
        } catch (err) {
            console.log("SCORM not available, either in anonymous course, or not in SCORM mode.")
        }
        return undefined;
    }

    gatherAssessmentTrackingData(stateObject) {
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
            user_id: this.getUserId()
        };

        // Gather question-level data
        if (stateObject?.questions && stateObject?.questionModels) {
            const questions = stateObject.questions;
            const questionModels = stateObject.questionModels.models || [];

            questions.forEach((question, idx) => {
                const questionModel = questionModels[idx];
                if (questionModel) {
                    const questionData = {
                        questionId: questionModel.get('_questionId'),
                        componentId: questionModel.get('_id'),
                        componentType: questionModel.get('_component'),
                        isCorrect: question._isCorrect,
                        score: question.score || 0,
                        maxScore: question.maxScore || 0
                    };
                    trackingData.questions.push(questionData);
                }
            });
        }
        return trackingData;
    }

    async sendTrackingData(trackingData) {
        const globals = this.getGlobalConfig();
        const baseUrl = globals._dashboardBaseUrl || Adapt.config.dashboardBaseUrl;
        const courseId = trackingData.course_id;
        
        // Prepare request body according to TrackProgressRequest
        const body = {
            lms_user_id: trackingData.user_id || 'anonymous',
            locale: trackingData.locale,
            proficiency: trackingData.proficiency,
            questions: trackingData.questions.map(q => ({
                question_id: q.questionId,
                correct: q.isCorrect,
                user_answer: null // Not captured by current gatherAssessmentTrackingData
            }))
        };

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
            if (data.status === 'completed') {
                html += '<div class="alert alert-success">';
                html += '<h3>Gratulation! Sie haben den Kurs abgeschlossen!</h3>';
                html += '<p>Sie haben folgende Abzeichen erhalten:</p>';
                html += '<div class="cs-badges">';
                data.earned_badges.forEach(badge => {
                    const imgUrl = `assets/${badge.locale}_${badge.level}${badge.is_new ? "_new" : ""}.png`;
                    html += `<div><img src="${imgUrl}"  alt="${badge.locale} ${badge.level}"/><span>${badge.language_name} - ${badge.level_label}</span></div>`;
                });
                html += '</div>';
                const hasGoldGerman = data.earned_badges.some(b => b.locale === 'de' && b.level === 'gold');
                if (!hasGoldGerman) {
                    html += '<p>Sie können den Kurs noch einmal machen. Dann können Sie noch mehr Abzeichen bekommen.</p>';
                }
                html += '</div>';
            } else {
                html += '<div class="alert alert-info">';
                html += '<h3>Fortschritt gespeichert</h3>';
                html += '<p>Ihre Antworten wurden gespeichert. Machen Sie weiter, um den Kurs abzuschließen.</p>';
                html += '</div>';
            }

            // Inject basic styles if not present (simplified for now)
            const style = `
                <style>
                    .cs-badges { display: flex; flex-wrap: wrap; gap: 16px; }
                    .cs-badges > div { width: 120px; text-align: center; display: flex; flex-direction: column; align-items: center; background: white; border-radius: 10px; padding: 5px 0; }
                    .cs-badges img { max-width: 100%; height: auto; display: block; }
                </style>
            `;
            
            // Ask ContentSelectorView to show the dialog with provided HTML
            Adapt.trigger('capitoBadges:showDialog', html + style);
        } catch (error) {
            console.error('capitoBadges: Failed to send tracking data:', error);
        }
    }
}

Adapt.capitoBadges = new CapitoBadges();

export default Adapt.capitoBadges;