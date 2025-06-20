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
exports.id = "app/api/analyze/route";
exports.ids = ["app/api/analyze/route"];
exports.modules = {

/***/ "(rsc)/./app/api/analyze/route.ts":
/*!**********************************!*\
  !*** ./app/api/analyze/route.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var openai__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! openai */ \"(rsc)/./node_modules/openai/index.mjs\");\n// app/api/analyze/route.ts\n\n\nconst openai = new openai__WEBPACK_IMPORTED_MODULE_1__[\"default\"]({\n    apiKey: process.env.OPENAI_API_KEY\n});\nasync function POST(req) {\n    try {\n        const { image_url, vehicle } = await req.json();\n        if (!image_url || !vehicle?.year || !vehicle.make || !vehicle.model) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: 'Missing image or vehicle info'\n            }, {\n                status: 400\n            });\n        }\n        const prompt = `\nYou are an automotive repair expert. A technician has uploaded a photo of a damaged or faulty component.\nAnalyze the image and describe the issue, likely cause, and recommended fix in a concise format.\n\nRespond with:\n**🔧 Issue:** Describe the problem.\n**💥 Likely Cause:** What likely caused it?\n**🛠 Fix:** Recommended repair steps or part replacement.\n`;\n        const response = await openai.chat.completions.create({\n            model: 'gpt-4-vision-preview',\n            messages: [\n                {\n                    role: 'system',\n                    content: prompt\n                },\n                {\n                    role: 'user',\n                    content: [\n                        {\n                            type: 'image_url',\n                            image_url: {\n                                url: image_url\n                            }\n                        }\n                    ]\n                }\n            ],\n            temperature: 0.4\n        });\n        const result = response.choices[0]?.message?.content;\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            result\n        });\n    } catch (error) {\n        console.error('Image analysis route error:', error);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: 'Failed to analyze image'\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL2FuYWx5emUvcm91dGUudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsMkJBQTJCO0FBRWdCO0FBQ2Y7QUFFNUIsTUFBTUUsU0FBUyxJQUFJRCw4Q0FBTUEsQ0FBQztJQUN4QkUsUUFBUUMsUUFBUUMsR0FBRyxDQUFDQyxjQUFjO0FBQ3BDO0FBRU8sZUFBZUMsS0FBS0MsR0FBWTtJQUNyQyxJQUFJO1FBQ0YsTUFBTSxFQUFFQyxTQUFTLEVBQUVDLE9BQU8sRUFBRSxHQUFHLE1BQU1GLElBQUlHLElBQUk7UUFFN0MsSUFBSSxDQUFDRixhQUFhLENBQUNDLFNBQVNFLFFBQVEsQ0FBQ0YsUUFBUUcsSUFBSSxJQUFJLENBQUNILFFBQVFJLEtBQUssRUFBRTtZQUNuRSxPQUFPZCxxREFBWUEsQ0FBQ1csSUFBSSxDQUFDO2dCQUFFSSxPQUFPO1lBQWdDLEdBQUc7Z0JBQUVDLFFBQVE7WUFBSTtRQUNyRjtRQUVBLE1BQU1DLFNBQVMsQ0FBQzs7Ozs7Ozs7QUFRcEIsQ0FBQztRQUVHLE1BQU1DLFdBQVcsTUFBTWhCLE9BQU9pQixJQUFJLENBQUNDLFdBQVcsQ0FBQ0MsTUFBTSxDQUFDO1lBQ3BEUCxPQUFPO1lBQ1BRLFVBQVU7Z0JBQ1I7b0JBQ0VDLE1BQU07b0JBQ05DLFNBQVNQO2dCQUNYO2dCQUNBO29CQUNFTSxNQUFNO29CQUNOQyxTQUFTO3dCQUNQOzRCQUNFQyxNQUFNOzRCQUNOaEIsV0FBVztnQ0FBRWlCLEtBQUtqQjs0QkFBVTt3QkFDOUI7cUJBQ0Q7Z0JBQ0g7YUFDRDtZQUNEa0IsYUFBYTtRQUNmO1FBRUEsTUFBTUMsU0FBU1YsU0FBU1csT0FBTyxDQUFDLEVBQUUsRUFBRUMsU0FBU047UUFDN0MsT0FBT3hCLHFEQUFZQSxDQUFDVyxJQUFJLENBQUM7WUFBRWlCO1FBQU87SUFDcEMsRUFBRSxPQUFPYixPQUFPO1FBQ2RnQixRQUFRaEIsS0FBSyxDQUFDLCtCQUErQkE7UUFDN0MsT0FBT2YscURBQVlBLENBQUNXLElBQUksQ0FBQztZQUFFSSxPQUFPO1FBQTBCLEdBQUc7WUFBRUMsUUFBUTtRQUFJO0lBQy9FO0FBQ0YiLCJzb3VyY2VzIjpbIi93b3Jrc3BhY2VzL1Byb0ZpeElRL2FwcC9hcGkvYW5hbHl6ZS9yb3V0ZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBhcHAvYXBpL2FuYWx5emUvcm91dGUudHNcblxuaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSAnbmV4dC9zZXJ2ZXInO1xuaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuXG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHtcbiAgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSxcbn0pO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gUE9TVChyZXE6IFJlcXVlc3QpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IGltYWdlX3VybCwgdmVoaWNsZSB9ID0gYXdhaXQgcmVxLmpzb24oKTtcblxuICAgIGlmICghaW1hZ2VfdXJsIHx8ICF2ZWhpY2xlPy55ZWFyIHx8ICF2ZWhpY2xlLm1ha2UgfHwgIXZlaGljbGUubW9kZWwpIHtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiAnTWlzc2luZyBpbWFnZSBvciB2ZWhpY2xlIGluZm8nIH0sIHsgc3RhdHVzOiA0MDAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbXB0ID0gYFxuWW91IGFyZSBhbiBhdXRvbW90aXZlIHJlcGFpciBleHBlcnQuIEEgdGVjaG5pY2lhbiBoYXMgdXBsb2FkZWQgYSBwaG90byBvZiBhIGRhbWFnZWQgb3IgZmF1bHR5IGNvbXBvbmVudC5cbkFuYWx5emUgdGhlIGltYWdlIGFuZCBkZXNjcmliZSB0aGUgaXNzdWUsIGxpa2VseSBjYXVzZSwgYW5kIHJlY29tbWVuZGVkIGZpeCBpbiBhIGNvbmNpc2UgZm9ybWF0LlxuXG5SZXNwb25kIHdpdGg6XG4qKvCflKcgSXNzdWU6KiogRGVzY3JpYmUgdGhlIHByb2JsZW0uXG4qKvCfkqUgTGlrZWx5IENhdXNlOioqIFdoYXQgbGlrZWx5IGNhdXNlZCBpdD9cbioq8J+boCBGaXg6KiogUmVjb21tZW5kZWQgcmVwYWlyIHN0ZXBzIG9yIHBhcnQgcmVwbGFjZW1lbnQuXG5gO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuY2hhdC5jb21wbGV0aW9ucy5jcmVhdGUoe1xuICAgICAgbW9kZWw6ICdncHQtNC12aXNpb24tcHJldmlldycsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogcHJvbXB0LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgdHlwZTogJ2ltYWdlX3VybCcsXG4gICAgICAgICAgICAgIGltYWdlX3VybDogeyB1cmw6IGltYWdlX3VybCB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjQsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSByZXNwb25zZS5jaG9pY2VzWzBdPy5tZXNzYWdlPy5jb250ZW50O1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IHJlc3VsdCB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdJbWFnZSBhbmFseXNpcyByb3V0ZSBlcnJvcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gYW5hbHl6ZSBpbWFnZScgfSwgeyBzdGF0dXM6IDUwMCB9KTtcbiAgfVxufSJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJPcGVuQUkiLCJvcGVuYWkiLCJhcGlLZXkiLCJwcm9jZXNzIiwiZW52IiwiT1BFTkFJX0FQSV9LRVkiLCJQT1NUIiwicmVxIiwiaW1hZ2VfdXJsIiwidmVoaWNsZSIsImpzb24iLCJ5ZWFyIiwibWFrZSIsIm1vZGVsIiwiZXJyb3IiLCJzdGF0dXMiLCJwcm9tcHQiLCJyZXNwb25zZSIsImNoYXQiLCJjb21wbGV0aW9ucyIsImNyZWF0ZSIsIm1lc3NhZ2VzIiwicm9sZSIsImNvbnRlbnQiLCJ0eXBlIiwidXJsIiwidGVtcGVyYXR1cmUiLCJyZXN1bHQiLCJjaG9pY2VzIiwibWVzc2FnZSIsImNvbnNvbGUiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/api/analyze/route.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fanalyze%2Froute&page=%2Fapi%2Fanalyze%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fanalyze%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!*******************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fanalyze%2Froute&page=%2Fapi%2Fanalyze%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fanalyze%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \*******************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _workspaces_ProFixIQ_app_api_analyze_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/analyze/route.ts */ \"(rsc)/./app/api/analyze/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/analyze/route\",\n        pathname: \"/api/analyze\",\n        filename: \"route\",\n        bundlePath: \"app/api/analyze/route\"\n    },\n    resolvedPagePath: \"/workspaces/ProFixIQ/app/api/analyze/route.ts\",\n    nextConfigOutput,\n    userland: _workspaces_ProFixIQ_app_api_analyze_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZhbmFseXplJTJGcm91dGUmcGFnZT0lMkZhcGklMkZhbmFseXplJTJGcm91dGUmYXBwUGF0aHM9JnBhZ2VQYXRoPXByaXZhdGUtbmV4dC1hcHAtZGlyJTJGYXBpJTJGYW5hbHl6ZSUyRnJvdXRlLnRzJmFwcERpcj0lMkZ3b3Jrc3BhY2VzJTJGUHJvRml4SVElMkZhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPSUyRndvcmtzcGFjZXMlMkZQcm9GaXhJUSZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD0mcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBK0Y7QUFDdkM7QUFDcUI7QUFDSDtBQUMxRTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiL3dvcmtzcGFjZXMvUHJvRml4SVEvYXBwL2FwaS9hbmFseXplL3JvdXRlLnRzXCI7XG4vLyBXZSBpbmplY3QgdGhlIG5leHRDb25maWdPdXRwdXQgaGVyZSBzbyB0aGF0IHdlIGNhbiB1c2UgdGhlbSBpbiB0aGUgcm91dGVcbi8vIG1vZHVsZS5cbmNvbnN0IG5leHRDb25maWdPdXRwdXQgPSBcIlwiXG5jb25zdCByb3V0ZU1vZHVsZSA9IG5ldyBBcHBSb3V0ZVJvdXRlTW9kdWxlKHtcbiAgICBkZWZpbml0aW9uOiB7XG4gICAgICAgIGtpbmQ6IFJvdXRlS2luZC5BUFBfUk9VVEUsXG4gICAgICAgIHBhZ2U6IFwiL2FwaS9hbmFseXplL3JvdXRlXCIsXG4gICAgICAgIHBhdGhuYW1lOiBcIi9hcGkvYW5hbHl6ZVwiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvYW5hbHl6ZS9yb3V0ZVwiXG4gICAgfSxcbiAgICByZXNvbHZlZFBhZ2VQYXRoOiBcIi93b3Jrc3BhY2VzL1Byb0ZpeElRL2FwcC9hcGkvYW5hbHl6ZS9yb3V0ZS50c1wiLFxuICAgIG5leHRDb25maWdPdXRwdXQsXG4gICAgdXNlcmxhbmRcbn0pO1xuLy8gUHVsbCBvdXQgdGhlIGV4cG9ydHMgdGhhdCB3ZSBuZWVkIHRvIGV4cG9zZSBmcm9tIHRoZSBtb2R1bGUuIFRoaXMgc2hvdWxkXG4vLyBiZSBlbGltaW5hdGVkIHdoZW4gd2UndmUgbW92ZWQgdGhlIG90aGVyIHJvdXRlcyB0byB0aGUgbmV3IGZvcm1hdC4gVGhlc2Vcbi8vIGFyZSB1c2VkIHRvIGhvb2sgaW50byB0aGUgcm91dGUuXG5jb25zdCB7IHdvcmtBc3luY1N0b3JhZ2UsIHdvcmtVbml0QXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcyB9ID0gcm91dGVNb2R1bGU7XG5mdW5jdGlvbiBwYXRjaEZldGNoKCkge1xuICAgIHJldHVybiBfcGF0Y2hGZXRjaCh7XG4gICAgICAgIHdvcmtBc3luY1N0b3JhZ2UsXG4gICAgICAgIHdvcmtVbml0QXN5bmNTdG9yYWdlXG4gICAgfSk7XG59XG5leHBvcnQgeyByb3V0ZU1vZHVsZSwgd29ya0FzeW5jU3RvcmFnZSwgd29ya1VuaXRBc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzLCBwYXRjaEZldGNoLCAgfTtcblxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YXBwLXJvdXRlLmpzLm1hcCJdLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fanalyze%2Froute&page=%2Fapi%2Fanalyze%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fanalyze%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



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
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@opentelemetry","vendor-chunks/openai"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fanalyze%2Froute&page=%2Fapi%2Fanalyze%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fanalyze%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();