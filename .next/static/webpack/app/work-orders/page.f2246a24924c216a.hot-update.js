/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
self["webpackHotUpdate_N_E"]("app/work-orders/page",{

/***/ "(app-pages-browser)/./src/components/ui/LoadingSpinner.tsx":
/*!**********************************************!*\
  !*** ./src/components/ui/LoadingSpinner.tsx ***!
  \**********************************************/
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


/***/ }),

/***/ "(app-pages-browser)/./src/lib/withAuthAndPlan.tsx":
/*!*************************************!*\
  !*** ./src/lib/withAuthAndPlan.tsx ***!
  \*************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ withAuthAndPlan)\n/* harmony export */ });\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-dev-runtime */ \"(app-pages-browser)/./node_modules/next/dist/compiled/react/jsx-dev-runtime.js\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ \"(app-pages-browser)/./node_modules/next/dist/compiled/react/index.js\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var next_navigation__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/navigation */ \"(app-pages-browser)/./node_modules/next/dist/api/navigation.js\");\n/* harmony import */ var _supabase_auth_helpers_react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @supabase/auth-helpers-react */ \"(app-pages-browser)/./node_modules/@supabase/auth-helpers-react/dist/index.js\");\n/* harmony import */ var _supabase_auth_helpers_react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_supabase_auth_helpers_react__WEBPACK_IMPORTED_MODULE_3__);\n/* harmony import */ var _hooks_useUser__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @/hooks/useUser */ \"(app-pages-browser)/./src/hooks/useUser.ts\");\n/* harmony import */ var _components_ui_LoadingSpinner__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @/components/ui/LoadingSpinner */ \"(app-pages-browser)/./src/components/ui/LoadingSpinner.tsx\");\n/* harmony import */ var _components_ui_LoadingSpinner__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(_components_ui_LoadingSpinner__WEBPACK_IMPORTED_MODULE_5__);\n/* __next_internal_client_entry_do_not_use__ default auto */ \n\n\n\n\n\nfunction withAuthAndPlan(Component) {\n    let requiredPlans = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : [];\n    var _s = $RefreshSig$();\n    return _s(function WrappedComponent(props) {\n        _s();\n        const session = (0,_supabase_auth_helpers_react__WEBPACK_IMPORTED_MODULE_3__.useSession)();\n        const { user, isLoading: userLoading } = (0,_hooks_useUser__WEBPACK_IMPORTED_MODULE_4__.useUser)();\n        const router = (0,next_navigation__WEBPACK_IMPORTED_MODULE_2__.useRouter)();\n        const isAuthorized = requiredPlans.length === 0 || requiredPlans.includes(user === null || user === void 0 ? void 0 : user.plan);\n        (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)({\n            \"withAuthAndPlan.WrappedComponent.useEffect\": ()=>{\n                if (!session && !userLoading) {\n                    router.push('/sign-in');\n                }\n            }\n        }[\"withAuthAndPlan.WrappedComponent.useEffect\"], [\n            session,\n            userLoading,\n            router\n        ]);\n        if (!session || userLoading || !user) {\n            return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"div\", {\n                className: \"flex items-center justify-center min-h-screen Dbg-black\",\n                children: /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)((_components_ui_LoadingSpinner__WEBPACK_IMPORTED_MODULE_5___default()), {}, void 0, false, {\n                    fileName: \"/workspaces/ProFixIQ/src/lib/withAuthAndPlan.tsx\",\n                    lineNumber: 30,\n                    columnNumber: 11\n                }, this)\n            }, void 0, false, {\n                fileName: \"/workspaces/ProFixIQ/src/lib/withAuthAndPlan.tsx\",\n                lineNumber: 29,\n                columnNumber: 9\n            }, this);\n        }\n        if (!isAuthorized) {\n            return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"div\", {\n                className: \"flex flex-col items-center justify-center min-h-screen Dbg-black\",\n                children: [\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"h1\", {\n                        className: \"text-3xl font-bold\",\n                        children: \"Access Denied\"\n                    }, void 0, false, {\n                        fileName: \"/workspaces/ProFixIQ/src/lib/withAuthAndPlan.tsx\",\n                        lineNumber: 38,\n                        columnNumber: 11\n                    }, this),\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"p\", {\n                        className: \"mt-2 text-lg\",\n                        children: \"Your current plan doesn’t grant access to this feature.\"\n                    }, void 0, false, {\n                        fileName: \"/workspaces/ProFixIQ/src/lib/withAuthAndPlan.tsx\",\n                        lineNumber: 39,\n                        columnNumber: 11\n                    }, this)\n                ]\n            }, void 0, true, {\n                fileName: \"/workspaces/ProFixIQ/src/lib/withAuthAndPlan.tsx\",\n                lineNumber: 37,\n                columnNumber: 9\n            }, this);\n        }\n        return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(Component, {\n            ...props\n        }, void 0, false, {\n            fileName: \"/workspaces/ProFixIQ/src/lib/withAuthAndPlan.tsx\",\n            lineNumber: 46,\n            columnNumber: 12\n        }, this);\n    }, \"dX/PKHVrl0zrq8FPtzokqr39e/8=\", false, function() {\n        return [\n            _supabase_auth_helpers_react__WEBPACK_IMPORTED_MODULE_3__.useSession,\n            _hooks_useUser__WEBPACK_IMPORTED_MODULE_4__.useUser,\n            next_navigation__WEBPACK_IMPORTED_MODULE_2__.useRouter\n        ];\n    });\n}\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uL3NyYy9saWIvd2l0aEF1dGhBbmRQbGFuLnRzeCIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQUVrQztBQUNVO0FBQ2M7QUFDaEI7QUFDa0I7QUFFN0MsU0FBU0ssZ0JBQ3RCQyxTQUFpQztRQUNqQ0MsZ0JBQUFBLGlFQUEwQixFQUFFOztJQUU1QixVQUFPLFNBQVNDLGlCQUFpQkMsS0FBUTs7UUFDdkMsTUFBTUMsVUFBVVIsd0VBQVVBO1FBQzFCLE1BQU0sRUFBRVMsSUFBSSxFQUFFQyxXQUFXQyxXQUFXLEVBQUUsR0FBR1YsdURBQU9BO1FBQ2hELE1BQU1XLFNBQVNiLDBEQUFTQTtRQUV4QixNQUFNYyxlQUNKUixjQUFjUyxNQUFNLEtBQUssS0FBS1QsY0FBY1UsUUFBUSxDQUFDTixpQkFBQUEsMkJBQUFBLEtBQU1PLElBQUk7UUFFakVsQixnREFBU0E7MERBQUM7Z0JBQ1IsSUFBSSxDQUFDVSxXQUFXLENBQUNHLGFBQWE7b0JBQzVCQyxPQUFPSyxJQUFJLENBQUM7Z0JBQ2Q7WUFDRjt5REFBRztZQUFDVDtZQUFTRztZQUFhQztTQUFPO1FBRWpDLElBQUksQ0FBQ0osV0FBV0csZUFBZSxDQUFDRixNQUFNO1lBQ3BDLHFCQUNFLDhEQUFDUztnQkFBSUMsV0FBVTswQkFDYiw0RUFBQ2pCLHNFQUFjQTs7Ozs7Ozs7OztRQUdyQjtRQUVBLElBQUksQ0FBQ1csY0FBYztZQUNqQixxQkFDRSw4REFBQ0s7Z0JBQUlDLFdBQVU7O2tDQUNiLDhEQUFDQzt3QkFBR0QsV0FBVTtrQ0FBcUI7Ozs7OztrQ0FDbkMsOERBQUNFO3dCQUFFRixXQUFVO2tDQUFlOzs7Ozs7Ozs7Ozs7UUFLbEM7UUFFQSxxQkFBTyw4REFBQ2Y7WUFBVyxHQUFHRyxLQUFLOzs7Ozs7SUFDN0I7O1lBakNrQlAsb0VBQVVBO1lBQ2VDLG1EQUFPQTtZQUNqQ0Ysc0RBQVNBOzs7QUFnQzVCIiwic291cmNlcyI6WyIvd29ya3NwYWNlcy9Qcm9GaXhJUS9zcmMvbGliL3dpdGhBdXRoQW5kUGxhbi50c3giXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBjbGllbnQnO1xuXG5pbXBvcnQgeyB1c2VFZmZlY3QgfSBmcm9tICdyZWFjdCc7XG5pbXBvcnQgeyB1c2VSb3V0ZXIgfSBmcm9tICduZXh0L25hdmlnYXRpb24nO1xuaW1wb3J0IHsgdXNlU2Vzc2lvbiB9IGZyb20gJ0BzdXBhYmFzZS9hdXRoLWhlbHBlcnMtcmVhY3QnO1xuaW1wb3J0IHsgdXNlVXNlciB9IGZyb20gJ0AvaG9va3MvdXNlVXNlcic7XG5pbXBvcnQgTG9hZGluZ1NwaW5uZXIgZnJvbSAnQC9jb21wb25lbnRzL3VpL0xvYWRpbmdTcGlubmVyJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gd2l0aEF1dGhBbmRQbGFuPFA+KFxuICBDb21wb25lbnQ6IFJlYWN0LkNvbXBvbmVudFR5cGU8UD4sXG4gIHJlcXVpcmVkUGxhbnM6IHN0cmluZ1tdID0gW11cbikge1xuICByZXR1cm4gZnVuY3Rpb24gV3JhcHBlZENvbXBvbmVudChwcm9wczogUCkge1xuICAgIGNvbnN0IHNlc3Npb24gPSB1c2VTZXNzaW9uKCk7XG4gICAgY29uc3QgeyB1c2VyLCBpc0xvYWRpbmc6IHVzZXJMb2FkaW5nIH0gPSB1c2VVc2VyKCk7XG4gICAgY29uc3Qgcm91dGVyID0gdXNlUm91dGVyKCk7XG5cbiAgICBjb25zdCBpc0F1dGhvcml6ZWQgPVxuICAgICAgcmVxdWlyZWRQbGFucy5sZW5ndGggPT09IDAgfHwgcmVxdWlyZWRQbGFucy5pbmNsdWRlcyh1c2VyPy5wbGFuKTtcblxuICAgIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgICBpZiAoIXNlc3Npb24gJiYgIXVzZXJMb2FkaW5nKSB7XG4gICAgICAgIHJvdXRlci5wdXNoKCcvc2lnbi1pbicpO1xuICAgICAgfVxuICAgIH0sIFtzZXNzaW9uLCB1c2VyTG9hZGluZywgcm91dGVyXSk7XG5cbiAgICBpZiAoIXNlc3Npb24gfHwgdXNlckxvYWRpbmcgfHwgIXVzZXIpIHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgbWluLWgtc2NyZWVuIERiZy1ibGFja1wiPlxuICAgICAgICAgIDxMb2FkaW5nU3Bpbm5lciAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKCFpc0F1dGhvcml6ZWQpIHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgbWluLWgtc2NyZWVuIERiZy1ibGFja1wiPlxuICAgICAgICAgIDxoMSBjbGFzc05hbWU9XCJ0ZXh0LTN4bCBmb250LWJvbGRcIj5BY2Nlc3MgRGVuaWVkPC9oMT5cbiAgICAgICAgICA8cCBjbGFzc05hbWU9XCJtdC0yIHRleHQtbGdcIj5cbiAgICAgICAgICAgIFlvdXIgY3VycmVudCBwbGFuIGRvZXNu4oCZdCBncmFudCBhY2Nlc3MgdG8gdGhpcyBmZWF0dXJlLlxuICAgICAgICAgIDwvcD5cbiAgICAgICAgPC9kaXY+XG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiA8Q29tcG9uZW50IHsuLi5wcm9wc30gLz47XG4gIH07XG59Il0sIm5hbWVzIjpbInVzZUVmZmVjdCIsInVzZVJvdXRlciIsInVzZVNlc3Npb24iLCJ1c2VVc2VyIiwiTG9hZGluZ1NwaW5uZXIiLCJ3aXRoQXV0aEFuZFBsYW4iLCJDb21wb25lbnQiLCJyZXF1aXJlZFBsYW5zIiwiV3JhcHBlZENvbXBvbmVudCIsInByb3BzIiwic2Vzc2lvbiIsInVzZXIiLCJpc0xvYWRpbmciLCJ1c2VyTG9hZGluZyIsInJvdXRlciIsImlzQXV0aG9yaXplZCIsImxlbmd0aCIsImluY2x1ZGVzIiwicGxhbiIsInB1c2giLCJkaXYiLCJjbGFzc05hbWUiLCJoMSIsInAiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/./src/lib/withAuthAndPlan.tsx\n"));

/***/ })

});