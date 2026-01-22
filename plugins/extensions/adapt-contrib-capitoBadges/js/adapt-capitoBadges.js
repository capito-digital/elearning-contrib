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
        this.listenTo(Adapt, 'assessment:complete', this.onAssessmentComplete);
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
        const config = this.getConfig();
        config['_userId'] = this.getUserId();
        config['_baseUrl'] = this.getGlobalConfig()['_dashboardBaseUrl'];
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
        const config = this.getConfig();
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
            course_id: config._courseId,
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
        try {
            const response = await fetch(`${baseUrl}/course-progress/${courseId}/answers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/html',
                    'HX-Request': true,
                },
                body: JSON.stringify(trackingData),
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            // Ask ContentSelectorView to show the dialog with provided HTML
            Adapt.trigger('capitoBadges:showDialog', html);
        } catch (error) {
            console.error('capitoBadges: Failed to send tracking data:', error);
        }
    }
}

Adapt.capitoBadges = new CapitoBadges();

export default Adapt.capitoBadges;