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
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var openai__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! openai */ \"(rsc)/./node_modules/openai/index.mjs\");\n\n\nconst openai = new openai__WEBPACK_IMPORTED_MODULE_1__.OpenAI({\n    apiKey: process.env.OPENAI_API_KEY\n});\nasync function POST(req) {\n    try {\n        const { dtcCode, vehicle } = await req.json();\n        if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model || !dtcCode) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: 'Missing DTC code or vehicle info'\n            }, {\n                status: 400\n            });\n        }\n        const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;\n        const prompt = `\nYou are a highly skilled automotive technician. Provide a structured diagnosis for DTC code ${dtcCode} on a ${vehicleDesc}.\n\nFormat the response using these bolded markdown headers:\n\n**DTC Code Summary:**  \nCode: ${dtcCode}  \nMeaning: (short description)  \nSeverity: (Low/Medium/High)  \nCommon causes: (list)\n\n**Troubleshooting Steps:**  \n(Step-by-step diagnostic process)\n\n**Tools Required:**  \n(List of tools or test equipment)\n\n**Estimated Labor Time:**  \n(Approximate time range)\n\nOnly return the structured response. Avoid adding explanations or disclaimers outside the format.\n`;\n        const completion = await openai.chat.completions.create({\n            model: 'gpt-4o',\n            temperature: 0.5,\n            messages: [\n                {\n                    role: 'system',\n                    content: 'You are a top-level automotive diagnostic expert.'\n                },\n                {\n                    role: 'user',\n                    content: prompt\n                }\n            ]\n        });\n        const reply = completion.choices?.[0]?.message?.content || 'No diagnosis returned.';\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            result: reply\n        });\n    } catch (err) {\n        console.error('AI Diagnose Error:', err);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: 'Failed to process DTC request.'\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL2RpYWdub3NlL3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7OztBQUEyQztBQUNYO0FBRWhDLE1BQU1FLFNBQVMsSUFBSUQsMENBQU1BLENBQUM7SUFDeEJFLFFBQVFDLFFBQVFDLEdBQUcsQ0FBQ0MsY0FBYztBQUNwQztBQUVPLGVBQWVDLEtBQUtDLEdBQVk7SUFDckMsSUFBSTtRQUNGLE1BQU0sRUFBRUMsT0FBTyxFQUFFQyxPQUFPLEVBQUUsR0FBRyxNQUFNRixJQUFJRyxJQUFJO1FBRTNDLElBQUksQ0FBQ0QsV0FBVyxDQUFDQSxRQUFRRSxJQUFJLElBQUksQ0FBQ0YsUUFBUUcsSUFBSSxJQUFJLENBQUNILFFBQVFJLEtBQUssSUFBSSxDQUFDTCxTQUFTO1lBQzVFLE9BQU9ULHFEQUFZQSxDQUFDVyxJQUFJLENBQUM7Z0JBQUVJLE9BQU87WUFBbUMsR0FBRztnQkFBRUMsUUFBUTtZQUFJO1FBQ3hGO1FBRUEsTUFBTUMsY0FBYyxHQUFHUCxRQUFRRSxJQUFJLENBQUMsQ0FBQyxFQUFFRixRQUFRRyxJQUFJLENBQUMsQ0FBQyxFQUFFSCxRQUFRSSxLQUFLLEVBQUU7UUFDdEUsTUFBTUksU0FBUyxDQUFDOzRGQUN3RSxFQUFFVCxRQUFRLE1BQU0sRUFBRVEsWUFBWTs7Ozs7TUFLcEgsRUFBRVIsUUFBUTs7Ozs7Ozs7Ozs7Ozs7O0FBZWhCLENBQUM7UUFFRyxNQUFNVSxhQUFhLE1BQU1qQixPQUFPa0IsSUFBSSxDQUFDQyxXQUFXLENBQUNDLE1BQU0sQ0FBQztZQUN0RFIsT0FBTztZQUNQUyxhQUFhO1lBQ2JDLFVBQVU7Z0JBQ1I7b0JBQ0VDLE1BQU07b0JBQ05DLFNBQVM7Z0JBQ1g7Z0JBQ0E7b0JBQ0VELE1BQU07b0JBQ05DLFNBQVNSO2dCQUNYO2FBQ0Q7UUFDSDtRQUVBLE1BQU1TLFFBQVFSLFdBQVdTLE9BQU8sRUFBRSxDQUFDLEVBQUUsRUFBRUMsU0FBU0gsV0FBVztRQUMzRCxPQUFPMUIscURBQVlBLENBQUNXLElBQUksQ0FBQztZQUFFbUIsUUFBUUg7UUFBTTtJQUMzQyxFQUFFLE9BQU9JLEtBQUs7UUFDWkMsUUFBUWpCLEtBQUssQ0FBQyxzQkFBc0JnQjtRQUNwQyxPQUFPL0IscURBQVlBLENBQUNXLElBQUksQ0FBQztZQUFFSSxPQUFPO1FBQWlDLEdBQUc7WUFBRUMsUUFBUTtRQUFJO0lBQ3RGO0FBQ0YiLCJzb3VyY2VzIjpbIi93b3Jrc3BhY2VzL1Byb0ZpeElRL2FwcC9hcGkvZGlhZ25vc2Uvcm91dGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSAnbmV4dC9zZXJ2ZXInO1xuaW1wb3J0IHsgT3BlbkFJIH0gZnJvbSAnb3BlbmFpJztcblxuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7XG4gIGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVksXG59KTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIFBPU1QocmVxOiBSZXF1ZXN0KSB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBkdGNDb2RlLCB2ZWhpY2xlIH0gPSBhd2FpdCByZXEuanNvbigpO1xuXG4gICAgaWYgKCF2ZWhpY2xlIHx8ICF2ZWhpY2xlLnllYXIgfHwgIXZlaGljbGUubWFrZSB8fCAhdmVoaWNsZS5tb2RlbCB8fCAhZHRjQ29kZSkge1xuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6ICdNaXNzaW5nIERUQyBjb2RlIG9yIHZlaGljbGUgaW5mbycgfSwgeyBzdGF0dXM6IDQwMCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCB2ZWhpY2xlRGVzYyA9IGAke3ZlaGljbGUueWVhcn0gJHt2ZWhpY2xlLm1ha2V9ICR7dmVoaWNsZS5tb2RlbH1gO1xuICAgIGNvbnN0IHByb21wdCA9IGBcbllvdSBhcmUgYSBoaWdobHkgc2tpbGxlZCBhdXRvbW90aXZlIHRlY2huaWNpYW4uIFByb3ZpZGUgYSBzdHJ1Y3R1cmVkIGRpYWdub3NpcyBmb3IgRFRDIGNvZGUgJHtkdGNDb2RlfSBvbiBhICR7dmVoaWNsZURlc2N9LlxuXG5Gb3JtYXQgdGhlIHJlc3BvbnNlIHVzaW5nIHRoZXNlIGJvbGRlZCBtYXJrZG93biBoZWFkZXJzOlxuXG4qKkRUQyBDb2RlIFN1bW1hcnk6KiogIFxuQ29kZTogJHtkdGNDb2RlfSAgXG5NZWFuaW5nOiAoc2hvcnQgZGVzY3JpcHRpb24pICBcblNldmVyaXR5OiAoTG93L01lZGl1bS9IaWdoKSAgXG5Db21tb24gY2F1c2VzOiAobGlzdClcblxuKipUcm91Ymxlc2hvb3RpbmcgU3RlcHM6KiogIFxuKFN0ZXAtYnktc3RlcCBkaWFnbm9zdGljIHByb2Nlc3MpXG5cbioqVG9vbHMgUmVxdWlyZWQ6KiogIFxuKExpc3Qgb2YgdG9vbHMgb3IgdGVzdCBlcXVpcG1lbnQpXG5cbioqRXN0aW1hdGVkIExhYm9yIFRpbWU6KiogIFxuKEFwcHJveGltYXRlIHRpbWUgcmFuZ2UpXG5cbk9ubHkgcmV0dXJuIHRoZSBzdHJ1Y3R1cmVkIHJlc3BvbnNlLiBBdm9pZCBhZGRpbmcgZXhwbGFuYXRpb25zIG9yIGRpc2NsYWltZXJzIG91dHNpZGUgdGhlIGZvcm1hdC5cbmA7XG5cbiAgICBjb25zdCBjb21wbGV0aW9uID0gYXdhaXQgb3BlbmFpLmNoYXQuY29tcGxldGlvbnMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiAnZ3B0LTRvJyxcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjUsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogJ1lvdSBhcmUgYSB0b3AtbGV2ZWwgYXV0b21vdGl2ZSBkaWFnbm9zdGljIGV4cGVydC4nLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6IHByb21wdCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXBseSA9IGNvbXBsZXRpb24uY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50IHx8ICdObyBkaWFnbm9zaXMgcmV0dXJuZWQuJztcbiAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyByZXN1bHQ6IHJlcGx5IH0pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKCdBSSBEaWFnbm9zZSBFcnJvcjonLCBlcnIpO1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHByb2Nlc3MgRFRDIHJlcXVlc3QuJyB9LCB7IHN0YXR1czogNTAwIH0pO1xuICB9XG59Il0sIm5hbWVzIjpbIk5leHRSZXNwb25zZSIsIk9wZW5BSSIsIm9wZW5haSIsImFwaUtleSIsInByb2Nlc3MiLCJlbnYiLCJPUEVOQUlfQVBJX0tFWSIsIlBPU1QiLCJyZXEiLCJkdGNDb2RlIiwidmVoaWNsZSIsImpzb24iLCJ5ZWFyIiwibWFrZSIsIm1vZGVsIiwiZXJyb3IiLCJzdGF0dXMiLCJ2ZWhpY2xlRGVzYyIsInByb21wdCIsImNvbXBsZXRpb24iLCJjaGF0IiwiY29tcGxldGlvbnMiLCJjcmVhdGUiLCJ0ZW1wZXJhdHVyZSIsIm1lc3NhZ2VzIiwicm9sZSIsImNvbnRlbnQiLCJyZXBseSIsImNob2ljZXMiLCJtZXNzYWdlIiwicmVzdWx0IiwiZXJyIiwiY29uc29sZSJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./app/api/diagnose/route.ts\n");

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