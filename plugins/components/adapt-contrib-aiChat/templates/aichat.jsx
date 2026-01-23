import React from 'react';
import {classes, templates} from 'core/js/reactHelpers';

export default function AiChat(props) {
    const {
        _isInteractionComplete,
        _id,
        _isEnabled,
        _isCorrect,
        _shouldShowMarking,
        _canShowCorrectness,
        _globals,
        displayTitle,
        body,
        instruction,
        ariaQuestion,
        _courseId,
        _questionId,
        _buttonText,
        _loadingText,
        _isLoading,
        _aiResponse
    } = props;

    const buttonText = _buttonText || 'Ask AI';
    const loadingText = _loadingText || 'Loading...';

    return (
        <div className="component__inner aichat__inner">

            <templates.header {...props} />

            <div
                className={classes([
                    'component__widget aichat__widget',
                    !_isEnabled && 'is-disabled',
                    _isInteractionComplete && 'is-complete is-submitted',
                    _isInteractionComplete && _canShowCorrectness && 'show-correctness',
                    _isCorrect && 'is-correct'
                ])}
                aria-labelledby={ariaQuestion ? null : (displayTitle || body || instruction) && `${_id}-header`}
                aria-label={ariaQuestion || null}
                role='group'
            >

                <div className="aichat-item__container">
                    <div className="aichat-item">
                        {/* Question Input Textarea */}
                        <div className="aichat-item__textarea-container">
              <textarea
                  id={`${_id}-textarea`}
                  className="aichat-item__textarea js-aichat-textarea"
                  placeholder="Schreibe hier deine Antwort"
                  spellCheck={false}
                  disabled={!_isEnabled || _isLoading}
                  rows={4}
              />
                        </div>
                        {/* AI Chat Button */}
                        <div className="aichat-item__button-container">
                            <button
                                className="aichat-item__button js-aichat-button btn-text"
                                type="button"
                                disabled={!_isEnabled || _isLoading}
                                aria-describedby={`${_id}-button-description`}
                                dangerouslySetInnerHTML={{__html: buttonText}}
                            />
                            <div
                                id={`${_id}-button-description`}
                                className="aria-label"
                                aria-hidden="true"
                            >
                                Course ID: {_courseId}, Question ID: {_questionId}
                            </div>
                        </div>

                        {/* Loading State */}
                        <div
                            className={classes([
                                'aichat-item__loading js-aichat-loading',
                                !_isLoading && 'is-hidden'
                            ])}
                        >
                            <div className="aichat-item__loading-text"
                                 dangerouslySetInnerHTML={{__html: loadingText}}>
                            </div>
                            <div className="aichat-item__loading-spinner">
                                <div className="spinner" aria-hidden="true"></div>
                            </div>
                        </div>

                        {/* AI Response */}
                        <div
                            className={classes([
                                'aichat-item__response js-aichat-response',
                                !_isInteractionComplete && 'is-hidden'
                            ])}
                        >
                            <div className="aichat-item__response-label">
                                KI Bewertung:
                            </div>
                            <div
                                className="aichat-item__response-text js-aichat-response-text"
                                dangerouslySetInnerHTML={{__html: _aiResponse['response'] || ''}}
                            >
                            </div>
                            {props._showFeedbackOptions && (
                                <div className="aichat-item__feedback js-aichat-feedback">
                                    <div className="aichat-item__feedback-text">
                                        Wenn Sie möchten, können Sie die Inhalte etwas leichter machen, oder in einer
                                        anderen Sprache anzeigen.
                                        Klicken Sie dafür oben auf die Flagge
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status Icons */}
                        {_shouldShowMarking &&
                            <div className="aichat-item__state">
                                <div className="aichat-item__icon aichat-item__correct-icon"
                                     aria-label={_globals._accessibility._ariaLabels.correct}>
                                    <div className="icon" aria-hidden="true"/>
                                </div>
                                <div className="aichat-item__icon aichat-item__incorrect-icon"
                                     aria-label={_globals._accessibility._ariaLabels.incorrect}>
                                    <div className="icon" aria-hidden="true"/>
                                </div>
                            </div>
                        }

                    </div>
                </div>

            </div>
        </div>
    );

}