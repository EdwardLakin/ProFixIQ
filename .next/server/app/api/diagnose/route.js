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
exports.id = "app/api/diagnose/route";
exports.ids = ["app/api/diagnose/route"];
exports.modules = {

/***/ "(rsc)/./app/api/diagnose/route.ts":
/*!***********************************!*\
  !*** ./app/api/diagnose/route.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var openai__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! openai */ \"(rsc)/./node_modules/openai/index.mjs\");\n\n\nconst openai = new openai__WEBPACK_IMPORTED_MODULE_1__[\"default\"]({\n    apiKey: process.env.OPENAI_API_KEY\n});\nasync function POST(req) {\n    try {\n        const { vehicle, dtcCode, context } = await req.json();\n        if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model || !dtcCode?.trim()) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: 'Missing vehicle info or DTC code'\n            }, {\n                status: 400\n            });\n        }\n        const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;\n        const systemPrompt = `You are a top-level automotive diagnostic expert. A technician is working on a ${vehicleDesc} and needs help diagnosing DTC code ${dtcCode}. Reply in clear markdown format using sections like **DTC Code Summary**, **Troubleshooting Steps**, **Recommended Fix**, and **Estimated Labor Time**.`;\n        const messages = [\n            {\n                role: 'system',\n                content: systemPrompt\n            },\n            {\n                role: 'user',\n                content: `Code: ${dtcCode}`\n            }\n        ];\n        // If follow-up context is provided, thread it in\n        if (context && context.trim().length > 0) {\n            messages.push({\n                role: 'assistant',\n                content: `Previous diagnosis has already been provided for DTC ${dtcCode}.`\n            });\n            messages.push({\n                role: 'user',\n                content: context\n            });\n        }\n        const completion = await openai.chat.completions.create({\n            model: 'gpt-4o',\n            temperature: 0.6,\n            messages\n        });\n        const reply = completion.choices?.[0]?.message?.content?.trim() || 'No response.';\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            result: reply\n        });\n    } catch (err) {\n        console.error('DTC handler error:', err);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: 'Failed to generate DTC response.'\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL2RpYWdub3NlL3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7OztBQUEyQztBQUNmO0FBRTVCLE1BQU1FLFNBQVMsSUFBSUQsOENBQU1BLENBQUM7SUFDeEJFLFFBQVFDLFFBQVFDLEdBQUcsQ0FBQ0MsY0FBYztBQUNwQztBQUVPLGVBQWVDLEtBQUtDLEdBQVk7SUFDckMsSUFBSTtRQUNGLE1BQU0sRUFBRUMsT0FBTyxFQUFFQyxPQUFPLEVBQUVDLE9BQU8sRUFBRSxHQUFHLE1BQU1ILElBQUlJLElBQUk7UUFFcEQsSUFDRSxDQUFDSCxXQUNELENBQUNBLFFBQVFJLElBQUksSUFDYixDQUFDSixRQUFRSyxJQUFJLElBQ2IsQ0FBQ0wsUUFBUU0sS0FBSyxJQUNkLENBQUNMLFNBQVNNLFFBQ1Y7WUFDQSxPQUFPaEIscURBQVlBLENBQUNZLElBQUksQ0FDdEI7Z0JBQUVLLE9BQU87WUFBbUMsR0FDNUM7Z0JBQUVDLFFBQVE7WUFBSTtRQUVsQjtRQUVBLE1BQU1DLGNBQWMsR0FBR1YsUUFBUUksSUFBSSxDQUFDLENBQUMsRUFBRUosUUFBUUssSUFBSSxDQUFDLENBQUMsRUFBRUwsUUFBUU0sS0FBSyxFQUFFO1FBQ3RFLE1BQU1LLGVBQWUsQ0FBQywrRUFBK0UsRUFBRUQsWUFBWSxvQ0FBb0MsRUFBRVQsUUFBUSx3SkFBd0osQ0FBQztRQUUxVCxNQUFNVyxXQUFxRDtZQUN6RDtnQkFBRUMsTUFBTTtnQkFBVUMsU0FBU0g7WUFBYTtZQUN4QztnQkFBRUUsTUFBTTtnQkFBUUMsU0FBUyxDQUFDLE1BQU0sRUFBRWIsU0FBUztZQUFDO1NBQzdDO1FBRUQsaURBQWlEO1FBQ2pELElBQUlDLFdBQVdBLFFBQVFLLElBQUksR0FBR1EsTUFBTSxHQUFHLEdBQUc7WUFDeENILFNBQVNJLElBQUksQ0FBQztnQkFDWkgsTUFBTTtnQkFDTkMsU0FBUyxDQUFDLHFEQUFxRCxFQUFFYixRQUFRLENBQUMsQ0FBQztZQUM3RTtZQUNBVyxTQUFTSSxJQUFJLENBQUM7Z0JBQ1pILE1BQU07Z0JBQ05DLFNBQVNaO1lBQ1g7UUFDRjtRQUVBLE1BQU1lLGFBQWEsTUFBTXhCLE9BQU95QixJQUFJLENBQUNDLFdBQVcsQ0FBQ0MsTUFBTSxDQUFDO1lBQ3REZCxPQUFPO1lBQ1BlLGFBQWE7WUFDYlQ7UUFDRjtRQUVBLE1BQU1VLFFBQVFMLFdBQVdNLE9BQU8sRUFBRSxDQUFDLEVBQUUsRUFBRUMsU0FBU1YsU0FBU1AsVUFBVTtRQUNuRSxPQUFPaEIscURBQVlBLENBQUNZLElBQUksQ0FBQztZQUFFc0IsUUFBUUg7UUFBTTtJQUMzQyxFQUFFLE9BQU9JLEtBQUs7UUFDWkMsUUFBUW5CLEtBQUssQ0FBQyxzQkFBc0JrQjtRQUNwQyxPQUFPbkMscURBQVlBLENBQUNZLElBQUksQ0FBQztZQUFFSyxPQUFPO1FBQW1DLEdBQUc7WUFBRUMsUUFBUTtRQUFJO0lBQ3hGO0FBQ0YiLCJzb3VyY2VzIjpbIi93b3Jrc3BhY2VzL1Byb0ZpeElRL2FwcC9hcGkvZGlhZ25vc2Uvcm91dGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSAnbmV4dC9zZXJ2ZXInO1xuaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuXG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHtcbiAgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSxcbn0pO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gUE9TVChyZXE6IFJlcXVlc3QpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHZlaGljbGUsIGR0Y0NvZGUsIGNvbnRleHQgfSA9IGF3YWl0IHJlcS5qc29uKCk7XG5cbiAgICBpZiAoXG4gICAgICAhdmVoaWNsZSB8fFxuICAgICAgIXZlaGljbGUueWVhciB8fFxuICAgICAgIXZlaGljbGUubWFrZSB8fFxuICAgICAgIXZlaGljbGUubW9kZWwgfHxcbiAgICAgICFkdGNDb2RlPy50cmltKClcbiAgICApIHtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihcbiAgICAgICAgeyBlcnJvcjogJ01pc3NpbmcgdmVoaWNsZSBpbmZvIG9yIERUQyBjb2RlJyB9LFxuICAgICAgICB7IHN0YXR1czogNDAwIH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgdmVoaWNsZURlc2MgPSBgJHt2ZWhpY2xlLnllYXJ9ICR7dmVoaWNsZS5tYWtlfSAke3ZlaGljbGUubW9kZWx9YDtcbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBgWW91IGFyZSBhIHRvcC1sZXZlbCBhdXRvbW90aXZlIGRpYWdub3N0aWMgZXhwZXJ0LiBBIHRlY2huaWNpYW4gaXMgd29ya2luZyBvbiBhICR7dmVoaWNsZURlc2N9IGFuZCBuZWVkcyBoZWxwIGRpYWdub3NpbmcgRFRDIGNvZGUgJHtkdGNDb2RlfS4gUmVwbHkgaW4gY2xlYXIgbWFya2Rvd24gZm9ybWF0IHVzaW5nIHNlY3Rpb25zIGxpa2UgKipEVEMgQ29kZSBTdW1tYXJ5KiosICoqVHJvdWJsZXNob290aW5nIFN0ZXBzKiosICoqUmVjb21tZW5kZWQgRml4KiosIGFuZCAqKkVzdGltYXRlZCBMYWJvciBUaW1lKiouYDtcblxuICAgIGNvbnN0IG1lc3NhZ2VzOiBPcGVuQUkuQ2hhdC5DaGF0Q29tcGxldGlvbk1lc3NhZ2VQYXJhbVtdID0gW1xuICAgICAgeyByb2xlOiAnc3lzdGVtJywgY29udGVudDogc3lzdGVtUHJvbXB0IH0sXG4gICAgICB7IHJvbGU6ICd1c2VyJywgY29udGVudDogYENvZGU6ICR7ZHRjQ29kZX1gIH0sXG4gICAgXTtcblxuICAgIC8vIElmIGZvbGxvdy11cCBjb250ZXh0IGlzIHByb3ZpZGVkLCB0aHJlYWQgaXQgaW5cbiAgICBpZiAoY29udGV4dCAmJiBjb250ZXh0LnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICBtZXNzYWdlcy5wdXNoKHtcbiAgICAgICAgcm9sZTogJ2Fzc2lzdGFudCcsXG4gICAgICAgIGNvbnRlbnQ6IGBQcmV2aW91cyBkaWFnbm9zaXMgaGFzIGFscmVhZHkgYmVlbiBwcm92aWRlZCBmb3IgRFRDICR7ZHRjQ29kZX0uYCxcbiAgICAgIH0pO1xuICAgICAgbWVzc2FnZXMucHVzaCh7XG4gICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgY29udGVudDogY29udGV4dCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbXBsZXRpb24gPSBhd2FpdCBvcGVuYWkuY2hhdC5jb21wbGV0aW9ucy5jcmVhdGUoe1xuICAgICAgbW9kZWw6ICdncHQtNG8nLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuNixcbiAgICAgIG1lc3NhZ2VzLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVwbHkgPSBjb21wbGV0aW9uLmNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudD8udHJpbSgpIHx8ICdObyByZXNwb25zZS4nO1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IHJlc3VsdDogcmVwbHkgfSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0RUQyBoYW5kbGVyIGVycm9yOicsIGVycik7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gZ2VuZXJhdGUgRFRDIHJlc3BvbnNlLicgfSwgeyBzdGF0dXM6IDUwMCB9KTtcbiAgfVxufSJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJPcGVuQUkiLCJvcGVuYWkiLCJhcGlLZXkiLCJwcm9jZXNzIiwiZW52IiwiT1BFTkFJX0FQSV9LRVkiLCJQT1NUIiwicmVxIiwidmVoaWNsZSIsImR0Y0NvZGUiLCJjb250ZXh0IiwianNvbiIsInllYXIiLCJtYWtlIiwibW9kZWwiLCJ0cmltIiwiZXJyb3IiLCJzdGF0dXMiLCJ2ZWhpY2xlRGVzYyIsInN5c3RlbVByb21wdCIsIm1lc3NhZ2VzIiwicm9sZSIsImNvbnRlbnQiLCJsZW5ndGgiLCJwdXNoIiwiY29tcGxldGlvbiIsImNoYXQiLCJjb21wbGV0aW9ucyIsImNyZWF0ZSIsInRlbXBlcmF0dXJlIiwicmVwbHkiLCJjaG9pY2VzIiwibWVzc2FnZSIsInJlc3VsdCIsImVyciIsImNvbnNvbGUiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/api/diagnose/route.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fdiagnose%2Froute&page=%2Fapi%2Fdiagnose%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fdiagnose%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!**********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fdiagnose%2Froute&page=%2Fapi%2Fdiagnose%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fdiagnose%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \**********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _workspaces_ProFixIQ_app_api_diagnose_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/diagnose/route.ts */ \"(rsc)/./app/api/diagnose/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/diagnose/route\",\n        pathname: \"/api/diagnose\",\n        filename: \"route\",\n        bundlePath: \"app/api/diagnose/route\"\n    },\n    resolvedPagePath: \"/workspaces/ProFixIQ/app/api/diagnose/route.ts\",\n    nextConfigOutput,\n    userland: _workspaces_ProFixIQ_app_api_diagnose_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZkaWFnbm9zZSUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGZGlhZ25vc2UlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZkaWFnbm9zZSUyRnJvdXRlLnRzJmFwcERpcj0lMkZ3b3Jrc3BhY2VzJTJGUHJvRml4SVElMkZhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPSUyRndvcmtzcGFjZXMlMkZQcm9GaXhJUSZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD0mcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBK0Y7QUFDdkM7QUFDcUI7QUFDRjtBQUMzRTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiL3dvcmtzcGFjZXMvUHJvRml4SVEvYXBwL2FwaS9kaWFnbm9zZS9yb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvZGlhZ25vc2Uvcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2FwaS9kaWFnbm9zZVwiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvZGlhZ25vc2Uvcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCIvd29ya3NwYWNlcy9Qcm9GaXhJUS9hcHAvYXBpL2RpYWdub3NlL3JvdXRlLnRzXCIsXG4gICAgbmV4dENvbmZpZ091dHB1dCxcbiAgICB1c2VybGFuZFxufSk7XG4vLyBQdWxsIG91dCB0aGUgZXhwb3J0cyB0aGF0IHdlIG5lZWQgdG8gZXhwb3NlIGZyb20gdGhlIG1vZHVsZS4gVGhpcyBzaG91bGRcbi8vIGJlIGVsaW1pbmF0ZWQgd2hlbiB3ZSd2ZSBtb3ZlZCB0aGUgb3RoZXIgcm91dGVzIHRvIHRoZSBuZXcgZm9ybWF0LiBUaGVzZVxuLy8gYXJlIHVzZWQgdG8gaG9vayBpbnRvIHRoZSByb3V0ZS5cbmNvbnN0IHsgd29ya0FzeW5jU3RvcmFnZSwgd29ya1VuaXRBc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgd29ya0FzeW5jU3RvcmFnZSxcbiAgICAgICAgd29ya1VuaXRBc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MsIHBhdGNoRmV0Y2gsICB9O1xuXG4vLyMgc291cmNlTWFwcGluZ1VSTD1hcHAtcm91dGUuanMubWFwIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fdiagnose%2Froute&page=%2Fapi%2Fdiagnose%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fdiagnose%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

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
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@opentelemetry","vendor-chunks/openai"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fdiagnose%2Froute&page=%2Fapi%2Fdiagnose%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fdiagnose%2Froute.ts&appDir=%2Fworkspaces%2FProFixIQ%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2Fworkspaces%2FProFixIQ&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();