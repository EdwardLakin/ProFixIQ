/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
self["webpackHotUpdate_N_E"]("app/work-orders/page",{

/***/ "(app-pages-browser)/./src/hooks/useUser.ts":
/*!******************************!*\
  !*** ./src/hooks/useUser.ts ***!
  \******************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ useUser)\n/* harmony export */ });\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ \"(app-pages-browser)/./node_modules/next/dist/compiled/react/index.js\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/lib/supabaseClient */ \"(app-pages-browser)/./src/lib/supabaseClient.ts\");\n/* harmony import */ var _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1__);\n\n\nfunction useUser() {\n    const [user, setUser] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(null);\n    const [isLoading, setIsLoading] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(true);\n    (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)({\n        \"useUser.useEffect\": ()=>{\n            const fetchUser = {\n                \"useUser.useEffect.fetchUser\": async ()=>{\n                    setIsLoading(true);\n                    const { data: { user } } = await _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1___default().auth.getUser();\n                    if (!user) {\n                        setUser(null);\n                        setIsLoading(false);\n                        return;\n                    }\n                    const { data, error } = await _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1___default().from('profiles').select('*, shop(*)').eq('id', user.id).single();\n                    if (error) {\n                        console.error('❌ Failed to fetch user profile:', error);\n                        setUser(null);\n                    } else {\n                        setUser(data);\n                    }\n                    setIsLoading(false);\n                }\n            }[\"useUser.useEffect.fetchUser\"];\n            fetchUser();\n        }\n    }[\"useUser.useEffect\"], []);\n    return {\n        user,\n        isLoading\n    };\n}\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uL3NyYy9ob29rcy91c2VVc2VyLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQTRDO0FBQ0E7QUFFN0IsU0FBU0c7SUFDdEIsTUFBTSxDQUFDQyxNQUFNQyxRQUFRLEdBQUdKLCtDQUFRQSxDQUFNO0lBQ3RDLE1BQU0sQ0FBQ0ssV0FBV0MsYUFBYSxHQUFHTiwrQ0FBUUEsQ0FBQztJQUUzQ0QsZ0RBQVNBOzZCQUFDO1lBQ1IsTUFBTVE7K0NBQVk7b0JBQ2hCRCxhQUFhO29CQUViLE1BQU0sRUFDSkUsTUFBTSxFQUFFTCxJQUFJLEVBQUUsRUFDZixHQUFHLE1BQU1GLCtEQUFhLENBQUNTLE9BQU87b0JBRS9CLElBQUksQ0FBQ1AsTUFBTTt3QkFDVEMsUUFBUTt3QkFDUkUsYUFBYTt3QkFDYjtvQkFDRjtvQkFFQSxNQUFNLEVBQUVFLElBQUksRUFBRUcsS0FBSyxFQUFFLEdBQUcsTUFBTVYsK0RBQ3ZCLENBQUMsWUFDTFksTUFBTSxDQUFDLGNBQ1BDLEVBQUUsQ0FBQyxNQUFNWCxLQUFLWSxFQUFFLEVBQ2hCQyxNQUFNO29CQUVULElBQUlMLE9BQU87d0JBQ1RNLFFBQVFOLEtBQUssQ0FBQyxtQ0FBbUNBO3dCQUNqRFAsUUFBUTtvQkFDVixPQUFPO3dCQUNMQSxRQUFRSTtvQkFDVjtvQkFFQUYsYUFBYTtnQkFDZjs7WUFFQUM7UUFDRjs0QkFBRyxFQUFFO0lBRUwsT0FBTztRQUFFSjtRQUFNRTtJQUFVO0FBQzNCIiwic291cmNlcyI6WyIvd29ya3NwYWNlcy9Qcm9GaXhJUS9zcmMvaG9va3MvdXNlVXNlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB1c2VFZmZlY3QsIHVzZVN0YXRlIH0gZnJvbSAncmVhY3QnO1xuaW1wb3J0IHN1cGFiYXNlIGZyb20gJ0AvbGliL3N1cGFiYXNlQ2xpZW50JztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gdXNlVXNlcigpIHtcbiAgY29uc3QgW3VzZXIsIHNldFVzZXJdID0gdXNlU3RhdGU8YW55PihudWxsKTtcbiAgY29uc3QgW2lzTG9hZGluZywgc2V0SXNMb2FkaW5nXSA9IHVzZVN0YXRlKHRydWUpO1xuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgY29uc3QgZmV0Y2hVc2VyID0gYXN5bmMgKCkgPT4ge1xuICAgICAgc2V0SXNMb2FkaW5nKHRydWUpO1xuXG4gICAgICBjb25zdCB7XG4gICAgICAgIGRhdGE6IHsgdXNlciB9LFxuICAgICAgfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0VXNlcigpO1xuXG4gICAgICBpZiAoIXVzZXIpIHtcbiAgICAgICAgc2V0VXNlcihudWxsKTtcbiAgICAgICAgc2V0SXNMb2FkaW5nKGZhbHNlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB7IGRhdGEsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxuICAgICAgICAuZnJvbSgncHJvZmlsZXMnKVxuICAgICAgICAuc2VsZWN0KCcqLCBzaG9wKCopJylcbiAgICAgICAgLmVxKCdpZCcsIHVzZXIuaWQpXG4gICAgICAgIC5zaW5nbGUoKTtcblxuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZmV0Y2ggdXNlciBwcm9maWxlOicsIGVycm9yKTtcbiAgICAgICAgc2V0VXNlcihudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldFVzZXIoZGF0YSk7XG4gICAgICB9XG5cbiAgICAgIHNldElzTG9hZGluZyhmYWxzZSk7XG4gICAgfTtcblxuICAgIGZldGNoVXNlcigpO1xuICB9LCBbXSk7XG5cbiAgcmV0dXJuIHsgdXNlciwgaXNMb2FkaW5nIH07XG59Il0sIm5hbWVzIjpbInVzZUVmZmVjdCIsInVzZVN0YXRlIiwic3VwYWJhc2UiLCJ1c2VVc2VyIiwidXNlciIsInNldFVzZXIiLCJpc0xvYWRpbmciLCJzZXRJc0xvYWRpbmciLCJmZXRjaFVzZXIiLCJkYXRhIiwiYXV0aCIsImdldFVzZXIiLCJlcnJvciIsImZyb20iLCJzZWxlY3QiLCJlcSIsImlkIiwic2luZ2xlIiwiY29uc29sZSJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/./src/hooks/useUser.ts\n"));

/***/ }),

/***/ "(app-pages-browser)/./src/lib/supabaseClient.ts":
/*!***********************************!*\
  !*** ./src/lib/supabaseClient.ts ***!
  \***********************************/
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