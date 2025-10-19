"use strict";
(globalThis["webpackChunk"] = globalThis["webpackChunk"] || []).push([["src_components_shared_SourceView-codemirror_ts"],{

/***/ "./src/components/shared/SourceView-codemirror.ts":
/*!********************************************************!*\
  !*** ./src/components/shared/SourceView-codemirror.ts ***!
  \********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SourceViewEditor: () => (/* binding */ SourceViewEditor)
/* harmony export */ });
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @codemirror/view */ "./node_modules/@codemirror/view/dist/index.js");
/* harmony import */ var _codemirror_state__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @codemirror/state */ "./node_modules/@codemirror/state/dist/index.js");
/* harmony import */ var _codemirror_language__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @codemirror/language */ "./node_modules/@codemirror/language/dist/index.js");
/* harmony import */ var _lezer_highlight__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @lezer/highlight */ "./node_modules/@lezer/highlight/dist/index.js");
/* harmony import */ var _codemirror_lang_cpp__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @codemirror/lang-cpp */ "./node_modules/@codemirror/lang-cpp/dist/index.js");
/* harmony import */ var _codemirror_lang_rust__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @codemirror/lang-rust */ "./node_modules/@codemirror/lang-rust/dist/index.js");
/* harmony import */ var _codemirror_lang_javascript__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @codemirror/lang-javascript */ "./node_modules/@codemirror/lang-javascript/dist/index.js");
/* harmony import */ var clamp__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! clamp */ "./node_modules/clamp/index.js");
/* harmony import */ var clamp__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/__webpack_require__.n(clamp__WEBPACK_IMPORTED_MODULE_7__);
/* harmony import */ var _utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../../utils/codemirror-shared */ "./src/utils/codemirror-shared.ts");
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * This module wraps all the interaction with the CodeMirror API into a
 * SourceViewEditor class.
 *
 * This module is intended to be imported asynchronously, so that all the
 * CodeMirror code can be split into a separate bundle chunk.
 *
 * This file implements the following features:
 *  - Display source code with syntax highlighting.
 *  - Display a gutter with:
 *    - "Total" timings for each line
 *    - "Self" timings for each line
 *    - The line number for each line
 *  - Highlight source code lines which have a non-zero timing, by applying
 *    a cm-nonZeroLine class to them. This highlight line goes across the entire
 *    width of the editor, it covers both the gutter and the main area.
 */










// This "compartment" allows us to swap the syntax highlighting language when
// the file path changes.
const languageConf = new _codemirror_state__WEBPACK_IMPORTED_MODULE_1__.Compartment();

// Detect the right language based on the file extension.
function _languageExtForPath(path) /* LanguageSupport | [] */{
  if (path === null) {
    return [];
  }
  if (path.endsWith('.rs')) {
    return (0,_codemirror_lang_rust__WEBPACK_IMPORTED_MODULE_5__.rust)();
  }
  if (path.endsWith('.js') || path.endsWith('.jsm') || path.endsWith('.jsx') || path.endsWith('.mjs') || path.endsWith('.ts') || path.endsWith('.tsx')) {
    return (0,_codemirror_lang_javascript__WEBPACK_IMPORTED_MODULE_6__.javascript)();
  }
  if (path.endsWith('.c') || path.endsWith('.cc') || path.endsWith('.cpp') || path.endsWith('.cxx') || path.endsWith('.h') || path.endsWith('.hpp') || path.endsWith('.m') || path.endsWith('.mm')) {
    return (0,_codemirror_lang_cpp__WEBPACK_IMPORTED_MODULE_4__.cpp)();
  }
  return [];
}

