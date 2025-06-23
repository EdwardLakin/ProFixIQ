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
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ useUser)\n/* harmony export */ });\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ \"(app-pages-browser)/./node_modules/next/dist/compiled/react/index.js\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/lib/supabaseClient */ \"(app-pages-browser)/./src/lib/supabaseClient.ts\");\n/* harmony import */ var _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1__);\n// src/hooks/useUser.ts\n/* __next_internal_client_entry_do_not_use__ default auto */ \n\nfunction useUser() {\n    const [user, setUser] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(null);\n    const [isLoading, setIsLoading] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(true);\n    (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)({\n        \"useUser.useEffect\": ()=>{\n            const fetchUser = {\n                \"useUser.useEffect.fetchUser\": async ()=>{\n                    setIsLoading(true);\n                    const { data: { user }, error: userError } = await _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1___default().auth.getUser();\n                    if (userError || !user) {\n                        console.error('Error getting user:', userError);\n                        setUser(null);\n                        setIsLoading(false);\n                        return;\n                    }\n                    const { data: profile, error: profileError } = await _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1___default().from('profiles').select('*').eq('id', user.id).single();\n                    if (profileError) {\n                        if (profileError.code === 'PGRST116') {\n                            var _user_user_metadata;\n                            var _user_user_metadata_name;\n                            // Not found, create new profile\n                            const { error: insertError } = await _lib_supabaseClient__WEBPACK_IMPORTED_MODULE_1___default().from('profiles').insert({\n                                id: user.id,\n                                email: user.email,\n                                name: (_user_user_metadata_name = (_user_user_metadata = user.user_metadata) === null || _user_user_metadata === void 0 ? void 0 : _user_user_metadata.name) !== null && _user_user_metadata_name !== void 0 ? _user_user_metadata_name : '',\n                                plan: 'diy',\n                                shop_name: '',\n                                labor_rate: 0,\n                                parts_markup: 0,\n                                created_at: new Date().toISOString(),\n                                shop_id: null,\n                                is_active: true\n                            });\n                            if (insertError) {\n                                console.error('Failed to create profile:', insertError);\n                                setUser(null);\n                                setIsLoading(false);\n                                return;\n                            }\n                            setUser({\n                                id: user.id,\n                                email: user.email,\n                                plan: 'diy'\n                            });\n                        } else {\n                            console.error('Failed to fetch user profile:', profileError);\n                            setUser(null);\n                        }\n                    } else {\n                        setUser(profile);\n                    }\n                    setIsLoading(false);\n                }\n            }[\"useUser.useEffect.fetchUser\"];\n            fetchUser();\n        }\n    }[\"useUser.useEffect\"], []);\n    return {\n        user,\n        isLoading\n    };\n}\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uL3NyYy9ob29rcy91c2VVc2VyLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUEsdUJBQXVCOzZEQUdxQjtBQUNBO0FBRTdCLFNBQVNHO0lBQ3RCLE1BQU0sQ0FBQ0MsTUFBTUMsUUFBUSxHQUFHSiwrQ0FBUUEsQ0FBTTtJQUN0QyxNQUFNLENBQUNLLFdBQVdDLGFBQWEsR0FBR04sK0NBQVFBLENBQUM7SUFFM0NELGdEQUFTQTs2QkFBQztZQUNSLE1BQU1ROytDQUFZO29CQUNoQkQsYUFBYTtvQkFFYixNQUFNLEVBQ0pFLE1BQU0sRUFBRUwsSUFBSSxFQUFFLEVBQ2RNLE9BQU9DLFNBQVMsRUFDakIsR0FBRyxNQUFNVCwrREFBYSxDQUFDVyxPQUFPO29CQUUvQixJQUFJRixhQUFhLENBQUNQLE1BQU07d0JBQ3RCVSxRQUFRSixLQUFLLENBQUMsdUJBQXVCQzt3QkFDckNOLFFBQVE7d0JBQ1JFLGFBQWE7d0JBQ2I7b0JBQ0Y7b0JBRUEsTUFBTSxFQUFFRSxNQUFNTSxPQUFPLEVBQUVMLE9BQU9NLFlBQVksRUFBRSxHQUFHLE1BQU1kLCtEQUM5QyxDQUFDLFlBQ0xnQixNQUFNLENBQUMsS0FDUEMsRUFBRSxDQUFDLE1BQU1mLEtBQUtnQixFQUFFLEVBQ2hCQyxNQUFNO29CQUVULElBQUlMLGNBQWM7d0JBQ2hCLElBQUlBLGFBQWFNLElBQUksS0FBSyxZQUFZO2dDQUs1QmxCO2dDQUFBQTs0QkFKUixnQ0FBZ0M7NEJBQ2hDLE1BQU0sRUFBRU0sT0FBT2EsV0FBVyxFQUFFLEdBQUcsTUFBTXJCLCtEQUFhLENBQUMsWUFBWXNCLE1BQU0sQ0FBQztnQ0FDcEVKLElBQUloQixLQUFLZ0IsRUFBRTtnQ0FDWEssT0FBT3JCLEtBQUtxQixLQUFLO2dDQUNqQkMsTUFBTXRCLENBQUFBLDRCQUFBQSxzQkFBQUEsS0FBS3VCLGFBQWEsY0FBbEJ2QiwwQ0FBQUEsb0JBQW9Cc0IsSUFBSSxjQUF4QnRCLHNDQUFBQSwyQkFBNEI7Z0NBQ2xDd0IsTUFBTTtnQ0FDTkMsV0FBVztnQ0FDWEMsWUFBWTtnQ0FDWkMsY0FBYztnQ0FDZEMsWUFBWSxJQUFJQyxPQUFPQyxXQUFXO2dDQUNsQ0MsU0FBUztnQ0FDVEMsV0FBVzs0QkFDYjs0QkFFQSxJQUFJYixhQUFhO2dDQUNmVCxRQUFRSixLQUFLLENBQUMsNkJBQTZCYTtnQ0FDM0NsQixRQUFRO2dDQUNSRSxhQUFhO2dDQUNiOzRCQUNGOzRCQUVBRixRQUFRO2dDQUFFZSxJQUFJaEIsS0FBS2dCLEVBQUU7Z0NBQUVLLE9BQU9yQixLQUFLcUIsS0FBSztnQ0FBRUcsTUFBTTs0QkFBTTt3QkFDeEQsT0FBTzs0QkFDTGQsUUFBUUosS0FBSyxDQUFDLGlDQUFpQ007NEJBQy9DWCxRQUFRO3dCQUNWO29CQUNGLE9BQU87d0JBQ0xBLFFBQVFVO29CQUNWO29CQUVBUixhQUFhO2dCQUNmOztZQUVBQztRQUNGOzRCQUFHLEVBQUU7SUFFTCxPQUFPO1FBQUVKO1FBQU1FO0lBQVU7QUFDM0IiLCJzb3VyY2VzIjpbIi93b3Jrc3BhY2VzL1Byb0ZpeElRL3NyYy9ob29rcy91c2VVc2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIHNyYy9ob29rcy91c2VVc2VyLnRzXG4ndXNlIGNsaWVudCc7XG5cbmltcG9ydCB7IHVzZUVmZmVjdCwgdXNlU3RhdGUgfSBmcm9tICdyZWFjdCc7XG5pbXBvcnQgc3VwYWJhc2UgZnJvbSAnQC9saWIvc3VwYWJhc2VDbGllbnQnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiB1c2VVc2VyKCkge1xuICBjb25zdCBbdXNlciwgc2V0VXNlcl0gPSB1c2VTdGF0ZTxhbnk+KG51bGwpO1xuICBjb25zdCBbaXNMb2FkaW5nLCBzZXRJc0xvYWRpbmddID0gdXNlU3RhdGUodHJ1ZSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBmZXRjaFVzZXIgPSBhc3luYyAoKSA9PiB7XG4gICAgICBzZXRJc0xvYWRpbmcodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IHtcbiAgICAgICAgZGF0YTogeyB1c2VyIH0sXG4gICAgICAgIGVycm9yOiB1c2VyRXJyb3IsXG4gICAgICB9ID0gYXdhaXQgc3VwYWJhc2UuYXV0aC5nZXRVc2VyKCk7XG5cbiAgICAgIGlmICh1c2VyRXJyb3IgfHwgIXVzZXIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2V0dGluZyB1c2VyOicsIHVzZXJFcnJvcik7XG4gICAgICAgIHNldFVzZXIobnVsbCk7XG4gICAgICAgIHNldElzTG9hZGluZyhmYWxzZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgeyBkYXRhOiBwcm9maWxlLCBlcnJvcjogcHJvZmlsZUVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxuICAgICAgICAuZnJvbSgncHJvZmlsZXMnKVxuICAgICAgICAuc2VsZWN0KCcqJylcbiAgICAgICAgLmVxKCdpZCcsIHVzZXIuaWQpXG4gICAgICAgIC5zaW5nbGUoKTtcblxuICAgICAgaWYgKHByb2ZpbGVFcnJvcikge1xuICAgICAgICBpZiAocHJvZmlsZUVycm9yLmNvZGUgPT09ICdQR1JTVDExNicpIHtcbiAgICAgICAgICAvLyBOb3QgZm91bmQsIGNyZWF0ZSBuZXcgcHJvZmlsZVxuICAgICAgICAgIGNvbnN0IHsgZXJyb3I6IGluc2VydEVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5mcm9tKCdwcm9maWxlcycpLmluc2VydCh7XG4gICAgICAgICAgICBpZDogdXNlci5pZCxcbiAgICAgICAgICAgIGVtYWlsOiB1c2VyLmVtYWlsLFxuICAgICAgICAgICAgbmFtZTogdXNlci51c2VyX21ldGFkYXRhPy5uYW1lID8/ICcnLFxuICAgICAgICAgICAgcGxhbjogJ2RpeScsXG4gICAgICAgICAgICBzaG9wX25hbWU6ICcnLFxuICAgICAgICAgICAgbGFib3JfcmF0ZTogMCxcbiAgICAgICAgICAgIHBhcnRzX21hcmt1cDogMCxcbiAgICAgICAgICAgIGNyZWF0ZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgIHNob3BfaWQ6IG51bGwsXG4gICAgICAgICAgICBpc19hY3RpdmU6IHRydWUsXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoaW5zZXJ0RXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgcHJvZmlsZTonLCBpbnNlcnRFcnJvcik7XG4gICAgICAgICAgICBzZXRVc2VyKG51bGwpO1xuICAgICAgICAgICAgc2V0SXNMb2FkaW5nKGZhbHNlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzZXRVc2VyKHsgaWQ6IHVzZXIuaWQsIGVtYWlsOiB1c2VyLmVtYWlsLCBwbGFuOiAnZGl5JyB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZmV0Y2ggdXNlciBwcm9maWxlOicsIHByb2ZpbGVFcnJvcik7XG4gICAgICAgICAgc2V0VXNlcihudWxsKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0VXNlcihwcm9maWxlKTtcbiAgICAgIH1cblxuICAgICAgc2V0SXNMb2FkaW5nKGZhbHNlKTtcbiAgICB9O1xuXG4gICAgZmV0Y2hVc2VyKCk7XG4gIH0sIFtdKTtcblxuICByZXR1cm4geyB1c2VyLCBpc0xvYWRpbmcgfTtcbn0iXSwibmFtZXMiOlsidXNlRWZmZWN0IiwidXNlU3RhdGUiLCJzdXBhYmFzZSIsInVzZVVzZXIiLCJ1c2VyIiwic2V0VXNlciIsImlzTG9hZGluZyIsInNldElzTG9hZGluZyIsImZldGNoVXNlciIsImRhdGEiLCJlcnJvciIsInVzZXJFcnJvciIsImF1dGgiLCJnZXRVc2VyIiwiY29uc29sZSIsInByb2ZpbGUiLCJwcm9maWxlRXJyb3IiLCJmcm9tIiwic2VsZWN0IiwiZXEiLCJpZCIsInNpbmdsZSIsImNvZGUiLCJpbnNlcnRFcnJvciIsImluc2VydCIsImVtYWlsIiwibmFtZSIsInVzZXJfbWV0YWRhdGEiLCJwbGFuIiwic2hvcF9uYW1lIiwibGFib3JfcmF0ZSIsInBhcnRzX21hcmt1cCIsImNyZWF0ZWRfYXQiLCJEYXRlIiwidG9JU09TdHJpbmciLCJzaG9wX2lkIiwiaXNfYWN0aXZlIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(app-pages-browser)/./src/hooks/useUser.ts\n"));

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