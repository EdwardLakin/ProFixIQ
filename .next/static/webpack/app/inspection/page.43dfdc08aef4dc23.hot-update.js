/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
self["webpackHotUpdate_N_E"]("app/inspection/page",{

/***/ "(app-pages-browser)/./src/lib/inspection/inspectionState.ts":
/*!***********************************************!*\
  !*** ./src/lib/inspection/inspectionState.ts ***!
  \***********************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   applyInspectionActions: () => (/* binding */ applyInspectionActions),\n/* harmony export */   createEmptyInspection: () => (/* binding */ createEmptyInspection),\n/* harmony export */   initialInspectionState: () => (/* binding */ initialInspectionState)\n/* harmony export */ });\n/* harmony import */ var _lib_inspection_templates_maintenance50Point__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @/lib/inspection/templates/maintenance50Point */ \"(app-pages-browser)/./src/lib/inspection/templates/maintenance50Point.ts\");\n/* harmony import */ var _lib_inspection_templates_maintenance50Point__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_lib_inspection_templates_maintenance50Point__WEBPACK_IMPORTED_MODULE_0__);\n// lib/inspection/inspectionState.ts\n\nfunction createEmptyInspection() {\n    return {\n        startedAt: new Date().toISOString(),\n        updatedAt: new Date().toISOString(),\n        sections: {}\n    };\n}\nfunction initialInspectionState() {\n    return (0,_lib_inspection_templates_maintenance50Point__WEBPACK_IMPORTED_MODULE_0__.createMaintenance50PointInspection)();\n}\nfunction applyInspectionActions(state, actions) {\n    const newState = JSON.parse(JSON.stringify(state));\n    for (const action of actions){\n        switch(action.type){\n            case 'setStatus':\n                {\n                    const { section, item, status, note } = action;\n                    if (!newState.sections[section]) newState.sections[section] = {};\n                    if (!newState.sections[section][item]) newState.sections[section][item] = {\n                        status: 'ok',\n                        notes: []\n                    };\n                    newState.sections[section][item].status = status;\n                    if (note) {\n                        newState.sections[section][item].notes = newState.sections[section][item].notes || [];\n                        newState.sections[section][item].notes.push(note);\n                    }\n                    break;\n                }\n            case 'addNote':\n                {\n                    const { section, item, note } = action;\n                    if (!newState.sections[section]) newState.sections[section] = {};\n                    if (!newState.sections[section][item]) newState.sections[section][item] = {\n                        status: 'ok',\n                        notes: []\n                    };\n                    newState.sections[section][item].notes = newState.sections[section][item].notes || [];\n                    newState.sections[section][item].notes.push(note);\n                    break;\n                }\n            case 'setMeasurement':\n                {\n                    const { section, item, value, unit } = action;\n                    if (!newState.sections[section]) newState.sections[section] = {};\n                    if (!newState.sections[section][item]) newState.sections[section][item] = {\n                        status: 'ok',\n                        notes: []\n                    };\n                    newState.sections[section][item].measurement = {\n                        value,\n                        unit\n                    };\n                    break;\n                }\n        }\n    }\n    newState.updatedAt = new Date().toISOString();\n    return newState;\n}\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uL3NyYy9saWIvaW5zcGVjdGlvbi9pbnNwZWN0aW9uU3RhdGUudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFBQSxvQ0FBb0M7QUFPK0Q7QUFFNUYsU0FBU0M7SUFDZCxPQUFPO1FBQ0xDLFdBQVcsSUFBSUMsT0FBT0MsV0FBVztRQUNqQ0MsV0FBVyxJQUFJRixPQUFPQyxXQUFXO1FBQ2pDRSxVQUFVLENBQUM7SUFDYjtBQUNGO0FBRU8sU0FBU0M7SUFDZCxPQUFPUCxnSEFBa0NBO0FBQzNDO0FBRU8sU0FBU1EsdUJBQ2RDLEtBQXNCLEVBQ3RCQyxPQUEyQjtJQUUzQixNQUFNQyxXQUE0QkMsS0FBS0MsS0FBSyxDQUFDRCxLQUFLRSxTQUFTLENBQUNMO0lBRTVELEtBQUssTUFBTU0sVUFBVUwsUUFBUztRQUM1QixPQUFRSyxPQUFPQyxJQUFJO1lBQ2pCLEtBQUs7Z0JBQWE7b0JBQ2hCLE1BQU0sRUFBRUMsT0FBTyxFQUFFQyxJQUFJLEVBQUVDLE1BQU0sRUFBRUMsSUFBSSxFQUFFLEdBQUdMO29CQUN4QyxJQUFJLENBQUNKLFNBQVNMLFFBQVEsQ0FBQ1csUUFBUSxFQUFFTixTQUFTTCxRQUFRLENBQUNXLFFBQVEsR0FBRyxDQUFDO29CQUMvRCxJQUFJLENBQUNOLFNBQVNMLFFBQVEsQ0FBQ1csUUFBUSxDQUFDQyxLQUFLLEVBQ25DUCxTQUFTTCxRQUFRLENBQUNXLFFBQVEsQ0FBQ0MsS0FBSyxHQUFHO3dCQUNqQ0MsUUFBUTt3QkFDUkUsT0FBTyxFQUFFO29CQUNYO29CQUVGVixTQUFTTCxRQUFRLENBQUNXLFFBQVEsQ0FBQ0MsS0FBSyxDQUFDQyxNQUFNLEdBQUdBO29CQUUxQyxJQUFJQyxNQUFNO3dCQUNSVCxTQUFTTCxRQUFRLENBQUNXLFFBQVEsQ0FBQ0MsS0FBSyxDQUFDRyxLQUFLLEdBQ3BDVixTQUFTTCxRQUFRLENBQUNXLFFBQVEsQ0FBQ0MsS0FBSyxDQUFDRyxLQUFLLElBQUksRUFBRTt3QkFDOUNWLFNBQVNMLFFBQVEsQ0FBQ1csUUFBUSxDQUFDQyxLQUFLLENBQUNHLEtBQUssQ0FBQ0MsSUFBSSxDQUFDRjtvQkFDOUM7b0JBQ0E7Z0JBQ0Y7WUFFQSxLQUFLO2dCQUFXO29CQUNkLE1BQU0sRUFBRUgsT0FBTyxFQUFFQyxJQUFJLEVBQUVFLElBQUksRUFBRSxHQUFHTDtvQkFDaEMsSUFBSSxDQUFDSixTQUFTTCxRQUFRLENBQUNXLFFBQVEsRUFBRU4sU0FBU0wsUUFBUSxDQUFDVyxRQUFRLEdBQUcsQ0FBQztvQkFDL0QsSUFBSSxDQUFDTixTQUFTTCxRQUFRLENBQUNXLFFBQVEsQ0FBQ0MsS0FBSyxFQUNuQ1AsU0FBU0wsUUFBUSxDQUFDVyxRQUFRLENBQUNDLEtBQUssR0FBRzt3QkFDakNDLFFBQVE7d0JBQ1JFLE9BQU8sRUFBRTtvQkFDWDtvQkFFRlYsU0FBU0wsUUFBUSxDQUFDVyxRQUFRLENBQUNDLEtBQUssQ0FBQ0csS0FBSyxHQUNwQ1YsU0FBU0wsUUFBUSxDQUFDVyxRQUFRLENBQUNDLEtBQUssQ0FBQ0csS0FBSyxJQUFJLEVBQUU7b0JBQzlDVixTQUFTTCxRQUFRLENBQUNXLFFBQVEsQ0FBQ0MsS0FBSyxDQUFDRyxLQUFLLENBQUNDLElBQUksQ0FBQ0Y7b0JBQzVDO2dCQUNGO1lBRUEsS0FBSztnQkFBa0I7b0JBQ3JCLE1BQU0sRUFBRUgsT0FBTyxFQUFFQyxJQUFJLEVBQUVLLEtBQUssRUFBRUMsSUFBSSxFQUFFLEdBQUdUO29CQUN2QyxJQUFJLENBQUNKLFNBQVNMLFFBQVEsQ0FBQ1csUUFBUSxFQUFFTixTQUFTTCxRQUFRLENBQUNXLFFBQVEsR0FBRyxDQUFDO29CQUMvRCxJQUFJLENBQUNOLFNBQVNMLFFBQVEsQ0FBQ1csUUFBUSxDQUFDQyxLQUFLLEVBQ25DUCxTQUFTTCxRQUFRLENBQUNXLFFBQVEsQ0FBQ0MsS0FBSyxHQUFHO3dCQUNqQ0MsUUFBUTt3QkFDUkUsT0FBTyxFQUFFO29CQUNYO29CQUVGVixTQUFTTCxRQUFRLENBQUNXLFFBQVEsQ0FBQ0MsS0FBSyxDQUFDTyxXQUFXLEdBQUc7d0JBQzdDRjt3QkFDQUM7b0JBQ0Y7b0JBQ0E7Z0JBQ0Y7UUFDRjtJQUNGO0lBRUFiLFNBQVNOLFNBQVMsR0FBRyxJQUFJRixPQUFPQyxXQUFXO0lBQzNDLE9BQU9PO0FBQ1QiLCJzb3VyY2VzIjpbIi93b3Jrc3BhY2VzL1Byb0ZpeElRL3NyYy9saWIvaW5zcGVjdGlvbi9pbnNwZWN0aW9uU3RhdGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gbGliL2luc3BlY3Rpb24vaW5zcGVjdGlvblN0YXRlLnRzXG5cbmltcG9ydCB0eXBlIHtcbiAgSW5zcGVjdGlvblN0YXRlLFxuICBJbnNwZWN0aW9uQWN0aW9uLFxuICBJbnNwZWN0aW9uUmVzdWx0LFxufSBmcm9tICdAL2xpYi9pbnNwZWN0aW9uL3R5cGVzJztcbmltcG9ydCB7IGNyZWF0ZU1haW50ZW5hbmNlNTBQb2ludEluc3BlY3Rpb24gfSBmcm9tICdAL2xpYi9pbnNwZWN0aW9uL3RlbXBsYXRlcy9tYWludGVuYW5jZTUwUG9pbnQnO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRW1wdHlJbnNwZWN0aW9uKCk6IEluc3BlY3Rpb25TdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgc3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgc2VjdGlvbnM6IHt9LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbEluc3BlY3Rpb25TdGF0ZSgpOiBJbnNwZWN0aW9uU3RhdGUge1xuICByZXR1cm4gY3JlYXRlTWFpbnRlbmFuY2U1MFBvaW50SW5zcGVjdGlvbigpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlJbnNwZWN0aW9uQWN0aW9ucyhcbiAgc3RhdGU6IEluc3BlY3Rpb25TdGF0ZSxcbiAgYWN0aW9uczogSW5zcGVjdGlvbkFjdGlvbltdXG4pOiBJbnNwZWN0aW9uU3RhdGUge1xuICBjb25zdCBuZXdTdGF0ZTogSW5zcGVjdGlvblN0YXRlID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShzdGF0ZSkpO1xuXG4gIGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcbiAgICBzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG4gICAgICBjYXNlICdzZXRTdGF0dXMnOiB7XG4gICAgICAgIGNvbnN0IHsgc2VjdGlvbiwgaXRlbSwgc3RhdHVzLCBub3RlIH0gPSBhY3Rpb247XG4gICAgICAgIGlmICghbmV3U3RhdGUuc2VjdGlvbnNbc2VjdGlvbl0pIG5ld1N0YXRlLnNlY3Rpb25zW3NlY3Rpb25dID0ge307XG4gICAgICAgIGlmICghbmV3U3RhdGUuc2VjdGlvbnNbc2VjdGlvbl1baXRlbV0pXG4gICAgICAgICAgbmV3U3RhdGUuc2VjdGlvbnNbc2VjdGlvbl1baXRlbV0gPSB7XG4gICAgICAgICAgICBzdGF0dXM6ICdvaycsXG4gICAgICAgICAgICBub3RlczogW10sXG4gICAgICAgICAgfTtcblxuICAgICAgICBuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXVtpdGVtXS5zdGF0dXMgPSBzdGF0dXM7XG5cbiAgICAgICAgaWYgKG5vdGUpIHtcbiAgICAgICAgICBuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXVtpdGVtXS5ub3RlcyA9XG4gICAgICAgICAgICBuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXVtpdGVtXS5ub3RlcyB8fCBbXTtcbiAgICAgICAgICBuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXVtpdGVtXS5ub3Rlcy5wdXNoKG5vdGUpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlICdhZGROb3RlJzoge1xuICAgICAgICBjb25zdCB7IHNlY3Rpb24sIGl0ZW0sIG5vdGUgfSA9IGFjdGlvbjtcbiAgICAgICAgaWYgKCFuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXSkgbmV3U3RhdGUuc2VjdGlvbnNbc2VjdGlvbl0gPSB7fTtcbiAgICAgICAgaWYgKCFuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXVtpdGVtXSlcbiAgICAgICAgICBuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXVtpdGVtXSA9IHtcbiAgICAgICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgICAgICAgIG5vdGVzOiBbXSxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIG5ld1N0YXRlLnNlY3Rpb25zW3NlY3Rpb25dW2l0ZW1dLm5vdGVzID1cbiAgICAgICAgICBuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXVtpdGVtXS5ub3RlcyB8fCBbXTtcbiAgICAgICAgbmV3U3RhdGUuc2VjdGlvbnNbc2VjdGlvbl1baXRlbV0ubm90ZXMucHVzaChub3RlKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgJ3NldE1lYXN1cmVtZW50Jzoge1xuICAgICAgICBjb25zdCB7IHNlY3Rpb24sIGl0ZW0sIHZhbHVlLCB1bml0IH0gPSBhY3Rpb247XG4gICAgICAgIGlmICghbmV3U3RhdGUuc2VjdGlvbnNbc2VjdGlvbl0pIG5ld1N0YXRlLnNlY3Rpb25zW3NlY3Rpb25dID0ge307XG4gICAgICAgIGlmICghbmV3U3RhdGUuc2VjdGlvbnNbc2VjdGlvbl1baXRlbV0pXG4gICAgICAgICAgbmV3U3RhdGUuc2VjdGlvbnNbc2VjdGlvbl1baXRlbV0gPSB7XG4gICAgICAgICAgICBzdGF0dXM6ICdvaycsXG4gICAgICAgICAgICBub3RlczogW10sXG4gICAgICAgICAgfTtcblxuICAgICAgICBuZXdTdGF0ZS5zZWN0aW9uc1tzZWN0aW9uXVtpdGVtXS5tZWFzdXJlbWVudCA9IHtcbiAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICB1bml0LFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBuZXdTdGF0ZS51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIHJldHVybiBuZXdTdGF0ZTtcbn0iXSwibmFtZXMiOlsiY3JlYXRlTWFpbnRlbmFuY2U1MFBvaW50SW5zcGVjdGlvbiIsImNyZWF0ZUVtcHR5SW5zcGVjdGlvbiIsInN0YXJ0ZWRBdCIsIkRhdGUiLCJ0b0lTT1N0cmluZyIsInVwZGF0ZWRBdCIsInNlY3Rpb25zIiwiaW5pdGlhbEluc3BlY3Rpb25TdGF0ZSIsImFwcGx5SW5zcGVjdGlvbkFjdGlvbnMiLCJzdGF0ZSIsImFjdGlvbnMiLCJuZXdTdGF0ZSIsIkpTT04iLCJwYXJzZSIsInN0cmluZ2lmeSIsImFjdGlvbiIsInR5cGUiLCJzZWN0aW9uIiwiaXRlbSIsInN0YXR1cyIsIm5vdGUiLCJub3RlcyIsInB1c2giLCJ2YWx1ZSIsInVuaXQiLCJtZWFzdXJlbWVudCJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/./src/lib/inspection/inspectionState.ts\n"));

