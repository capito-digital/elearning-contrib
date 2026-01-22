import React from 'react';
import {classes, templates} from 'core/js/reactHelpers';

export default function Roleplay(props) {
    const {
        _id,
        _isEnabled,
        _isInteractionComplete,
        _canShowCorrectness,
        _shouldShowMarking,
        _isLoading,
        _status,
        _description,
        _genericInstruction,
        _aiPersonaLabel,
        displayTitle,
        body,
        instruction,
        ariaQuestion,
        _courseId,
        _roleplayId
    } = props;

    return (
        <div className="component__inner roleplay__inner">
            <templates.header {...props} />

            <div
                className={classes([
                    'component__widget roleplay__widget',
                    !_isEnabled && 'is-disabled',
                    _isInteractionComplete && 'is-complete is-submitted',
                    _isInteractionComplete && _canShowCorrectness && 'show-correctness'
                ])}
                aria-labelledby={ariaQuestion ? null : (displayTitle || body || instruction) && `${_id}-header`}
                aria-label={ariaQuestion || null}
                role="group"
            >
                {/* Description & Instructions */}
                <div className="roleplay__info">
                    In diesem Rollenspiel können Sie Situationen üben, die so in der Arbeit vorkommen könnten:
                    {_genericInstruction && (<div className="roleplay__instruction">{_genericInstruction}</div>)}
                </div>

                {/* Chat window */}
                <div className="roleplay__chat">
                    <div className="roleplay__scroller js-roleplay-scroller">
                        <div className="roleplay__messages js-roleplay-messages"/>
                    </div>
                </div>

                {/* Loading indicator */}
                <div className={classes(['roleplay__loading js-roleplay-loading', !_isLoading && 'is-hidden'])}>
                    <div className="spinner" aria-hidden="true"></div>
                </div>

                {/* Composer */}
                <div className="roleplay__composer">
          <textarea
              id={`${_id}-textarea`}
              className="roleplay__textarea js-roleplay-textarea"
              placeholder="Ihre Nachricht... (bitte in der Ich-Form)"
              disabled={!_isEnabled || _isLoading}
              rows={3}
          />
                    <button
                        type="button"
                        className="btn-text roleplay__send js-roleplay-send"
                        disabled={!_isEnabled || _isLoading}
                        aria-describedby={`${_id}-send-description`}
                    >
                        Senden
                    </button>
                    <div id={`${_id}-send-description`} className="aria-label" aria-hidden="true">
                        Course ID: {_courseId}, Roleplay ID: {_roleplayId}
                    </div>
                </div>

                {/* Optional marking container for framework compliance */}
                {_shouldShowMarking && (
                    <div className="roleplay__state">
                        <div className="roleplay__icon roleplay__correct-icon" aria-hidden="true">
                            <div className="icon"></div>
                        </div>
                        <div className="roleplay__icon roleplay__incorrect-icon" aria-hidden="true">
                            <div className="icon"></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
