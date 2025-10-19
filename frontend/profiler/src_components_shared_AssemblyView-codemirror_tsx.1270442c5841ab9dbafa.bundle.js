"use strict";
(globalThis["webpackChunk"] = globalThis["webpackChunk"] || []).push([["src_components_shared_AssemblyView-codemirror_tsx"],{

/***/ "./src/components/shared/AssemblyView-codemirror.tsx":
/*!***********************************************************!*\
  !*** ./src/components/shared/AssemblyView-codemirror.tsx ***!
  \***********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AssemblyViewEditor: () => (/* binding */ AssemblyViewEditor)
/* harmony export */ });
/* harmony import */ var core_js_modules_esnext_iterator_map_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! core-js/modules/esnext.iterator.map.js */ "./node_modules/core-js/modules/esnext.iterator.map.js");
/* harmony import */ var core_js_modules_esnext_iterator_map_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_esnext_iterator_map_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var core_js_modules_esnext_iterator_some_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! core-js/modules/esnext.iterator.some.js */ "./node_modules/core-js/modules/esnext.iterator.some.js");
/* harmony import */ var core_js_modules_esnext_iterator_some_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_esnext_iterator_some_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @codemirror/view */ "./node_modules/@codemirror/view/dist/index.js");
/* harmony import */ var _codemirror_state__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @codemirror/state */ "./node_modules/@codemirror/state/dist/index.js");
/* harmony import */ var _codemirror_language__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @codemirror/language */ "./node_modules/@codemirror/language/dist/index.js");
/* harmony import */ var _lezer_highlight__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @lezer/highlight */ "./node_modules/@lezer/highlight/dist/index.js");
/* harmony import */ var clamp__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! clamp */ "./node_modules/clamp/index.js");
/* harmony import */ var clamp__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(clamp__WEBPACK_IMPORTED_MODULE_6__);
/* harmony import */ var _utils_bisect__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../utils/bisect */ "./src/utils/bisect.ts");
/* harmony import */ var _utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../../utils/codemirror-shared */ "./src/utils/codemirror-shared.ts");


/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * This module wraps all the interaction with the CodeMirror API into a
 * AssemblyViewEditor class.
 *
 * This module is intended to be imported asynchronously, so that all the
 * CodeMirror code can be split into a separate bundle chunk.
 *
 * This file implements the following features:
 *  - Display assembly code.
 *  - Display a gutter with:
 *    - "Total" timings for each instruction
 *    - "Self" timings for each instruction
 *    - The address for each instruction
 *  - Highlight assembly code lines which have a non-zero timing, by applying
 *    a cm-nonZeroLine class to them. This highlight line goes across the entire
 *    width of the editor, it covers both the gutter and the main area.
 */








// An "effect" is like a redux action. This effect is used to replace the value
// of the state field addressToLineMapField.
const updateAddressToLineMapEffect = _codemirror_state__WEBPACK_IMPORTED_MODULE_3__.StateEffect.define();

// This "state field" stores the current AddressToLineMap. This field allows the
// instructionAddressGutter to map line numbers to addresses.
const addressToLineMapField = _codemirror_state__WEBPACK_IMPORTED_MODULE_3__.StateField.define({
  create() {
    return new AddressToLineMap([]);
  },
  update(instructionAddresses, transaction) {
    // Get the new value from an effect in the transaction.
    let newSortedAddresses = instructionAddresses;
    for (const effect of transaction.effects) {
      if (effect.is(updateAddressToLineMapEffect)) {
        newSortedAddresses = effect.value;
      }
    }
    return newSortedAddresses;
  }
});

// A gutter which displays the address of each instruction.
const instructionAddressGutter = (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_2__.gutter)({
  class: 'cm-instruction-address-gutter',
  // Returns a gutter marker for this line, or null.
  lineMarker(view, line) {
    const lineNumber = view.state.doc.lineAt(line.from).number;
    const map = view.state.field(addressToLineMapField);
    const address = map.lineToAddress(lineNumber);
    return address !== null ? new _utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__.StringMarker(`0x${address.toString(16)}`) : null;
  },
  // Returns true if the update affects the instruction addresses in the gutter.
  lineMarkerChange(update) {
    return update.transactions.some(t => t.effects.some(e => e.is(updateAddressToLineMapEffect)));
  }
});
function instructionsToText(assemblyCode) {
  return assemblyCode.map(instr => instr.decodedString).join('\n');
}

/**
 * This map is used to convert between instruction addresses and editor line
 * numbers.
 */
class AddressToLineMap {
  constructor(instructionAddresses) {
    // The address of each instruction. This stays constant for the entire lifetime
    // of this AddressToLineMap instance.
    //
    // _instructionAddresses[0] contains the address of the instruction which is
    // displayed in line 1. (Line numbers are 1-based.)
    //
    // The addresses need to be ordered from low to high, so that the binary search
    // works.
    this._instructionAddresses = void 0;
    this._instructionAddresses = instructionAddresses;
  }

  // Find the line which displays the instruction which covers `address`.
  // `address` doesn't need to be a perfect match for the instruction address;
  // for example, in the example below, address 0x10e4 is mapped to line 3:
  //
  // 1: 0x10da: mov r14, rdi
  // 2: 0x10dd: mov rdi, rsi
  // 3: 0x10e0: call _malloc_usable_size
  // 4: 0x10e5: test rax, rax
  // 5: 0x10e8: je loc_10f6
  addressToLine(address) {
    const insertionIndex = (0,_utils_bisect__WEBPACK_IMPORTED_MODULE_7__.bisectionRight)(this._instructionAddresses, address);
    if (insertionIndex === 0) {
      // address < instructionAddresses[0]
      return null;
    }
    const elementIndex = insertionIndex - 1;
    const lineNumber = elementIndex + 1;
    return lineNumber;
  }

