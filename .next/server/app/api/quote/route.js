/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/quote/route";
exports.ids = ["app/api/quote/route"];
exports.modules = {

/***/ "(rsc)/./app/api/quote/route.ts":
/*!********************************!*\
  !*** ./app/api/quote/route.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var _lib_quote_generateQuoteFromInspection__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/lib/quote/generateQuoteFromInspection */ \"(rsc)/./src/lib/quote/generateQuoteFromInspection.ts\");\n\n\nasync function POST(req) {\n    try {\n        const body = await req.json();\n        const results = body.results;\n        if (!results || !Array.isArray(results)) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"Invalid or missing results.\"\n            }, {\n                status: 400\n            });\n        }\n        const { summary, quote } = (0,_lib_quote_generateQuoteFromInspection__WEBPACK_IMPORTED_MODULE_1__.generateQuoteFromInspection)(results);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            summary,\n            quote\n        });\n    } catch (err) {\n        console.error(\"Quote generation failed:\", err);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"Internal error generating quote.\"\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL3F1b3RlL3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7OztBQUF3RDtBQUM4QjtBQUcvRSxlQUFlRSxLQUFLQyxHQUFnQjtJQUN6QyxJQUFJO1FBQ0YsTUFBTUMsT0FBTyxNQUFNRCxJQUFJRSxJQUFJO1FBQzNCLE1BQU1DLFVBQWtDRixLQUFLRSxPQUFPO1FBRXBELElBQUksQ0FBQ0EsV0FBVyxDQUFDQyxNQUFNQyxPQUFPLENBQUNGLFVBQVU7WUFDdkMsT0FBT04scURBQVlBLENBQUNLLElBQUksQ0FBQztnQkFBRUksT0FBTztZQUE4QixHQUFHO2dCQUFFQyxRQUFRO1lBQUk7UUFDbkY7UUFFQSxNQUFNLEVBQUVDLE9BQU8sRUFBRUMsS0FBSyxFQUFFLEdBQUdYLG1HQUEyQkEsQ0FBQ0s7UUFFdkQsT0FBT04scURBQVlBLENBQUNLLElBQUksQ0FBQztZQUFFTTtZQUFTQztRQUFNO0lBQzVDLEVBQUUsT0FBT0MsS0FBSztRQUNaQyxRQUFRTCxLQUFLLENBQUMsNEJBQTRCSTtRQUMxQyxPQUFPYixxREFBWUEsQ0FBQ0ssSUFBSSxDQUFDO1lBQUVJLE9BQU87UUFBbUMsR0FBRztZQUFFQyxRQUFRO1FBQUk7SUFDeEY7QUFDRiIsInNvdXJjZXMiOlsiL3dvcmtzcGFjZXMvUHJvRml4SVEvYXBwL2FwaS9xdW90ZS9yb3V0ZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0UmVxdWVzdCwgTmV4dFJlc3BvbnNlIH0gZnJvbSBcIm5leHQvc2VydmVyXCI7XG5pbXBvcnQgeyBnZW5lcmF0ZVF1b3RlRnJvbUluc3BlY3Rpb24gfSBmcm9tIFwiQC9saWIvcXVvdGUvZ2VuZXJhdGVRdW90ZUZyb21JbnNwZWN0aW9uXCI7XG5pbXBvcnQgeyBJbnNwZWN0aW9uUmVzdWx0SXRlbSB9IGZyb20gXCJAL2xpYi9xdW90ZS90eXBlc1wiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gUE9TVChyZXE6IE5leHRSZXF1ZXN0KSB7XG4gIHRyeSB7XG4gICAgY29uc3QgYm9keSA9IGF3YWl0IHJlcS5qc29uKCk7XG4gICAgY29uc3QgcmVzdWx0czogSW5zcGVjdGlvblJlc3VsdEl0ZW1bXSA9IGJvZHkucmVzdWx0cztcblxuICAgIGlmICghcmVzdWx0cyB8fCAhQXJyYXkuaXNBcnJheShyZXN1bHRzKSkge1xuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6IFwiSW52YWxpZCBvciBtaXNzaW5nIHJlc3VsdHMuXCIgfSwgeyBzdGF0dXM6IDQwMCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHN1bW1hcnksIHF1b3RlIH0gPSBnZW5lcmF0ZVF1b3RlRnJvbUluc3BlY3Rpb24ocmVzdWx0cyk7XG5cbiAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBzdW1tYXJ5LCBxdW90ZSB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcIlF1b3RlIGdlbmVyYXRpb24gZmFpbGVkOlwiLCBlcnIpO1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiBcIkludGVybmFsIGVycm9yIGdlbmVyYXRpbmcgcXVvdGUuXCIgfSwgeyBzdGF0dXM6IDUwMCB9KTtcbiAgfVxufSJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJnZW5lcmF0ZVF1b3RlRnJvbUluc3BlY3Rpb24iLCJQT1NUIiwicmVxIiwiYm9keSIsImpzb24iLCJyZXN1bHRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZXJyb3IiLCJzdGF0dXMiLCJzdW1tYXJ5IiwicXVvdGUiLCJlcnIiLCJjb25zb2xlIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./app/api/quote/route.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fquote%2Froute&page=%2Fapi%2Fquote%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fquote%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!*************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fquote%2Froute&page=%2Fapi%2Fquote%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fquote%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \*************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _workspaces_ProFixIQ_app_api_quote_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/quote/route.ts */ \"(rsc)/./app/api/quote/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/quote/route\",\n        pathname: \"/api/quote\",\n        filename: \"route\",\n        bundlePath: \"app/api/quote/route\"\n    },\n    resolvedPagePath: \"/workspaces/ProFixIQ/app/api/quote/route.ts\",\n    nextConfigOutput,\n    userland: _workspaces_ProFixIQ_app_api_quote_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZxdW90ZSUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGcXVvdGUlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZxdW90ZSUyRnJvdXRlLnRzJmFwcERpcj0lMkZ3b3Jrc3BhY2VzJTJGUHJvRml4SVElMkZhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPSUyRndvcmtzcGFjZXMlMkZQcm9GaXhJUSZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD0mcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBK0Y7QUFDdkM7QUFDcUI7QUFDTDtBQUN4RTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiL3dvcmtzcGFjZXMvUHJvRml4SVEvYXBwL2FwaS9xdW90ZS9yb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvcXVvdGUvcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2FwaS9xdW90ZVwiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvcXVvdGUvcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCIvd29ya3NwYWNlcy9Qcm9GaXhJUS9hcHAvYXBpL3F1b3RlL3JvdXRlLnRzXCIsXG4gICAgbmV4dENvbmZpZ091dHB1dCxcbiAgICB1c2VybGFuZFxufSk7XG4vLyBQdWxsIG91dCB0aGUgZXhwb3J0cyB0aGF0IHdlIG5lZWQgdG8gZXhwb3NlIGZyb20gdGhlIG1vZHVsZS4gVGhpcyBzaG91bGRcbi8vIGJlIGVsaW1pbmF0ZWQgd2hlbiB3ZSd2ZSBtb3ZlZCB0aGUgb3RoZXIgcm91dGVzIHRvIHRoZSBuZXcgZm9ybWF0LiBUaGVzZVxuLy8gYXJlIHVzZWQgdG8gaG9vayBpbnRvIHRoZSByb3V0ZS5cbmNvbnN0IHsgd29ya0FzeW5jU3RvcmFnZSwgd29ya1VuaXRBc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgd29ya0FzeW5jU3RvcmFnZSxcbiAgICAgICAgd29ya1VuaXRBc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MsIHBhdGNoRmV0Y2gsICB9O1xuXG4vLyMgc291cmNlTWFwcGluZ1VSTD1hcHAtcm91dGUuanMubWFwIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fquote%2Froute&page=%2Fapi%2Fquote%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fquote%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



/***/ }),

