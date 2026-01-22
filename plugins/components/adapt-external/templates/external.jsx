import React from 'react';

export default function External(props) {
    const {body} = props;
    return (
        <div className="component__inner external__inner">
            <div className="component__widget external__widget">
                {/* Render provided HTML (iframe or embed) */}
                {body ? (
                    <div className="component__body" dangerouslySetInnerHTML={{__html: body}}/>
                ) : (
                    <div className="component__body"/>
                )}
            </div>
        </div>
    );
}