/***/ }),

/***/ "(app-pages-browser)/./src/lib/inspection/templates/maintenance50Point.ts":
/*!************************************************************!*\
  !*** ./src/lib/inspection/templates/maintenance50Point.ts ***!
  \************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {



;
    // Wrapped in an IIFE to avoid polluting the global scope
    ;
    (function () {
        var _a, _b;
        // Legacy CSS implementations will `eval` browser code in a Node.js context
        // to extract CSS. For backwards compatibility, we need to check we're in a
        // browser context before continuing.
        if (typeof self !== 'undefined' &&
            // AMP / No-JS mode does not inject these helpers:
            '$RefreshHelpers$' in self) {
            // @ts-ignore __webpack_module__ is global
            var currentExports = module.exports;
            // @ts-ignore __webpack_module__ is global
            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;
            // This cannot happen in MainTemplate because the exports mismatch between
            // templating and execution.
            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);
            // A module can be accepted automatically based on its exports, e.g. when
            // it is a Refresh Boundary.
            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {
                // Save the previous exports signature on update so we can compare the boundary
                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)
                module.hot.dispose(function (data) {
                    data.prevSignature =
                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);
                });
                // Unconditionally accept an update to this module, we'll check if it's
                // still a Refresh Boundary later.
                // @ts-ignore importMeta is replaced in the loader
                module.hot.accept();
                // This field is set when the previous version of this module was a
                // Refresh Boundary, letting us know we need to check for invalidation or
                // enqueue an update.
                if (prevSignature !== null) {
                    // A boundary can become ineligible if its exports are incompatible
                    // with the previous exports.
                    //
                    // For example, if you add/remove/change exports, we'll want to
                    // re-execute the importing modules, and force those components to
                    // re-render. Similarly, if you convert a class component to a
                    // function, we want to invalidate the boundary.
                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {
                        module.hot.invalidate();
                    }
                    else {
                        self.$RefreshHelpers$.scheduleUpdate();
                    }
                }
            }
            else {
                // Since we just executed the code for the module, it's possible that the
                // new exports made it ineligible for being a boundary.
                // We only care about the case when we were _previously_ a boundary,
                // because we already accepted this update (accidental side effect).
                var isNoLongerABoundary = prevSignature !== null;
                if (isNoLongerABoundary) {
                    module.hot.invalidate();
                }
            }
        }
    })();


/***/ })

});