// Adjustments to make a CodeMirror editor work as a non-editable code viewer.
const codeViewerExtension = [
// Make the editor non-editable.
_codemirror_view__WEBPACK_IMPORTED_MODULE_0__.EditorView.editable.of(false),
// Allow tabbing to the view (to an element *inside* the scroller so that the
// up / down keys trigger scrolling), and take focus on mousedown.
_codemirror_view__WEBPACK_IMPORTED_MODULE_0__.EditorView.contentAttributes.of({
  tabindex: '0'
})];
class SourceViewEditor {
  // Create a CodeMirror editor and add it as a child element of domParent.
  constructor(initialText, path, timings, domParent) {
    this._view = void 0;
    let state = _codemirror_state__WEBPACK_IMPORTED_MODULE_1__.EditorState.create({
      doc: initialText,
      extensions: [_utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__.timingsExtension, (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_0__.lineNumbers)(), languageConf.of(_languageExtForPath(path)), (0,_codemirror_language__WEBPACK_IMPORTED_MODULE_2__.syntaxHighlighting)(_lezer_highlight__WEBPACK_IMPORTED_MODULE_3__.classHighlighter), codeViewerExtension]
    });
    state = state.update({
      effects: _utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__.updateTimingsEffect.of(timings)
    }).state;
    this._view = new _codemirror_view__WEBPACK_IMPORTED_MODULE_0__.EditorView({
      state,
      parent: domParent
    });
  }
  updateLanguageForFilePath(path) {
    this._view.dispatch({
      effects: languageConf.reconfigure(_languageExtForPath(path))
    });
  }
  setContents(text) {
    // The CodeMirror way of replacing the entire contents is to insert new text
    // and overwrite the full range of existing text.
    this._view.dispatch(this._view.state.update({
      changes: {
        insert: text,
        from: 0,
        to: this._view.state.doc.length
      }
    }));
  }
  setTimings(timings) {
    // Update the value of the timings field by dispatching an updateTimingsEffect.
    this._view.dispatch({
      effects: _utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__.updateTimingsEffect.of(timings)
    });
  }
  scrollToLine(lineNumber) {
    // Clamp the line number to the document's line count.
    lineNumber = clamp__WEBPACK_IMPORTED_MODULE_7___default()(lineNumber, 1, this._view.state.doc.lines);

    // Convert the line number into a position.
    const pos = this._view.state.doc.line(lineNumber).from;
    // Dispatch the scroll action.
    this._view.dispatch({
      effects: _codemirror_view__WEBPACK_IMPORTED_MODULE_0__.EditorView.scrollIntoView(pos, {
        y: 'start',
        yMargin: 0
      })
    });
    // Trigger a measure flush, to work around
    // https://github.com/codemirror/codemirror.next/issues/676
    this._view.coordsAtPos(0);
  }
}

/***/ }),

/***/ "./src/utils/codemirror-shared.ts":
/*!****************************************!*\
  !*** ./src/utils/codemirror-shared.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   StringMarker: () => (/* binding */ StringMarker),
/* harmony export */   timingsExtension: () => (/* binding */ timingsExtension),
/* harmony export */   updateTimingsEffect: () => (/* binding */ updateTimingsEffect)
/* harmony export */ });
/* harmony import */ var core_js_modules_esnext_iterator_filter_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! core-js/modules/esnext.iterator.filter.js */ "./node_modules/core-js/modules/esnext.iterator.filter.js");
/* harmony import */ var core_js_modules_esnext_iterator_filter_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_esnext_iterator_filter_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var core_js_modules_esnext_iterator_map_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! core-js/modules/esnext.iterator.map.js */ "./node_modules/core-js/modules/esnext.iterator.map.js");
/* harmony import */ var core_js_modules_esnext_iterator_map_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_esnext_iterator_map_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var core_js_modules_esnext_iterator_some_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! core-js/modules/esnext.iterator.some.js */ "./node_modules/core-js/modules/esnext.iterator.some.js");
/* harmony import */ var core_js_modules_esnext_iterator_some_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_esnext_iterator_some_js__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @codemirror/view */ "./node_modules/@codemirror/view/dist/index.js");
/* harmony import */ var _codemirror_state__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @codemirror/state */ "./node_modules/@codemirror/state/dist/index.js");
/* harmony import */ var _profile_logic_line_timings__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../profile-logic/line-timings */ "./src/profile-logic/line-timings.ts");



/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */





// This gutter marker applies the "cm-nonZeroLine" class to gutter elements.
const nonZeroLineGutterMarker = new class extends _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.GutterMarker {
  constructor(...args) {
    super(...args);
    this.elementClass = 'cm-nonZeroLine';
  }
}();

// This "decoration" applies the "cm-nonZeroLine" class to the line of assembly
// code in the main editor contents (not the gutter).
const nonZeroLineDecoration = _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.Decoration.line({
  class: 'cm-nonZeroLine'
});

// An "effect" is like a redux action. This effect is used to replace the value
// of the timingsField state field.
const updateTimingsEffect = _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.StateEffect.define();

// A "state field" for the timings.
const timingsField = _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.StateField.define({
  create() {
    return _profile_logic_line_timings__WEBPACK_IMPORTED_MODULE_5__.emptyLineTimings;
  },
  update(timings, transaction) {
    // This is like a reducer. Find an updateTimingsEffect in the transaction
    // and set this field to the timings in it.
    let newTimings = timings;
    for (const effect of transaction.effects) {
      if (effect.is(updateTimingsEffect)) {
        newTimings = effect.value;
      }
    }
    return newTimings;
  }
});

