# adapt-imagePairing

Image Pairing is an Adapt question component that presents two shuffled lists (left and right) and asks the learner to
pair items by dragging from the left column onto the right column. Each pair can be configured as image or text on
either side, allowing for image↔image, image↔text, text↔image, or text↔text.

Upon submission the component validates the pairings and updates the model with `_isCorrect`,
`_isInteractionComplete: true`, and `_isComplete: true`.

Further details on developing Adapt plug-ins can be found in the Adapt
wiki: https://github.com/adaptlearning/adapt_framework/wiki

## Installation

This component is bundled in this repository under `elearning_core/adapt-plugins/adapt-imagePairing` and is wired into
the Adapt build that the Elearning-Core generator produces.

- If you maintain a custom Adapt course manually, copy this folder into your course `src/components/` and register it in
  your build as required by your toolchain.
- If you use the Elearning-Core generator, nothing additional is required — the component will be included automatically
  when referenced in the generated course JSON.

## Usage

Add a component object to your course JSON with `_component: "imagePairing"`. You can configure pairs in two ways:

1) Recommended: explicit `pairs` array
```
{
  "_id": "c-imagepair-1",
  "_component": "imagePairing",
  "_type": "component",
  "title": "Match the pairs",
  "body": "Drag each left item onto its match on the right.",
  "pairs": [
    { "left": { "image": "assets/img/apple.png", "alt": "Apple" }, "right": { "text": "Apple" } },
    { "left": { "text": "Banana" }, "right": { "image": "assets/img/banana.png", "alt": "Banana" } }
  ]
}
```

2) Alternative: legacy arrays `image_left[]` and `image_right[]` (entries may be strings or objects)
```
{
  "_id": "c-imagepair-2",
  "_component": "imagePairing",
  "title": "Image Pairing (legacy)",
  "image_left": [
    "assets/img/cat.png",
    { "text": "Dog" }
  ],
  "image_right": [
    { "text": "Cat" },
    "assets/img/dog.png"
  ]
}
```

Both sides support either `image` or `text`:

- Image form: `{ "image": "path/to/file.png", "alt": "Accessible description" }`
- Text form: `{ "text": "Some label" }`

If you pass a raw string in the legacy arrays, the component will infer an image if the string looks like a URL or ends
in an image extension; otherwise it will be treated as text.

## Behavior

- Left items are draggable; right items are drop targets. Each right item can accept at most one left item; each left
  item can be assigned to exactly one right item.
- The Submit button is disabled until all left items have been assigned to some right item.
- On submit, the component checks that each left item has been dropped onto the right item that belongs to the same
  pair. It then sets:
    - `_isCorrect` (boolean: true only if all pairings are correct)
    - `_isInteractionComplete: true`
    - `_isComplete: true`
      and triggers `setCompletionStatus()`.
- A Reset button clears the assignments and allows the learner to try again (until the item has been submitted and the
  UI locks). After submission the UI is locked to prevent further changes.

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

The component’s styles are in `less/imagePairing.less`. Key hooks/classes include:

- `.imagePairing__list`, `.imagePairing__leftItem`, `.imagePairing__rightItem`
- State classes: `.is-dragging`, `.has-assignment`, `.is-submitted`
- Component-level correctness classes applied to the root `.component`: `.is-correct`, `.is-incorrect`

You can override these in your theme or add `_classes` on the component to target custom rules.

## Templates

The Handlebars template is in `templates/imagePairing.hbs`. It renders:

- Optional `body`
- Split layout with left and right lists
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
│   ├── adapt-imagePairing.js       # Registers the component with Adapt
│   ├── imagePairingModel.js        # Question model: config, state, evaluation
│   └── imagePairingView.js         # View: render, drag-drop, submit/reset
├── templates/
│   └── imagePairing.hbs            # Component template
└── less/
    └── imagePairing.less           # Component styles
```

## Browser Support

Designed and tested for modern evergreen browsers that support HTML5 drag-and-drop (Chrome, Edge, Firefox, Safari).
Mobile behavior varies by platform; ensure your target devices support drag-and-drop or consider adding a
touch-optimized fallback if needed.