/***/ "(rsc)/./src/lib/quote/generateQuoteFromInspection.ts":
/*!******************************************************!*\
  !*** ./src/lib/quote/generateQuoteFromInspection.ts ***!
  \******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   generateQuoteFromInspection: () => (/* binding */ generateQuoteFromInspection)\n/* harmony export */ });\n/* harmony import */ var _matchToMenuItem__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./matchToMenuItem */ \"(rsc)/./src/lib/quote/matchToMenuItem.ts\");\n\nfunction generateQuoteFromInspection(results) {\n    const failed = results.filter((r)=>r.status === \"fail\");\n    const recommended = results.filter((r)=>r.status === \"recommend\");\n    const summary = [\n        `Completed Vehicle Inspection.`,\n        failed.length ? `⚠️ Failed Items:` : null,\n        ...failed.map((item)=>`- ${item.name}: ${item.notes || \"Requires attention\"}`),\n        recommended.length ? `🛠️ Recommended Items:` : null,\n        ...recommended.map((item)=>`- ${item.name}: ${item.notes || \"Suggested repair\"}`)\n    ].filter(Boolean).join(\"\\n\");\n    const quote = [];\n    for (const item of [\n        ...failed,\n        ...recommended\n    ]){\n        const matched = (0,_matchToMenuItem__WEBPACK_IMPORTED_MODULE_0__.matchToMenuItem)(item.name, item.notes || \"\");\n        if (matched) {\n            quote.push({\n                part: matched.part,\n                laborHours: matched.laborHours,\n                description: matched.description,\n                price: matched.price,\n                type: item.status === \"fail\" ? \"repair\" : \"recommend\"\n            });\n        }\n    }\n    return {\n        summary,\n        quote\n    };\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL3F1b3RlL2dlbmVyYXRlUXVvdGVGcm9tSW5zcGVjdGlvbi50cyIsIm1hcHBpbmdzIjoiOzs7OztBQUFvRDtBQUc3QyxTQUFTQyw0QkFBNEJDLE9BQStCO0lBSXpFLE1BQU1DLFNBQVNELFFBQVFFLE1BQU0sQ0FBQyxDQUFDQyxJQUFNQSxFQUFFQyxNQUFNLEtBQUs7SUFDbEQsTUFBTUMsY0FBY0wsUUFBUUUsTUFBTSxDQUFDLENBQUNDLElBQU1BLEVBQUVDLE1BQU0sS0FBSztJQUV2RCxNQUFNRSxVQUFVO1FBQ2QsQ0FBQyw2QkFBNkIsQ0FBQztRQUMvQkwsT0FBT00sTUFBTSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsR0FBRztXQUNsQ04sT0FBT08sR0FBRyxDQUFDLENBQUNDLE9BQVMsQ0FBQyxFQUFFLEVBQUVBLEtBQUtDLElBQUksQ0FBQyxFQUFFLEVBQUVELEtBQUtFLEtBQUssSUFBSSxzQkFBc0I7UUFDL0VOLFlBQVlFLE1BQU0sR0FBRyxDQUFDLHNCQUFzQixDQUFDLEdBQUc7V0FDN0NGLFlBQVlHLEdBQUcsQ0FBQyxDQUFDQyxPQUFTLENBQUMsRUFBRSxFQUFFQSxLQUFLQyxJQUFJLENBQUMsRUFBRSxFQUFFRCxLQUFLRSxLQUFLLElBQUksb0JBQW9CO0tBQ25GLENBQ0VULE1BQU0sQ0FBQ1UsU0FDUEMsSUFBSSxDQUFDO0lBRVIsTUFBTUMsUUFBeUIsRUFBRTtJQUVqQyxLQUFLLE1BQU1MLFFBQVE7V0FBSVI7V0FBV0k7S0FBWSxDQUFFO1FBQzlDLE1BQU1VLFVBQVVqQixpRUFBZUEsQ0FBQ1csS0FBS0MsSUFBSSxFQUFFRCxLQUFLRSxLQUFLLElBQUk7UUFFekQsSUFBSUksU0FBUztZQUNYRCxNQUFNRSxJQUFJLENBQUM7Z0JBQ1RDLE1BQU1GLFFBQVFFLElBQUk7Z0JBQ2xCQyxZQUFZSCxRQUFRRyxVQUFVO2dCQUM5QkMsYUFBYUosUUFBUUksV0FBVztnQkFDaENDLE9BQU9MLFFBQVFLLEtBQUs7Z0JBQ3BCQyxNQUFNWixLQUFLTCxNQUFNLEtBQUssU0FBUyxXQUFXO1lBQzVDO1FBQ0Y7SUFDRjtJQUVBLE9BQU87UUFBRUU7UUFBU1E7SUFBTTtBQUMxQiIsInNvdXJjZXMiOlsiL3dvcmtzcGFjZXMvUHJvRml4SVEvc3JjL2xpYi9xdW90ZS9nZW5lcmF0ZVF1b3RlRnJvbUluc3BlY3Rpb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbWF0Y2hUb01lbnVJdGVtIH0gZnJvbSBcIi4vbWF0Y2hUb01lbnVJdGVtXCI7XG5pbXBvcnQgeyBRdW90ZUxpbmVJdGVtLCBJbnNwZWN0aW9uUmVzdWx0SXRlbSB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVF1b3RlRnJvbUluc3BlY3Rpb24ocmVzdWx0czogSW5zcGVjdGlvblJlc3VsdEl0ZW1bXSk6IHtcbiAgc3VtbWFyeTogc3RyaW5nO1xuICBxdW90ZTogUXVvdGVMaW5lSXRlbVtdO1xufSB7XG4gIGNvbnN0IGZhaWxlZCA9IHJlc3VsdHMuZmlsdGVyKChyKSA9PiByLnN0YXR1cyA9PT0gXCJmYWlsXCIpO1xuICBjb25zdCByZWNvbW1lbmRlZCA9IHJlc3VsdHMuZmlsdGVyKChyKSA9PiByLnN0YXR1cyA9PT0gXCJyZWNvbW1lbmRcIik7XG5cbiAgY29uc3Qgc3VtbWFyeSA9IFtcbiAgICBgQ29tcGxldGVkIFZlaGljbGUgSW5zcGVjdGlvbi5gLFxuICAgIGZhaWxlZC5sZW5ndGggPyBg4pqg77iPIEZhaWxlZCBJdGVtczpgIDogbnVsbCxcbiAgICAuLi5mYWlsZWQubWFwKChpdGVtKSA9PiBgLSAke2l0ZW0ubmFtZX06ICR7aXRlbS5ub3RlcyB8fCBcIlJlcXVpcmVzIGF0dGVudGlvblwifWApLFxuICAgIHJlY29tbWVuZGVkLmxlbmd0aCA/IGDwn5ug77iPIFJlY29tbWVuZGVkIEl0ZW1zOmAgOiBudWxsLFxuICAgIC4uLnJlY29tbWVuZGVkLm1hcCgoaXRlbSkgPT4gYC0gJHtpdGVtLm5hbWV9OiAke2l0ZW0ubm90ZXMgfHwgXCJTdWdnZXN0ZWQgcmVwYWlyXCJ9YCksXG4gIF1cbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oXCJcXG5cIik7XG5cbiAgY29uc3QgcXVvdGU6IFF1b3RlTGluZUl0ZW1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgaXRlbSBvZiBbLi4uZmFpbGVkLCAuLi5yZWNvbW1lbmRlZF0pIHtcbiAgICBjb25zdCBtYXRjaGVkID0gbWF0Y2hUb01lbnVJdGVtKGl0ZW0ubmFtZSwgaXRlbS5ub3RlcyB8fCBcIlwiKTtcblxuICAgIGlmIChtYXRjaGVkKSB7XG4gICAgICBxdW90ZS5wdXNoKHtcbiAgICAgICAgcGFydDogbWF0Y2hlZC5wYXJ0LFxuICAgICAgICBsYWJvckhvdXJzOiBtYXRjaGVkLmxhYm9ySG91cnMsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBtYXRjaGVkLmRlc2NyaXB0aW9uLFxuICAgICAgICBwcmljZTogbWF0Y2hlZC5wcmljZSxcbiAgICAgICAgdHlwZTogaXRlbS5zdGF0dXMgPT09IFwiZmFpbFwiID8gXCJyZXBhaXJcIiA6IFwicmVjb21tZW5kXCIsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBzdW1tYXJ5LCBxdW90ZSB9O1xufSJdLCJuYW1lcyI6WyJtYXRjaFRvTWVudUl0ZW0iLCJnZW5lcmF0ZVF1b3RlRnJvbUluc3BlY3Rpb24iLCJyZXN1bHRzIiwiZmFpbGVkIiwiZmlsdGVyIiwiciIsInN0YXR1cyIsInJlY29tbWVuZGVkIiwic3VtbWFyeSIsImxlbmd0aCIsIm1hcCIsIml0ZW0iLCJuYW1lIiwibm90ZXMiLCJCb29sZWFuIiwiam9pbiIsInF1b3RlIiwibWF0Y2hlZCIsInB1c2giLCJwYXJ0IiwibGFib3JIb3VycyIsImRlc2NyaXB0aW9uIiwicHJpY2UiLCJ0eXBlIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/quote/generateQuoteFromInspection.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/quote/matchToMenuItem.ts":