  // Return the address of the instruction which is displayed in line `lineNumber`.
  lineToAddress(lineNumber) {
    if (lineNumber < 1 || lineNumber > this._instructionAddresses.length) {
      return null;
    }
    const elementIndex = lineNumber - 1;
    return this._instructionAddresses[elementIndex];
  }
}
function getInstructionAddresses(assemblyCode) {
  return assemblyCode.map(instr => instr.address);
}

// Convert AddressTimings to LineTimings with the help of an AddressToLineMap.
function addressTimingsToLineTimings(addressTimings, map) {
  const totalLineHits = new Map();
  for (const [address, hitCount] of addressTimings.totalAddressHits) {
    const line = map.addressToLine(address);
    if (line !== null) {
      const currentHitCount = totalLineHits.get(line) ?? 0;
      totalLineHits.set(line, currentHitCount + hitCount);
    }
  }
  const selfLineHits = new Map();
  for (const [address, hitCount] of addressTimings.selfAddressHits) {
    const line = map.addressToLine(address);
    if (line !== null) {
      const currentHitCount = selfLineHits.get(line) ?? 0;
      selfLineHits.set(line, currentHitCount + hitCount);
    }
  }
  return {
    totalLineHits,
    selfLineHits
  };
}
class AssemblyViewEditor {
  // Create a CodeMirror editor and add it as a child element of domParent.
  constructor(initialAssemblyCode, addressTimings, domParent) {
    this._view = void 0;
    this._addressToLineMap = void 0;
    this._addressTimings = void 0;
    this._addressToLineMap = new AddressToLineMap(getInstructionAddresses(initialAssemblyCode));
    this._addressTimings = addressTimings;
    let state = _codemirror_state__WEBPACK_IMPORTED_MODULE_3__.EditorState.create({
      doc: instructionsToText(initialAssemblyCode),
      extensions: [_utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__.timingsExtension, addressToLineMapField, instructionAddressGutter, (0,_codemirror_language__WEBPACK_IMPORTED_MODULE_4__.syntaxHighlighting)(_lezer_highlight__WEBPACK_IMPORTED_MODULE_5__.classHighlighter), _codemirror_state__WEBPACK_IMPORTED_MODULE_3__.EditorState.readOnly.of(true), _codemirror_view__WEBPACK_IMPORTED_MODULE_2__.EditorView.editable.of(false)]
    });
    const lineTimings = addressTimingsToLineTimings(this._addressTimings, this._addressToLineMap);
    state = state.update({
      effects: [updateAddressToLineMapEffect.of(this._addressToLineMap), _utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__.updateTimingsEffect.of(lineTimings)]
    }).state;
    this._view = new _codemirror_view__WEBPACK_IMPORTED_MODULE_2__.EditorView({
      state,
      parent: domParent
    });
  }
  setContents(assemblyCode) {
    this._addressToLineMap = new AddressToLineMap(getInstructionAddresses(assemblyCode));
    const lineTimings = addressTimingsToLineTimings(this._addressTimings, this._addressToLineMap);
    // The CodeMirror way of replacing the entire contents is to insert new text
    // and overwrite the full range of existing text.
    const text = instructionsToText(assemblyCode);
    this._view.dispatch(this._view.state.update({
      changes: {
        insert: text,
        from: 0,
        to: this._view.state.doc.length
      }
    }));
    this._view.dispatch({
      effects: [updateAddressToLineMapEffect.of(this._addressToLineMap), _utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__.updateTimingsEffect.of(lineTimings)]
    });
  }
  setTimings(addressTimings) {
    // Update the value of the timings field by dispatching an updateTimingsEffect.
    this._addressTimings = addressTimings;
    const lineTimings = addressTimingsToLineTimings(this._addressTimings, this._addressToLineMap);
    this._view.dispatch({
      effects: _utils_codemirror_shared__WEBPACK_IMPORTED_MODULE_8__.updateTimingsEffect.of(lineTimings)
    });
  }
  scrollToLine(lineNumber) {
    // Clamp the line number to the document's line count.
    lineNumber = clamp__WEBPACK_IMPORTED_MODULE_6___default()(lineNumber, 1, this._view.state.doc.lines);

    // Convert the line number into a position.
    const pos = this._view.state.doc.line(lineNumber).from;
    // Dispatch the scroll action.
    this._view.dispatch({
      effects: _codemirror_view__WEBPACK_IMPORTED_MODULE_2__.EditorView.scrollIntoView(pos, {
        y: 'start',
        yMargin: 0
      })
    });
    // Trigger a measure flush, to work around
    // https://github.com/codemirror/codemirror.next/issues/676
    this._view.coordsAtPos(0);
  }
  scrollToAddress(address) {
    const lineNumber = this._addressToLineMap.addressToLine(address);
    if (lineNumber !== null) {
      this.scrollToLine(lineNumber);
    }
  }
  scrollToAddressWithSpaceOnTop(address, topSpaceLines) {
    const lineNumber = this._addressToLineMap.addressToLine(address);
    if (lineNumber !== null) {
      this.scrollToLine(lineNumber - topSpaceLines);
    }
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
//# sourceMappingURL=src_components_shared_AssemblyView-codemirror_tsx.1270442c5841ab9dbafa.bundle.js.map