// Finds all lines with non-zero line timings, for the highlight line.
// The line numbers are then converted into "positions", i.e. character offsets
// in the document, for the start of the line.
// Then they are sorted, because our caller wants to have a sorted list.
function getSortedStartPositionsOfNonZeroLines(state) {
  const timings = state.field(timingsField);
  const nonZeroLines = new Set();
  for (const lineNumber of timings.totalLineHits.keys()) {
    nonZeroLines.add(lineNumber);
  }
  for (const lineNumber of timings.selfLineHits.keys()) {
    nonZeroLines.add(lineNumber);
  }
  const lineCount = state.doc.lines;
  const positions = Array.from(nonZeroLines).filter(l => l >= 1 && l <= lineCount).map(lineNumber => state.doc.line(lineNumber).from);
  positions.sort((a, b) => a - b);
  return positions;
}

// This is an "extension" which applies the "cm-nonZeroLine" class to all gutter
// elements for lines with non-zero timings. It is like a piece of derived state;
// it needs to be recomputed whenever one of the input states change. The input
// states are the editor contents ("doc") and the value of the timings field.
// The editor contents are relevant because the output is expressed in terms of
// positions, i.e. character offsets from the document start, and those positions
// need to be updated if the amount of text in a line changes. This happens when
// we replace the file placeholder content with the actual file content.
const nonZeroLineGutterHighlighter = _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.gutterLineClass.compute(['doc', timingsField], state => {
  const positions = getSortedStartPositionsOfNonZeroLines(state);
  return _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.RangeSet.of(positions.map(p => nonZeroLineGutterMarker.range(p)));
});

// Same as the previous extension, but this one is for the main editor. There
// doesn't seem to be a way to set a class for the entire line, i.e. both the
// gutter elements and the main editor elements of that line.
const nonZeroLineDecorationHighlighter = _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.EditorView.decorations.compute(['doc', timingsField], state => {
  const positions = getSortedStartPositionsOfNonZeroLines(state);
  return _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.RangeSet.of(positions.map(p => nonZeroLineDecoration.range(p)));
});

// This is a "gutter marker" which renders just a string and nothing else.
// It is used for the AddressTimings annotations, i.e. for the numbers in the
// gutter.
class StringMarker extends _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.GutterMarker {
  constructor(s) {
    super();
    this._s = void 0;
    this._s = s;
  }
  toDOM() {
    return document.createTextNode(this._s);
  }
}

// The "extension" which manages the elements in the gutter for the "total"
// column.
const totalTimingsGutter = (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_3__.gutter)({
  class: 'cm-total-timings-gutter',
  lineMarker(view, line) {
    // Return a gutter marker for this line, or null.
    const lineNumber = view.state.doc.lineAt(line.from).number;
    const timings = view.state.field(timingsField);
    const totalTime = timings.totalLineHits.get(lineNumber);
    return totalTime !== undefined ? new StringMarker(String(totalTime)) : null;
  },
  lineMarkerChange(update) {
    // Return true if the update affects the total timings in the gutter.
    return update.transactions.some(t => t.effects.some(e => e.is(updateTimingsEffect)));
  }
});

// The "extension" which manages the elements in the gutter for the "self"
// column.
const selfTimingsGutter = (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_3__.gutter)({
  class: 'cm-self-timings-gutter',
  lineMarker(view, line) {
    // Return a gutter marker for this line, or null.
    const lineNumber = view.state.doc.lineAt(line.from).number;
    const timings = view.state.field(timingsField);
    const selfTime = timings.selfLineHits.get(lineNumber);
    return selfTime !== undefined ? new StringMarker(String(selfTime)) : null;
  },
  lineMarkerChange(update) {
    // Return true if the update affects the self timings in the gutter.
    return update.transactions.some(t => t.effects.some(e => e.is(updateTimingsEffect)));
  }
});

// All extensions which have to do with timings, grouped into one extension.
const timingsExtension = [timingsField, totalTimingsGutter, selfTimingsGutter, nonZeroLineGutterHighlighter, nonZeroLineDecorationHighlighter];

/***/ })

}]);
//# sourceMappingURL=src_components_shared_SourceView-codemirror_ts.9ebfd8432c813d493003.bundle.js.map