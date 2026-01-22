# adapt-contrib-aiChat

**AI Chat** is a *question component* for the [Adapt framework](https://github.com/adaptlearning/adapt_framework).

This component allows learners to make API calls to an AI chat service by clicking a button. When clicked, it sends a
GET request to `http://localhost:5001/ai-chat/course/{courseId}/question/{questionId}` and displays the response.

## Installation

With the [Adapt CLI](https://github.com/adaptlearning/adapt-cli) installed, run the following from the command line:
`adapt install adapt-contrib-aiChat`

Alternatively, this component can also be installed by adding the following line of code to the *adapt.json* file:
`"adapt-contrib-aiChat": "*"`

Then running the command:
`adapt install`

(This second method will reinstall all plug-ins listed in *adapt.json*.)

## Settings Overview

The attributes listed below are used in *components.json* to configure **AI Chat**, and are properly formatted as JSON
in [*example.json*](https://github.com/adaptlearning/adapt-contrib-aiChat/blob/master/example.json).

### Attributes

**_component** (string): This value must be: `aichat`.

**_classes** (string): CSS class name to be applied to **AI Chat**'s containing `div`. The class must be predefined in
one of the Less files. Separate multiple classes with a space.

**_layout** (string): This defines the horizontal position of the component in the block. Acceptable values are `full`,
`left` or `right`.

**instruction** (string): This optional text appears above the component. It is frequently used to guide the learner's
interaction with the component.

**_courseId** (string): Required. The course ID parameter to be passed to the AI chat API endpoint.

**_questionId** (string): Required. The question ID parameter to be passed to the AI chat API endpoint.

**_buttonText** (string): Optional. The text displayed on the AI chat button. Default: "Ask AI".

**_loadingText** (string): Optional. The text displayed while the API request is processing. Default: "Loading...".

**_attempts** (number): This represents the total number of attempts a learner is allowed. Default: `1`.

**_canShowModelAnswer** (boolean): Setting this to `false` prevents the [**_showCorrectAnswer
** button](https://github.com/adaptlearning/adapt_framework/wiki/Core-Buttons) from being displayed. The default is
`true`.

**_canShowFeedback** (boolean): Setting this to `false` disables feedback, so it is not shown to the user. The default
is `true`.

**_canShowMarking** (boolean): Setting this to `false` prevents ticks and crosses being displayed on question
completion. The default is `true`.

**_recordInteraction** (boolean): Determines whether or not the learner's answers will be recorded to the LMS via
cmi.interactions. Default is `true`. For further information, see the entry for `_shouldRecordInteractions` in the
README for [adapt-contrib-spoor](https://github.com/adaptlearning/adapt-contrib-spoor).

**_questionWeight** (number): A number which reflects the significance of the question in relation to the other
questions in the course. This number is used in calculations of the final score reported to the LMS. The default is `1`.

## API Response

The component expects the API to return a JSON response. The component will display:

1. `response` field if present
2. `message` field if present
3. The entire JSON response as a string if neither field is present

## Limitations

- The API endpoint is currently hardcoded to `http://localhost:5001`
- Only GET requests are supported
- No authentication is implemented

## Browser/platform specification

This component has been tested to the standard Adapt browser specification.

----------------------------
**Author / maintainer:** Adapt Core Team
with [contributors](https://github.com/adaptlearning/adapt-contrib-aiChat/graphs/contributors)  
**Accessibility support:** WAI AA  
**RTL support:** Yes  
**Cross-platform coverage:** Chrome, Chrome for Android, Firefox (ESR + latest version), Edge, Safari for
macOS/iOS/iPadOS, Opera