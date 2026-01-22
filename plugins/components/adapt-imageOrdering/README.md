# adapt-imageOrdering

Image Ordering is an Adapt question component that presents a single list of items (images and/or text) in shuffled
order. The learner reorders the items via drag-and-drop to match the intended correct sequence.

Upon submission the component validates the order and updates the model with `_isCorrect`,
`_isInteractionComplete: true`, and `_isComplete: true`. Each element shows correctness via red/green borders. After an
incorrect submission, the learner can click “Show Correct Answer” to reorder the list to the correct solution and the
Submit button will be disabled.

Further details on developing Adapt plug-ins can be found in the Adapt
wiki: https://github.com/adaptlearning/adapt_framework/wiki

## Installation

This component is bundled in this repository under `elearning_core/adapt-plugins/adapt-imageOrdering` and is wired into
the Adapt build that the Elearning-Core generator produces.

- If you maintain a custom Adapt course manually, copy this folder into your course `src/components/` and register it in
  your build as required by your toolchain.
- If you use the Elearning-Core generator, nothing additional is required — the component will be included automatically
  when referenced in the generated course JSON.

## Usage

Add a component object to your course JSON with `_component: "imageOrdering"`. You can configure items as follows:

1) Recommended: explicit `items` array

```
{
  "_id": "c-imageorder-1",
  "_component": "imageOrdering",
  "_type": "component",
  "title": "Order the items",
  "body": "Drag the items to put them in the correct order.",
  "instruction": "Top to bottom should be chronological.",
  "items": [
    { "image": "assets/img/step1.png", "alt": "Step 1" },
    { "text": "Step 2" },
    { "image": "assets/img/step3.png", "alt": "Step 3" }
  ]
}
```

2) Alternative: legacy array `image_left[]` (entries may be strings or objects)

```
{
  "_id": "c-imageorder-2",
  "_component": "imageOrdering",
  "title": "Image Ordering (legacy)",
  "image_left": [
    "assets/img/one.png",
    { "text": "Two" },
    "assets/img/three.png"
  ]
}
```

Items support either `image` or `text`:

- Image form: `{ "image": "path/to/file.png", "alt": "Accessible description" }`
- Text form: `{ "text": "Some label" }`

If you pass a raw string in the legacy arrays, the component will infer an image if the string looks like a URL or ends
in an image extension; otherwise it will be treated as text.

## Behavior

- The single list of items is draggable to change order.
- On submit, the component compares the current order to the original order of the provided `items` and sets:
    - `_isCorrect` (boolean)
    - `_isInteractionComplete: true`
    - `_isComplete: true`
      and triggers `setCompletionStatus()`.
- Each item gets a red (incorrect) or green (correct) border.
- After an incorrect submission, “Show Correct Answer” disables the Submit button and reorders the list to the correct
  sequence.

## Labels and Localization

The template uses the standard `_globals` structure for labels. You can provide translations in your course’s
`globals.json`:

```
{
  "_components": {
    "_imagePairing": {
      "leftColumnLabel": "Left",
      "rightColumnLabel": "Right",
      "submit": "Submit",
      "reset": "Reset"
    }
  }
}
```

If not provided, ensure your localization pipeline supplies appropriate defaults.

## Settings Reference

Core model attributes (shared by all components) apply as usual: `_id`, `_component`, `_classes`, `_layout`, `title`,
`displayTitle`, `body`, `instruction`, etc.
See: https://github.com/adaptlearning/adapt_framework/wiki/Core-model-attributes

Component-specific settings:

- `pairs` (array, recommended): List of objects with shape `{ left, right }`.
    - `left` and `right` each accept:
        - `{ image: string, alt?: string }`
        - `{ text: string }`
- `image_left` / `image_right` (arrays, legacy alternative): Parallel arrays used to build pairs. Items can be
    - a string (image URL or text), or
    - an object `{ image: string, alt?: string }` or `{ text: string }`.

Scoring and correctness:

- The component extends Adapt `QuestionModel`. Score is set to the `_questionWeight` when `_isCorrect` is true,
  otherwise 0.

## Styling

The component’s styles are in `less/imageOrdering.less`. Key hooks/classes include:

- `.imageOrdering__list`, `.imageOrdering__item`
- State classes: `.is-dragging`, `.is-submitted`
- Per-item correctness classes: `.is-correct`, `.is-incorrect`

You can override these in your theme or add `_classes` on the component to target custom rules.

## Templates

The Handlebars template is in `templates/imageOrdering.hbs`. It renders:

- Optional `body`
- A single list for ordering
- Submit and Reset buttons

## Accessibility

- Images support `alt` text when configured via `{ image, alt }` objects.
- Basic ARIA labels are applied to the left and right lists.
- The primary interaction is mouse/touch drag-and-drop. Keyboard pairing is not implemented in this initial version. If
  you require full keyboard operation, consider adding a keyboard-accessible fallback or selection mode.

## Limitations

- Requires all left items to be assigned before submitting; partial grading is not supported (correctness is
  all-or-nothing).
- Drag-and-drop only (no keyboard pairing yet).

## File Structure

```
adapt-imagePairing/
├── js/
│   ├── adapt-imageOrdering.js       # Registers the component with Adapt
│   ├── imageOrderingModel.js        # Question model: config, state, evaluation
│   └── imageOrderingView.js         # View: render, drag-drop, submit/reset
├── templates/
│   └── imageOrdering.hbs           # Component template
└── less/
    └── imageOrdering.less          # Component styles
```

## Browser Support

Designed and tested for modern evergreen browsers that support HTML5 drag-and-drop (Chrome, Edge, Firefox, Safari).
Mobile behavior varies by platform; ensure your target devices support drag-and-drop or consider adding a
touch-optimized fallback if needed.