/*!******************************************!*\
  !*** ./src/lib/quote/matchToMenuItem.ts ***!
  \******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   matchToMenuItem: () => (/* binding */ matchToMenuItem)\n/* harmony export */ });\n// Basic smart matcher using keywords — upgradeable later to vector or AI matching\nfunction matchToMenuItem(name, notes) {\n    const lowerText = (name + \" \" + notes).toLowerCase();\n    if (lowerText.includes(\"brake\") && lowerText.includes(\"2mm\")) {\n        return {\n            description: \"Front Brake Pad Replacement\",\n            part: {\n                name: \"Front Brake Pads\",\n                price: 79.99\n            },\n            laborHours: 1.5,\n            price: 189.99,\n            type: \"repair\"\n        };\n    }\n    if (lowerText.includes(\"battery\") && lowerText.includes(\"low\")) {\n        return {\n            description: \"Battery Replacement\",\n            part: {\n                name: \"12V Battery\",\n                price: 139.99\n            },\n            laborHours: 0.5,\n            price: 89.99,\n            type: \"repair\"\n        };\n    }\n    if (lowerText.includes(\"air filter\")) {\n        return {\n            description: \"Air Filter Replacement\",\n            part: {\n                name: \"Engine Air Filter\",\n                price: 24.99\n            },\n            laborHours: 0.3,\n            price: 29.99,\n            type: \"maintenance\"\n        };\n    }\n    return null; // Fallback — show for tech review\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL3F1b3RlL21hdGNoVG9NZW51SXRlbS50cyIsIm1hcHBpbmdzIjoiOzs7O0FBRUEsa0ZBQWtGO0FBQzNFLFNBQVNBLGdCQUFnQkMsSUFBWSxFQUFFQyxLQUFhO0lBQ3pELE1BQU1DLFlBQVksQ0FBQ0YsT0FBTyxNQUFNQyxLQUFJLEVBQUdFLFdBQVc7SUFFbEQsSUFBSUQsVUFBVUUsUUFBUSxDQUFDLFlBQVlGLFVBQVVFLFFBQVEsQ0FBQyxRQUFRO1FBQzVELE9BQU87WUFDTEMsYUFBYTtZQUNiQyxNQUFNO2dCQUFFTixNQUFNO2dCQUFvQk8sT0FBTztZQUFNO1lBQy9DQyxZQUFZO1lBQ1pELE9BQU87WUFDUEUsTUFBTTtRQUNSO0lBQ0Y7SUFFQSxJQUFJUCxVQUFVRSxRQUFRLENBQUMsY0FBY0YsVUFBVUUsUUFBUSxDQUFDLFFBQVE7UUFDOUQsT0FBTztZQUNMQyxhQUFhO1lBQ2JDLE1BQU07Z0JBQUVOLE1BQU07Z0JBQWVPLE9BQU87WUFBTztZQUMzQ0MsWUFBWTtZQUNaRCxPQUFPO1lBQ1BFLE1BQU07UUFDUjtJQUNGO0lBRUEsSUFBSVAsVUFBVUUsUUFBUSxDQUFDLGVBQWU7UUFDcEMsT0FBTztZQUNMQyxhQUFhO1lBQ2JDLE1BQU07Z0JBQUVOLE1BQU07Z0JBQXFCTyxPQUFPO1lBQU07WUFDaERDLFlBQVk7WUFDWkQsT0FBTztZQUNQRSxNQUFNO1FBQ1I7SUFDRjtJQUVBLE9BQU8sTUFBTSxrQ0FBa0M7QUFDakQiLCJzb3VyY2VzIjpbIi93b3Jrc3BhY2VzL1Byb0ZpeElRL3NyYy9saWIvcXVvdGUvbWF0Y2hUb01lbnVJdGVtLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFF1b3RlTGluZUl0ZW0gfSBmcm9tIFwiLi90eXBlc1wiO1xuXG4vLyBCYXNpYyBzbWFydCBtYXRjaGVyIHVzaW5nIGtleXdvcmRzIOKAlCB1cGdyYWRlYWJsZSBsYXRlciB0byB2ZWN0b3Igb3IgQUkgbWF0Y2hpbmdcbmV4cG9ydCBmdW5jdGlvbiBtYXRjaFRvTWVudUl0ZW0obmFtZTogc3RyaW5nLCBub3Rlczogc3RyaW5nKTogUXVvdGVMaW5lSXRlbSB8IG51bGwge1xuICBjb25zdCBsb3dlclRleHQgPSAobmFtZSArIFwiIFwiICsgbm90ZXMpLnRvTG93ZXJDYXNlKCk7XG5cbiAgaWYgKGxvd2VyVGV4dC5pbmNsdWRlcyhcImJyYWtlXCIpICYmIGxvd2VyVGV4dC5pbmNsdWRlcyhcIjJtbVwiKSkge1xuICAgIHJldHVybiB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJGcm9udCBCcmFrZSBQYWQgUmVwbGFjZW1lbnRcIixcbiAgICAgIHBhcnQ6IHsgbmFtZTogXCJGcm9udCBCcmFrZSBQYWRzXCIsIHByaWNlOiA3OS45OSB9LFxuICAgICAgbGFib3JIb3VyczogMS41LFxuICAgICAgcHJpY2U6IDE4OS45OSxcbiAgICAgIHR5cGU6IFwicmVwYWlyXCIsXG4gICAgfTtcbiAgfVxuXG4gIGlmIChsb3dlclRleHQuaW5jbHVkZXMoXCJiYXR0ZXJ5XCIpICYmIGxvd2VyVGV4dC5pbmNsdWRlcyhcImxvd1wiKSkge1xuICAgIHJldHVybiB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJCYXR0ZXJ5IFJlcGxhY2VtZW50XCIsXG4gICAgICBwYXJ0OiB7IG5hbWU6IFwiMTJWIEJhdHRlcnlcIiwgcHJpY2U6IDEzOS45OSB9LFxuICAgICAgbGFib3JIb3VyczogMC41LFxuICAgICAgcHJpY2U6IDg5Ljk5LFxuICAgICAgdHlwZTogXCJyZXBhaXJcIixcbiAgICB9O1xuICB9XG5cbiAgaWYgKGxvd2VyVGV4dC5pbmNsdWRlcyhcImFpciBmaWx0ZXJcIikpIHtcbiAgICByZXR1cm4ge1xuICAgICAgZGVzY3JpcHRpb246IFwiQWlyIEZpbHRlciBSZXBsYWNlbWVudFwiLFxuICAgICAgcGFydDogeyBuYW1lOiBcIkVuZ2luZSBBaXIgRmlsdGVyXCIsIHByaWNlOiAyNC45OSB9LFxuICAgICAgbGFib3JIb3VyczogMC4zLFxuICAgICAgcHJpY2U6IDI5Ljk5LFxuICAgICAgdHlwZTogXCJtYWludGVuYW5jZVwiLFxuICAgIH07XG4gIH1cblxuICByZXR1cm4gbnVsbDsgLy8gRmFsbGJhY2sg4oCUIHNob3cgZm9yIHRlY2ggcmV2aWV3XG59Il0sIm5hbWVzIjpbIm1hdGNoVG9NZW51SXRlbSIsIm5hbWUiLCJub3RlcyIsImxvd2VyVGV4dCIsInRvTG93ZXJDYXNlIiwiaW5jbHVkZXMiLCJkZXNjcmlwdGlvbiIsInBhcnQiLCJwcmljZSIsImxhYm9ySG91cnMiLCJ0eXBlIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/quote/matchToMenuItem.ts\n");

/***/ }),

/***/ "(ssr)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



/***/ }),

/***/ "../app-render/after-task-async-storage.external":
/*!***********************************************************************************!*\
  !*** external "next/dist/server/app-render/after-task-async-storage.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/after-task-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-async-storage.external":
/*!*****************************************************************************!*\
  !*** external "next/dist/server/app-render/work-async-storage.external.js" ***!
  \*****************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/work-async-storage.external.js");

/***/ }),

/***/ "./work-unit-async-storage.external":
/*!**********************************************************************************!*\
  !*** external "next/dist/server/app-render/work-unit-async-storage.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/work-unit-async-storage.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@opentelemetry"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fquote%2Froute&page=%2Fapi%2Fquote%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fquote%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();