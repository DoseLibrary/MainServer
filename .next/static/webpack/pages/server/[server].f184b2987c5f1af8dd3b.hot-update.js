webpackHotUpdate_N_E("pages/server/[server]",{

/***/ "./pages/server/[server]/index.js":
/*!****************************************!*\
  !*** ./pages/server/[server]/index.js ***!
  \****************************************/
/*! exports provided: __N_SSP, default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* WEBPACK VAR INJECTION */(function(module) {/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "__N_SSP", function() { return __N_SSP; });
/* harmony import */ var _mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./node_modules/@babel/runtime/helpers/esm/defineProperty */ "./node_modules/@babel/runtime/helpers/esm/defineProperty.js");
/* harmony import */ var _mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./node_modules/@babel/runtime/regenerator */ "./node_modules/@babel/runtime/regenerator/index.js");
/* harmony import */ var _mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./node_modules/@babel/runtime/helpers/esm/asyncToGenerator */ "./node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _components_layout__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../components/layout */ "./components/layout.js");
/* harmony import */ var next_head__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! next/head */ "./node_modules/next/head.js");
/* harmony import */ var next_head__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(next_head__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var node_fetch__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! node-fetch */ "./node_modules/node-fetch/browser.js");
/* harmony import */ var node_fetch__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(node_fetch__WEBPACK_IMPORTED_MODULE_6__);
/* harmony import */ var js_cookie__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! js-cookie */ "./node_modules/js-cookie/src/js.cookie.js");
/* harmony import */ var js_cookie__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/__webpack_require__.n(js_cookie__WEBPACK_IMPORTED_MODULE_7__);
/* harmony import */ var next_router__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! next/router */ "./node_modules/next/router.js");
/* harmony import */ var next_router__WEBPACK_IMPORTED_MODULE_8___default = /*#__PURE__*/__webpack_require__.n(next_router__WEBPACK_IMPORTED_MODULE_8__);
/* harmony import */ var react_bootstrap__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react-bootstrap */ "./node_modules/react-bootstrap/esm/index.js");
/* harmony import */ var next_link__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! next/link */ "./node_modules/next/link.js");
/* harmony import */ var next_link__WEBPACK_IMPORTED_MODULE_10___default = /*#__PURE__*/__webpack_require__.n(next_link__WEBPACK_IMPORTED_MODULE_10__);
/* harmony import */ var _lib_validateServerAccess__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ../../../lib/validateServerAccess */ "./lib/validateServerAccess.js");
/* harmony import */ var _lib_validateServerAccess__WEBPACK_IMPORTED_MODULE_11___default = /*#__PURE__*/__webpack_require__.n(_lib_validateServerAccess__WEBPACK_IMPORTED_MODULE_11__);
/* harmony import */ var _components_hooks_WindowSize__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ../../../components/hooks/WindowSize */ "./components/hooks/WindowSize.js");
/* harmony import */ var _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ../../../styles/server.module.css */ "./styles/server.module.css");
/* harmony import */ var _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default = /*#__PURE__*/__webpack_require__.n(_styles_server_module_css__WEBPACK_IMPORTED_MODULE_13__);
/* harmony import */ var _components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! ../../../components/movieBackdrop */ "./components/movieBackdrop.js");
/* harmony import */ var _components_episodePoster__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! ../../../components/episodePoster */ "./components/episodePoster.js");
/* harmony import */ var socket_io_client__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! socket.io-client */ "./node_modules/socket.io-client/build/index.js");
/* harmony import */ var socket_io_client__WEBPACK_IMPORTED_MODULE_16___default = /*#__PURE__*/__webpack_require__.n(socket_io_client__WEBPACK_IMPORTED_MODULE_16__);
/* harmony import */ var _components_movieBackdrop_module_css__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! ../../../components/movieBackdrop.module.css */ "./components/movieBackdrop.module.css");
/* harmony import */ var _components_movieBackdrop_module_css__WEBPACK_IMPORTED_MODULE_17___default = /*#__PURE__*/__webpack_require__.n(_components_movieBackdrop_module_css__WEBPACK_IMPORTED_MODULE_17__);
/* harmony import */ var react_spring__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! react-spring */ "./node_modules/react-spring/dist/react-spring.esm.js");




var _jsxFileName = "/mnt/h/Code/Dose/Main Server/pages/server/[server]/index.js",
    _this = undefined,
    _s = $RefreshSig$();


var __jsx = react__WEBPACK_IMPORTED_MODULE_3___default.a.createElement;

function _createForOfIteratorHelper(o, allowArrayLike) { var it; if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = o[Symbol.iterator](); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }


















var fetcher = function fetcher(url) {
  return node_fetch__WEBPACK_IMPORTED_MODULE_6___default()(url).then(function (r) {
    return r.json().then(function (result) {
      return result;
    });
  });
};

var main = function main(props) {
  _s();

  // props.server is from the SSR under this function
  var server = props.server;

  var _useState = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])(null),
      latestMovies = _useState[0],
      setLatesMovies = _useState[1];

  var _useState2 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])([]),
      ongoingMovies = _useState2[0],
      setOngoingMovies = _useState2[1];

  var _useState3 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])([]),
      movieWatchList = _useState3[0],
      setMovieWatchList = _useState3[1];

  var _useState4 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])([]),
      ongoingShows = _useState4[0],
      setOngoingShows = _useState4[1];

  var _useState5 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])([]),
      newlyAddedMovies = _useState5[0],
      setNewlyAddedMovies = _useState5[1];

  var _useState6 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])([]),
      newlyAddedShows = _useState6[0],
      setNewlyAddedShows = _useState6[1];

  var _useState7 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])([]),
      newlyAddedEpisodes = _useState7[0],
      setNewlyAddedEpisodes = _useState7[1];

  var _useState8 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])(false),
      recommendedMovie = _useState8[0],
      setRecommendedMovie = _useState8[1];

  var _useState9 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])([]),
      popularMovies = _useState9[0],
      setPopularMovies = _useState9[1];

  var loading = 0;

  var _useState10 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])(false),
      loaded = _useState10[0],
      setLoaded = _useState10[1];

  var socket = socket_io_client__WEBPACK_IMPORTED_MODULE_16___default()(server.server_ip);
  var transitions = Object(react_spring__WEBPACK_IMPORTED_MODULE_18__["useTransition"])(newlyAddedMovies, {
    from: {
      opacity: 0
    },
    enter: {
      opacity: 1
    },
    delay: 200,
    onRest: function onRest() {
      return setNewlyAddedMovies(newlyAddedMovies);
    }
  });
  var windowSize = Object(_components_hooks_WindowSize__WEBPACK_IMPORTED_MODULE_12__["default"])();
  var allContent = [];
  /**
   * Makes a query to the current active server for a list of movies
   * 
   * @param {string} genre 
   * @param {string} orderby 
   * @param {int} limit 
   */

  var getMovieList = /*#__PURE__*/function () {
    var _ref = Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_2__["default"])( /*#__PURE__*/_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default.a.mark(function _callee() {
      var genre,
          orderby,
          limit,
          ongoing,
          watchlist,
          popular,
          _args = arguments;
      return _mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default.a.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              genre = _args.length > 0 && _args[0] !== undefined ? _args[0] : null;
              orderby = _args.length > 1 && _args[1] !== undefined ? _args[1] : null;
              limit = _args.length > 2 && _args[2] !== undefined ? _args[2] : 20;
              ongoing = _args.length > 3 && _args[3] !== undefined ? _args[3] : false;
              watchlist = _args.length > 4 && _args[4] !== undefined ? _args[4] : false;
              popular = _args.length > 5 && _args[5] !== undefined ? _args[5] : false;
              return _context.abrupt("return", new Promise(function (resolve, reject) {
                var url;

                if (ongoing) {
                  url = "".concat(server.server_ip, "/api/movies/list/ongoing?").concat(orderby !== null ? 'orderby=' + orderby + '&' : '', "limit=").concat(limit, "&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken'));
                } else if (watchlist) {
                  url = "".concat(server.server_ip, "/api/movies/list/watchlist?").concat(orderby !== null ? 'orderby=' + orderby + '&' : '', "limit=").concat(limit, "&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken'));
                } else if (popular) {
                  url = "".concat(server.server_ip, "/api/movies/list/popular?").concat(orderby !== null ? 'orderby=' + orderby + '&' : '', "limit=").concat(limit, "&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken'));
                } else {
                  url = "".concat(server.server_ip, "/api/movies/list").concat(genre !== null ? '/genre/' + genre : '', "?").concat(orderby !== null ? 'orderby=' + orderby + '&' : '', "limit=").concat(limit, "&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken'));
                }

                node_fetch__WEBPACK_IMPORTED_MODULE_6___default()(url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    limit: 20
                  })
                }).then(function (r) {
                  return r.json();
                }).then(function (response) {
                  // Mark the movies active image
                  response.result.forEach(function (movie) {
                    var _iterator = _createForOfIteratorHelper(movie.images),
                        _step;

                    try {
                      for (_iterator.s(); !(_step = _iterator.n()).done;) {
                        var image = _step.value;

                        if (image.active) {
                          if (image.type === 'BACKDROP') {
                            if (image.path === 'no_image') {
                              movie.backdrop = null;
                            } else {
                              movie.backdrop = image.path;
                            }
                          } else {
                            if (image.path === 'no_image') {
                              movie.backdrop = null;
                            } else {
                              movie.poster = image.path;
                            }
                          }

                          if (movie.backdrop != null && movie.poster != null) {
                            break;
                          }
                        }
                      }
                    } catch (err) {
                      _iterator.e(err);
                    } finally {
                      _iterator.f();
                    }
                  });
                  resolve(response.result);
                });
              }));

            case 7:
            case "end":
              return _context.stop();
          }
        }
      }, _callee);
    }));

    return function getMovieList() {
      return _ref.apply(this, arguments);
    };
  }();
  /**
   * Makes a query to the current active server for a list of new episodes
   * 
   * @param {string} genre 
   * @param {string} orderby 
   * @param {int} limit 
   */


  var getNewEpisodeList = /*#__PURE__*/function () {
    var _ref2 = Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_2__["default"])( /*#__PURE__*/_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default.a.mark(function _callee2() {
      var orderby,
          limit,
          _args2 = arguments;
      return _mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default.a.wrap(function _callee2$(_context2) {
        while (1) {
          switch (_context2.prev = _context2.next) {
            case 0:
              orderby = _args2.length > 0 && _args2[0] !== undefined ? _args2[0] : null;
              limit = _args2.length > 1 && _args2[1] !== undefined ? _args2[1] : 20;
              return _context2.abrupt("return", new Promise(function (resolve, reject) {
                var url;
                url = "".concat(server.server_ip, "/api/series/list/episodes?").concat(orderby !== null ? 'orderby=' + orderby + '&' : '', "limit=").concat(limit, "&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken'));
                node_fetch__WEBPACK_IMPORTED_MODULE_6___default()(url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    limit: 20
                  })
                }).then(function (r) {
                  return r.json();
                }).then(function (response) {
                  // Mark the movies active image
                  response.result.forEach(function (episode) {
                    var _iterator2 = _createForOfIteratorHelper(episode.images),
                        _step2;

                    try {
                      for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
                        var image = _step2.value;

                        if (image.active) {
                          if (image.type === 'BACKDROP') {
                            if (image.path === 'no_image') {
                              episode.backdrop = null;
                            } else {
                              episode.backdrop = image.path;
                            }
                          } else if (image.type === 'POSTER') {
                            if (image.path === 'no_image') {
                              episode.poster = null;
                            } else {
                              episode.poster = image.path;
                            }
                          } else {
                            if (image.path === 'no_image') {
                              episode.backdrop = null;
                            } else {
                              episode.poster = image.path;
                            }
                          }

                          if (episode.backdrop != null && episode.poster != null) {
                            break;
                          }
                        }
                      }
                    } catch (err) {
                      _iterator2.e(err);
                    } finally {
                      _iterator2.f();
                    }
                  });
                  console.log(response.result);
                  resolve(response.result);
                });
              }));

            case 3:
            case "end":
              return _context2.stop();
          }
        }
      }, _callee2);
    }));

    return function getNewEpisodeList() {
      return _ref2.apply(this, arguments);
    };
  }();

  var getShowList = /*#__PURE__*/function () {
    var _ref3 = Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_2__["default"])( /*#__PURE__*/_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default.a.mark(function _callee3() {
      var genre,
          orderby,
          limit,
          ongoing,
          _args3 = arguments;
      return _mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default.a.wrap(function _callee3$(_context3) {
        while (1) {
          switch (_context3.prev = _context3.next) {
            case 0:
              genre = _args3.length > 0 && _args3[0] !== undefined ? _args3[0] : null;
              orderby = _args3.length > 1 && _args3[1] !== undefined ? _args3[1] : null;
              limit = _args3.length > 2 && _args3[2] !== undefined ? _args3[2] : 20;
              ongoing = _args3.length > 3 && _args3[3] !== undefined ? _args3[3] : false;
              return _context3.abrupt("return", new Promise(function (resolve, reject) {
                var url;

                if (ongoing) {
                  url = "".concat(server.server_ip, "/api/series/list/ongoing?").concat(orderby !== null ? 'orderby=' + orderby + '&' : '', "limit=").concat(limit, "&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken'));
                } else {
                  url = "".concat(server.server_ip, "/api/series/list").concat(genre !== null ? '/genre/' + genre : '', "?").concat(orderby !== null ? 'orderby=' + orderby + '&' : '', "limit=").concat(limit, "&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken'));
                }

                node_fetch__WEBPACK_IMPORTED_MODULE_6___default()(url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    limit: 20
                  })
                }).then(function (r) {
                  return r.json();
                }).then(function (response) {
                  // Mark the movies active image
                  if (ongoing) {
                    response.upcoming.forEach(function (movie) {
                      var _iterator3 = _createForOfIteratorHelper(movie.images),
                          _step3;

                      try {
                        for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
                          var image = _step3.value;

                          if (image.active) {
                            if (image.type === 'BACKDROP') {
                              if (image.path === 'no_image') {
                                movie.backdrop = null;
                              } else {
                                movie.backdrop = image.path;
                              }
                            } else {
                              if (image.path === 'no_image') {
                                movie.backdrop = null;
                              } else {
                                movie.poster = image.path;
                              }
                            }

                            if (movie.backdrop != null && movie.poster != null) {
                              break;
                            }
                          }
                        }
                      } catch (err) {
                        _iterator3.e(err);
                      } finally {
                        _iterator3.f();
                      }
                    });
                    response.ongoing.forEach(function (movie) {
                      var _iterator4 = _createForOfIteratorHelper(movie.images),
                          _step4;

                      try {
                        for (_iterator4.s(); !(_step4 = _iterator4.n()).done;) {
                          var image = _step4.value;

                          if (image.active) {
                            if (image.type === 'BACKDROP') {
                              if (image.path === 'no_image') {
                                movie.backdrop = null;
                              } else {
                                movie.backdrop = image.path;
                              }
                            } else {
                              if (image.path === 'no_image') {
                                movie.backdrop = null;
                              } else {
                                movie.poster = image.path;
                              }
                            }

                            if (movie.backdrop != null && movie.poster != null) {
                              break;
                            }
                          }
                        }
                      } catch (err) {
                        _iterator4.e(err);
                      } finally {
                        _iterator4.f();
                      }
                    });
                    resolve(response);
                    return;
                  }

                  response.result.forEach(function (movie) {
                    var _iterator5 = _createForOfIteratorHelper(movie.images),
                        _step5;

                    try {
                      for (_iterator5.s(); !(_step5 = _iterator5.n()).done;) {
                        var image = _step5.value;

                        if (image.active) {
                          if (image.type === 'BACKDROP') {
                            if (image.path === 'no_image') {
                              movie.backdrop = null;
                            } else {
                              movie.backdrop = image.path;
                            }
                          } else {
                            if (image.path === 'no_image') {
                              movie.backdrop = null;
                            } else {
                              movie.poster = image.path;
                            }
                          }

                          if (movie.backdrop != null && movie.poster != null) {
                            break;
                          }
                        }
                      }
                    } catch (err) {
                      _iterator5.e(err);
                    } finally {
                      _iterator5.f();
                    }
                  });
                  resolve(response.result);
                });
              }));

            case 5:
            case "end":
              return _context3.stop();
          }
        }
      }, _callee3);
    }));

    return function getShowList() {
      return _ref3.apply(this, arguments);
    };
  }();

  var getActiveImage = function getActiveImage(images, type) {
    var _iterator6 = _createForOfIteratorHelper(images),
        _step6;

    try {
      for (_iterator6.s(); !(_step6 = _iterator6.n()).done;) {
        var image = _step6.value;

        if (image.type === type && image.active && image.path != "no_image") {
          return image;
        }
      }
    } catch (err) {
      _iterator6.e(err);
    } finally {
      _iterator6.f();
    }

    return false;
  };

  Object(react__WEBPACK_IMPORTED_MODULE_3__["useEffect"])(function () {
    _lib_validateServerAccess__WEBPACK_IMPORTED_MODULE_11___default()(server, function (serverToken) {
      socket.on("MOVIE", function (movie) {
        var _jsx;

        console.log(movie);
        var movieElements = newlyAddedMovies;
        var img = movie.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(movie.backdrop) : 'https://via.placeholder.com/2000x1000';
        movieElements.push(__jsx(_components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__["default"], (_jsx = {
          markAsDoneButton: true,
          id: movie.id,
          time: movie.watchtime,
          runtime: movie.runtime,
          title: movie.title,
          overview: movie.overview
        }, Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx, "runtime", movie.runtime), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx, "backdrop", img), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx, "onClick", function onClick(id) {
          return selectMovie(movie.id);
        }), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx, "__self", _this), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx, "__source", {
          fileName: _jsxFileName,
          lineNumber: 293,
          columnNumber: 21
        }), _jsx)));
        setNewlyAddedMovies(movieElements);
      }); // Get recommended video (random video right now)

      node_fetch__WEBPACK_IMPORTED_MODULE_6___default()("".concat(server.server_ip, "/api/movies/list/random?trailer=true&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken')), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(function (r) {
        return r.json();
      }).then(function (result) {
        if (result.status === 'success') {
          result.movie.activeLogo = getActiveImage(result.movie.images, 'LOGO');
          console.log(result);
          setRecommendedMovie(result.movie);
        } else {
          console.log("Error getting recommended movie");
        }
      }); // Get all the newest released movies (The slieshow)

      getMovieList(null, 'release_date', 5).then(function (movies) {
        movies.reverse();
        var movieElements = [];

        var _iterator7 = _createForOfIteratorHelper(movies),
            _step7;

        try {
          var _loop = function _loop() {
            var movie = _step7.value;
            var img = movie.backdrop !== null ? "https://image.tmdb.org/t/p/original/".concat(movie.backdrop) : 'https://via.placeholder.com/2000x1000';
            movieElements.push(__jsx(react_bootstrap__WEBPACK_IMPORTED_MODULE_9__["Carousel"].Item, {
              __self: _this,
              __source: {
                fileName: _jsxFileName,
                lineNumber: 326,
                columnNumber: 25
              }
            }, __jsx("img", {
              className: "d-block w-100",
              src: img,
              alt: movie.title,
              style: {
                objectFit: 'cover',
                height: '90vh',
                minHeight: '500px',
                cursor: 'pointer'
              },
              onClick: function onClick() {
                selectMovie(movie.id);
              },
              __self: _this,
              __source: {
                fileName: _jsxFileName,
                lineNumber: 327,
                columnNumber: 29
              }
            }), __jsx(react_bootstrap__WEBPACK_IMPORTED_MODULE_9__["Carousel"].Caption, {
              __self: _this,
              __source: {
                fileName: _jsxFileName,
                lineNumber: 334,
                columnNumber: 29
              }
            }, __jsx("h3", {
              style: {
                textShadow: '0px 0px 6px #000'
              },
              __self: _this,
              __source: {
                fileName: _jsxFileName,
                lineNumber: 335,
                columnNumber: 33
              }
            }, movie.title), __jsx("p", {
              style: {
                textShadow: '0px 0px 6px #000'
              },
              __self: _this,
              __source: {
                fileName: _jsxFileName,
                lineNumber: 336,
                columnNumber: 33
              }
            }, movie.overview))));
          };

          for (_iterator7.s(); !(_step7 = _iterator7.n()).done;) {
            _loop();
          }
        } catch (err) {
          _iterator7.e(err);
        } finally {
          _iterator7.f();
        }

        loading++;
        setLatesMovies(movieElements);
      }).then(function () {
        if (loading == 7) {
          setLoaded(true);
        }
      }); // Get popular movies

      getMovieList(null, 'release_date', 20, false, false, true).then(function (movies) {
        movies.reverse();
        var movieElements = [];

        var _iterator8 = _createForOfIteratorHelper(movies),
            _step8;

        try {
          var _loop2 = function _loop2() {
            var _jsx2;

            var movie = _step8.value;
            var img = movie.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(movie.backdrop) : 'https://via.placeholder.com/2000x1000';
            movieElements.push(__jsx(_components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__["default"], (_jsx2 = {
              markAsDoneButton: true,
              id: movie.id,
              time: movie.watchtime,
              runtime: movie.runtime,
              title: movie.title,
              overview: movie.overview
            }, Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx2, "runtime", movie.runtime), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx2, "backdrop", img), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx2, "onClick", function onClick(id) {
              return selectMovie(movie.id);
            }), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx2, "__self", _this), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx2, "__source", {
              fileName: _jsxFileName,
              lineNumber: 357,
              columnNumber: 25
            }), _jsx2)));
          };

          for (_iterator8.s(); !(_step8 = _iterator8.n()).done;) {
            _loop2();
          }
        } catch (err) {
          _iterator8.e(err);
        } finally {
          _iterator8.f();
        }

        loading++;
        setPopularMovies(movieElements);
      }).then(function () {
        if (loading == 7) {
          setLoaded(true);
        }
      }); // Get ongoing movies

      getMovieList(null, 'release_date', 20, true).then(function (movies) {
        movies.reverse();
        var movieElements = [];

        var _iterator9 = _createForOfIteratorHelper(movies),
            _step9;

        try {
          var _loop3 = function _loop3() {
            var _jsx3;

            var movie = _step9.value;
            var img = movie.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(movie.backdrop) : 'https://via.placeholder.com/2000x1000';
            movieElements.push(__jsx(_components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__["default"], (_jsx3 = {
              markAsDoneButton: true,
              id: movie.id,
              time: movie.watchtime,
              runtime: movie.runtime,
              title: movie.title,
              overview: movie.overview
            }, Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx3, "runtime", movie.runtime), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx3, "backdrop", img), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx3, "onClick", function onClick(id) {
              return selectMovie(movie.id);
            }), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx3, "__self", _this), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx3, "__source", {
              fileName: _jsxFileName,
              lineNumber: 376,
              columnNumber: 25
            }), _jsx3)));
          };

          for (_iterator9.s(); !(_step9 = _iterator9.n()).done;) {
            _loop3();
          }
        } catch (err) {
          _iterator9.e(err);
        } finally {
          _iterator9.f();
        }

        loading++;
        setOngoingMovies(movieElements);
      }).then(function () {
        if (loading == 7) {
          setLoaded(true);
        }
      }); // Get watchlist for movies

      getMovieList(null, 'release_date', 20, false, true).then(function (movies) {
        movies.reverse();
        var movieElements = [];

        var _iterator10 = _createForOfIteratorHelper(movies),
            _step10;

        try {
          var _loop4 = function _loop4() {
            var _jsx4;

            var movie = _step10.value;
            var img = movie.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(movie.backdrop) : 'https://via.placeholder.com/2000x1000';
            movieElements.push(__jsx(_components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__["default"], (_jsx4 = {
              markAsDoneButton: true,
              id: movie.id,
              time: movie.watchtime,
              runtime: movie.runtime,
              title: movie.title,
              overview: movie.overview
            }, Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx4, "runtime", movie.runtime), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx4, "backdrop", img), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx4, "onClick", function onClick(id) {
              return selectMovie(movie.id);
            }), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx4, "__self", _this), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx4, "__source", {
              fileName: _jsxFileName,
              lineNumber: 395,
              columnNumber: 25
            }), _jsx4)));
          };

          for (_iterator10.s(); !(_step10 = _iterator10.n()).done;) {
            _loop4();
          }
        } catch (err) {
          _iterator10.e(err);
        } finally {
          _iterator10.f();
        }

        loading++;
        setMovieWatchList(movieElements);
      }).then(function () {
        if (loading == 7) {
          setLoaded(true);
        }
      }); // Get newly added movies

      getMovieList(null, 'added_date', 20).then(function (movies) {
        var movieElements = [];

        var _iterator11 = _createForOfIteratorHelper(movies),
            _step11;

        try {
          var _loop5 = function _loop5() {
            var _jsx5;

            var movie = _step11.value;
            var img = movie.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(movie.backdrop) : 'https://via.placeholder.com/2000x1000';
            movieElements.push(__jsx(_components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__["default"], (_jsx5 = {
              markAsDoneButton: true,
              id: movie.id,
              time: movie.watchtime,
              runtime: movie.runtime,
              title: movie.title,
              overview: movie.overview
            }, Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx5, "runtime", movie.runtime), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx5, "backdrop", img), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx5, "onClick", function onClick(id) {
              return selectMovie(movie.id);
            }), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx5, "__self", _this), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx5, "__source", {
              fileName: _jsxFileName,
              lineNumber: 413,
              columnNumber: 25
            }), _jsx5)));
          };

          for (_iterator11.s(); !(_step11 = _iterator11.n()).done;) {
            _loop5();
          }
        } catch (err) {
          _iterator11.e(err);
        } finally {
          _iterator11.f();
        }

        loading++;
        setNewlyAddedMovies(movieElements);
      }).then(function () {
        if (loading == 7) {
          setLoaded(true);
        }
      }); // Get newly added shows

      getShowList(null, 'added_date', 20).then(function (shows) {
        var showElements = [];

        var _iterator12 = _createForOfIteratorHelper(shows),
            _step12;

        try {
          var _loop6 = function _loop6() {
            var _jsx6;

            var show = _step12.value;
            var img = show.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(show.backdrop) : 'https://via.placeholder.com/2000x1000';
            showElements.push(__jsx(_components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__["default"], (_jsx6 = {
              markAsDoneButton: true,
              id: show.id,
              time: show.watchtime,
              runtime: show.runtime,
              title: show.title,
              overview: show.overview
            }, Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx6, "runtime", show.runtime), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx6, "backdrop", img), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx6, "onClick", function onClick(id) {
              return selectShow(show.id);
            }), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx6, "__self", _this), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx6, "__source", {
              fileName: _jsxFileName,
              lineNumber: 431,
              columnNumber: 25
            }), _jsx6)));
          };

          for (_iterator12.s(); !(_step12 = _iterator12.n()).done;) {
            _loop6();
          }
        } catch (err) {
          _iterator12.e(err);
        } finally {
          _iterator12.f();
        }

        loading++;
        setNewlyAddedShows(showElements);
      }).then(function () {
        if (loading == 7) {
          setLoaded(true);
        }
      }); // Get ongoing shows

      getShowList(null, 'added_date', 20, true).then(function (result) {
        var showElements = [];

        var _iterator13 = _createForOfIteratorHelper(result.upcoming),
            _step13;

        try {
          var _loop7 = function _loop7() {
            var _jsx7;

            var show = _step13.value;
            var img = show.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(show.backdrop) : 'https://via.placeholder.com/2000x1000';
            showElements.push(__jsx(_components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__["default"], (_jsx7 = {
              showTitle: true,
              markAsDoneButton: true,
              id: show.id,
              time: show.time_watched,
              runtime: show.runtime,
              title: show.season_name + " - Episode " + show.episode_number,
              overview: show.overview
            }, Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx7, "runtime", show.total_time), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx7, "backdrop", img), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx7, "onClick", function onClick(id) {
              return selectEpisode(show.show_id, show.season_number, show.episode_number, show.internalepisodeid);
            }), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx7, "__self", _this), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx7, "__source", {
              fileName: _jsxFileName,
              lineNumber: 448,
              columnNumber: 25
            }), _jsx7)));
          };

          for (_iterator13.s(); !(_step13 = _iterator13.n()).done;) {
            _loop7();
          }
        } catch (err) {
          _iterator13.e(err);
        } finally {
          _iterator13.f();
        }

        var _iterator14 = _createForOfIteratorHelper(result.ongoing),
            _step14;

        try {
          var _loop8 = function _loop8() {
            var _jsx8;

            var show = _step14.value;
            var img = show.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(show.backdrop) : 'https://via.placeholder.com/2000x1000';
            showElements.push(__jsx(_components_movieBackdrop__WEBPACK_IMPORTED_MODULE_14__["default"], (_jsx8 = {
              showTitle: true,
              markAsDoneButton: true,
              id: show.id,
              time: show.time_watched,
              runtime: show.runtime,
              title: show.season_name + " - Episode " + show.episode_number,
              overview: show.overview
            }, Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx8, "runtime", show.total_time), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx8, "backdrop", img), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx8, "onClick", function onClick(id) {
              return selectEpisode(show.show_id, show.season_number, show.episode_number, show.internalepisodeid);
            }), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx8, "__self", _this), Object(_mnt_h_Code_Dose_Main_Server_node_modules_babel_runtime_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_0__["default"])(_jsx8, "__source", {
              fileName: _jsxFileName,
              lineNumber: 455,
              columnNumber: 25
            }), _jsx8)));
          };

          for (_iterator14.s(); !(_step14 = _iterator14.n()).done;) {
            _loop8();
          }
        } catch (err) {
          _iterator14.e(err);
        } finally {
          _iterator14.f();
        }

        loading++;
        setOngoingShows(showElements);
      }).then(function () {
        if (loading == 7) {
          setLoaded(true);
        }
      });
      getNewEpisodeList('added_date', 20).then(function (episodes) {
        var episodeElements = [];

        var _iterator15 = _createForOfIteratorHelper(episodes),
            _step15;

        try {
          for (_iterator15.s(); !(_step15 = _iterator15.n()).done;) {
            var episode = _step15.value;
            var poster = episode.poster !== null ? "https://image.tmdb.org/t/p/w500/".concat(episode.poster) : 'https://via.placeholder.com/500x1000';
            var backdrop = episode.backdrop !== null ? "https://image.tmdb.org/t/p/w500/".concat(episode.backdrop) : 'https://via.placeholder.com/500x1000';
            episodeElements.push(__jsx(_components_episodePoster__WEBPACK_IMPORTED_MODULE_15__["default"], {
              show: episode.serie_id,
              season: episode.season,
              episode: episode.episode,
              poster: poster,
              internalEpisodeID: episode.internalepisodeid,
              backdrop: backdrop,
              onClick: function onClick(season, episode, show, internalEpisodeID) {
                return selectEpisode(show, season, episode, internalEpisodeID);
              },
              __self: _this,
              __source: {
                fileName: _jsxFileName,
                lineNumber: 475,
                columnNumber: 25
              }
            }));
          }
        } catch (err) {
          _iterator15.e(err);
        } finally {
          _iterator15.f();
        }

        loading++;
        setNewlyAddedEpisodes(episodeElements);
      }).then(function () {
        if (loading == 7) {
          setLoaded(true);
        }
      });
    });
  }, [loading]);

  var selectMovie = function selectMovie(id) {
    next_router__WEBPACK_IMPORTED_MODULE_8___default.a.push("/server/".concat(server.server_id, "/movies/video/").concat(id));
  };

  var selectShow = function selectShow(id) {
    next_router__WEBPACK_IMPORTED_MODULE_8___default.a.push("/server/".concat(server.server_id, "/shows/video/").concat(id));
  };

  var selectEpisode = function selectEpisode(showID, seasonNumber, episodeNumber, internalEpisodeID) {
    next_router__WEBPACK_IMPORTED_MODULE_8___default.a.push("/server/".concat(server.server_id, "/shows/video/").concat(showID, "/season/").concat(seasonNumber, "/episode/").concat(episodeNumber, "?internalID=").concat(internalEpisodeID));
  };

  var scrollLeft = function scrollLeft(id) {
    document.getElementById(id).scrollLeft -= window.innerWidth * 0.8;
    window.scrollTo(window.scrollX, window.scrollY - 1);
    window.scrollTo(window.scrollX, window.scrollY + 1);
  };

  var scrollRight = function scrollRight(id) {
    document.getElementById(id).scrollLeft += window.innerWidth * 0.8;
    window.scrollTo(window.scrollX, window.scrollY - 1);
    window.scrollTo(window.scrollX, window.scrollY + 1);
  }; // LAYOUT //


  return __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, !loaded && __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.loadingioSpinnerEclipse,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 517,
      columnNumber: 13
    }
  }, __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.ldio,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 518,
      columnNumber: 13
    }
  }, __jsx("div", {
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 519,
      columnNumber: 17
    }
  }))), loaded && __jsx(_components_layout__WEBPACK_IMPORTED_MODULE_4__["default"], {
    searchEnabled: true,
    server: server,
    serverToken: js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken'),
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 525,
      columnNumber: 9
    }
  }, __jsx(next_head__WEBPACK_IMPORTED_MODULE_5___default.a, {
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 526,
      columnNumber: 9
    }
  }), recommendedMovie != false && __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.recommended,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 530,
      columnNumber: 13
    }
  }, __jsx("video", {
    autoPlay: true,
    loop: true,
    preload: "auto",
    muted: true,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 531,
      columnNumber: 17
    }
  }, __jsx("source", {
    src: "".concat(server.server_ip, "/api/trailer/").concat(recommendedMovie["id"], "?type=MOVIE&token=").concat(js_cookie__WEBPACK_IMPORTED_MODULE_7___default.a.get('serverToken')),
    type: "video/mp4",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 532,
      columnNumber: 21
    }
  })), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.recommendedInformation,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 534,
      columnNumber: 17
    }
  }, recommendedMovie["activeLogo"] != false && __jsx("img", {
    src: "https://image.tmdb.org/t/p/original/".concat(recommendedMovie["activeLogo"].path),
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.logo,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 536,
      columnNumber: 21
    }
  }), recommendedMovie["activeLogo"] == false && __jsx("h1", {
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 539,
      columnNumber: 21
    }
  }, recommendedMovie["title"]), __jsx("p", {
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 541,
      columnNumber: 21
    }
  }, recommendedMovie["overview"]), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.controls,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 542,
      columnNumber: 21
    }
  }, __jsx(next_link__WEBPACK_IMPORTED_MODULE_10___default.a, {
    href: "/server/".concat(server.server_id, "/movies/video/").concat(recommendedMovie["id"], "?autoPlay=true"),
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 543,
      columnNumber: 25
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/001-play-button.png"),
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 544,
      columnNumber: 29
    }
  })), __jsx(next_link__WEBPACK_IMPORTED_MODULE_10___default.a, {
    href: "/server/".concat(server.server_id, "/movies/video/").concat(recommendedMovie["id"]),
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 546,
      columnNumber: 25
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/002-information.png"),
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 547,
      columnNumber: 29
    }
  }))))), __jsx("br", {
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 557,
      columnNumber: 9
    }
  }), __jsx("div", {
    style: {
      color: 'white'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 558,
      columnNumber: 9
    }
  }, __jsx(react_bootstrap__WEBPACK_IMPORTED_MODULE_9__["Container"], {
    fluid: true,
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.contentRows,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 559,
      columnNumber: 13
    }
  }, popularMovies.length > 0 && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("h2", {
    style: {
      textTransform: 'capitalize'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 562,
      columnNumber: 25
    }
  }, "Popul\xE4rt just nu"), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.movieRow,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 563,
      columnNumber: 25
    }
  }, __jsx("div", {
    id: "popularMovies",
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollable,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 564,
      columnNumber: 29
    }
  }, popularMovies), popularMovies.length * 480 > windowSize.width && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    onClick: function onClick() {
      return scrollLeft('popularMovies');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 569,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/left.svg"),
    width: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 570,
      columnNumber: 41
    }
  })), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    style: {
      right: '0'
    },
    onClick: function onClick() {
      return scrollRight('popularMovies');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 572,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/right.svg"),
    width: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 573,
      columnNumber: 41
    }
  })))), __jsx("hr", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.divider,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 578,
      columnNumber: 21
    }
  })), ongoingMovies.length > 0 && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("h2", {
    style: {
      textTransform: 'capitalize'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 584,
      columnNumber: 25
    }
  }, "P\xE5g\xE5ende filmer"), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.movieRow,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 585,
      columnNumber: 25
    }
  }, __jsx("div", {
    id: "ongoingMovies",
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollable,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 586,
      columnNumber: 29
    }
  }, ongoingMovies), ongoingMovies.length * 480 > windowSize.width && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    onClick: function onClick() {
      return scrollLeft('ongoingMovies');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 591,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/left.svg"),
    width: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 592,
      columnNumber: 41
    }
  })), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    style: {
      right: '0'
    },
    onClick: function onClick() {
      return scrollRight('ongoingMovies');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 594,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/right.svg"),
    width: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 595,
      columnNumber: 41
    }
  })))), __jsx("hr", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.divider,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 600,
      columnNumber: 21
    }
  })), ongoingShows.length > 0 && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("h2", {
    style: {
      textTransform: 'capitalize'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 606,
      columnNumber: 25
    }
  }, "P\xE5g\xE5ende serier"), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.movieRow,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 607,
      columnNumber: 25
    }
  }, __jsx("div", {
    id: "ongoingShows",
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollable,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 608,
      columnNumber: 29
    }
  }, ongoingShows), ongoingShows.length * 480 > windowSize.width && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    onClick: function onClick() {
      return scrollLeft('ongoingShows');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 613,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/left.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 614,
      columnNumber: 41
    }
  })), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    style: {
      right: '0'
    },
    onClick: function onClick() {
      return scrollRight('ongoingShows');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 616,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/right.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 617,
      columnNumber: 41
    }
  })))), __jsx("hr", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.divider,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 622,
      columnNumber: 21
    }
  })), newlyAddedMovies.length > 0 && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx(next_link__WEBPACK_IMPORTED_MODULE_10___default.a, {
    href: "/server/" + server.server_id + "/movies",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 628,
      columnNumber: 25
    }
  }, __jsx("a", {
    style: {
      color: 'white'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 628,
      columnNumber: 80
    }
  }, __jsx("h2", {
    style: {
      textTransform: 'capitalize'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 628,
      columnNumber: 108
    }
  }, "Nyligen tillagda filmer"))), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.movieRow,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 629,
      columnNumber: 25
    }
  }, __jsx("div", {
    id: "newlyAddedMovies",
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollable,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 630,
      columnNumber: 29
    }
  }, newlyAddedMovies), newlyAddedMovies.length * 480 > windowSize.width && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    onClick: function onClick() {
      return scrollLeft('newlyAddedMovies');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 635,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/left.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 636,
      columnNumber: 41
    }
  })), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    style: {
      right: '0'
    },
    onClick: function onClick() {
      return scrollRight('newlyAddedMovies');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 638,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/right.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 639,
      columnNumber: 41
    }
  })))), __jsx("hr", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.divider,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 644,
      columnNumber: 21
    }
  })), movieWatchList.length > 0 && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx(next_link__WEBPACK_IMPORTED_MODULE_10___default.a, {
    href: "/server/" + server.server_id + "/movies",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 650,
      columnNumber: 25
    }
  }, __jsx("a", {
    style: {
      color: 'white'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 650,
      columnNumber: 80
    }
  }, __jsx("h2", {
    style: {
      textTransform: 'capitalize'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 650,
      columnNumber: 108
    }
  }, "Filmer att se senare"))), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.movieRow,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 651,
      columnNumber: 25
    }
  }, __jsx("div", {
    id: "movieWatchList",
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollable,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 652,
      columnNumber: 29
    }
  }, movieWatchList), movieWatchList.length * 480 > windowSize.width && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    onClick: function onClick() {
      return scrollLeft('movieWatchList');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 657,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/left.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 658,
      columnNumber: 41
    }
  })), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    style: {
      right: '0'
    },
    onClick: function onClick() {
      return scrollRight('movieWatchList');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 660,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/right.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 661,
      columnNumber: 41
    }
  })))), __jsx("hr", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.divider,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 666,
      columnNumber: 21
    }
  })), newlyAddedEpisodes.length > 0 && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx(next_link__WEBPACK_IMPORTED_MODULE_10___default.a, {
    href: "/server/" + server.server_id + "/shows",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 672,
      columnNumber: 25
    }
  }, __jsx("a", {
    style: {
      color: 'white'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 672,
      columnNumber: 79
    }
  }, __jsx("h2", {
    style: {
      textTransform: 'capitalize'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 672,
      columnNumber: 107
    }
  }, "Nyligen tillagda avsnitt"))), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.movieRow,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 673,
      columnNumber: 25
    }
  }, __jsx("div", {
    id: "newlyAddedEpisodes",
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollable,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 674,
      columnNumber: 29
    }
  }, newlyAddedEpisodes), newlyAddedEpisodes.length * 480 > windowSize.width && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    onClick: function onClick() {
      return scrollLeft('newlyAddedEpisodes');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 679,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/left.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 680,
      columnNumber: 41
    }
  })), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    style: {
      right: '0'
    },
    onClick: function onClick() {
      return scrollRight('newlyAddedEpisodes');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 682,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/right.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 683,
      columnNumber: 41
    }
  })))), __jsx("hr", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.divider,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 688,
      columnNumber: 21
    }
  })), newlyAddedShows.length > 0 && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx(next_link__WEBPACK_IMPORTED_MODULE_10___default.a, {
    href: "/server/" + server.server_id + "/shows",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 694,
      columnNumber: 25
    }
  }, __jsx("a", {
    style: {
      color: 'white'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 694,
      columnNumber: 79
    }
  }, __jsx("h2", {
    style: {
      textTransform: 'capitalize'
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 694,
      columnNumber: 107
    }
  }, "Nyligen tillagda serier"))), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.movieRow,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 695,
      columnNumber: 25
    }
  }, __jsx("div", {
    id: "newlyAddedShows",
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollable,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 696,
      columnNumber: 29
    }
  }, newlyAddedShows), newlyAddedShows.length * 480 > windowSize.width && __jsx(react__WEBPACK_IMPORTED_MODULE_3___default.a.Fragment, null, __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    onClick: function onClick() {
      return scrollLeft('newlyAddedShows');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 701,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/left.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 702,
      columnNumber: 41
    }
  })), __jsx("div", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.scrollButton,
    style: {
      right: '0'
    },
    onClick: function onClick() {
      return scrollRight('newlyAddedShows');
    },
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 704,
      columnNumber: 37
    }
  }, __jsx("img", {
    src: "".concat("http://localhost:3000", "/images/right.svg"),
    width: "70",
    height: "70",
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 705,
      columnNumber: 41
    }
  })))), __jsx("hr", {
    className: _styles_server_module_css__WEBPACK_IMPORTED_MODULE_13___default.a.divider,
    __self: _this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 710,
      columnNumber: 21
    }
  }))))));
};

_s(main, "ZBeGzqzgI2GIF3f/+cEEYeOWOJc=", false, function () {
  return [react_spring__WEBPACK_IMPORTED_MODULE_18__["useTransition"], _components_hooks_WindowSize__WEBPACK_IMPORTED_MODULE_12__["default"]];
});

var __N_SSP = true;
/* harmony default export */ __webpack_exports__["default"] = (main); // Get the information about the server and send it to the front end before render (this is server-side)

;
    var _a, _b;
    // Legacy CSS implementations will `eval` browser code in a Node.js context
    // to extract CSS. For backwards compatibility, we need to check we're in a
    // browser context before continuing.
    if (typeof self !== 'undefined' &&
        // AMP / No-JS mode does not inject these helpers:
        '$RefreshHelpers$' in self) {
        var currentExports = module.__proto__.exports;
        var prevExports = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevExports) !== null && _b !== void 0 ? _b : null;
        // This cannot happen in MainTemplate because the exports mismatch between
        // templating and execution.
        self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.i);
        // A module can be accepted automatically based on its exports, e.g. when
        // it is a Refresh Boundary.
        if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {
            // Save the previous exports on update so we can compare the boundary
            // signatures.
            module.hot.dispose(function (data) {
                data.prevExports = currentExports;
            });
            // Unconditionally accept an update to this module, we'll check if it's
            // still a Refresh Boundary later.
            module.hot.accept();
            // This field is set when the previous version of this module was a
            // Refresh Boundary, letting us know we need to check for invalidation or
            // enqueue an update.
            if (prevExports !== null) {
                // A boundary can become ineligible if its exports are incompatible
                // with the previous exports.
                //
                // For example, if you add/remove/change exports, we'll want to
                // re-execute the importing modules, and force those components to
                // re-render. Similarly, if you convert a class component to a
                // function, we want to invalidate the boundary.
                if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevExports, currentExports)) {
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
            var isNoLongerABoundary = prevExports !== null;
            if (isNoLongerABoundary) {
                module.hot.invalidate();
            }
        }
    }

/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../../../node_modules/next/dist/compiled/webpack/harmony-module.js */ "./node_modules/next/dist/compiled/webpack/harmony-module.js")(module)))

/***/ })

})
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9fTl9FLy4vcGFnZXMvc2VydmVyL1tzZXJ2ZXJdL2luZGV4LmpzIl0sIm5hbWVzIjpbImZldGNoZXIiLCJ1cmwiLCJmZXRjaCIsInRoZW4iLCJyIiwianNvbiIsInJlc3VsdCIsIm1haW4iLCJwcm9wcyIsInNlcnZlciIsInVzZVN0YXRlIiwibGF0ZXN0TW92aWVzIiwic2V0TGF0ZXNNb3ZpZXMiLCJvbmdvaW5nTW92aWVzIiwic2V0T25nb2luZ01vdmllcyIsIm1vdmllV2F0Y2hMaXN0Iiwic2V0TW92aWVXYXRjaExpc3QiLCJvbmdvaW5nU2hvd3MiLCJzZXRPbmdvaW5nU2hvd3MiLCJuZXdseUFkZGVkTW92aWVzIiwic2V0TmV3bHlBZGRlZE1vdmllcyIsIm5ld2x5QWRkZWRTaG93cyIsInNldE5ld2x5QWRkZWRTaG93cyIsIm5ld2x5QWRkZWRFcGlzb2RlcyIsInNldE5ld2x5QWRkZWRFcGlzb2RlcyIsInJlY29tbWVuZGVkTW92aWUiLCJzZXRSZWNvbW1lbmRlZE1vdmllIiwicG9wdWxhck1vdmllcyIsInNldFBvcHVsYXJNb3ZpZXMiLCJsb2FkaW5nIiwibG9hZGVkIiwic2V0TG9hZGVkIiwic29ja2V0Iiwic29ja2V0SU9DbGllbnQiLCJzZXJ2ZXJfaXAiLCJ0cmFuc2l0aW9ucyIsInVzZVRyYW5zaXRpb24iLCJmcm9tIiwib3BhY2l0eSIsImVudGVyIiwiZGVsYXkiLCJvblJlc3QiLCJ3aW5kb3dTaXplIiwidXNlV2luZG93U2l6ZSIsImFsbENvbnRlbnQiLCJnZXRNb3ZpZUxpc3QiLCJnZW5yZSIsIm9yZGVyYnkiLCJsaW1pdCIsIm9uZ29pbmciLCJ3YXRjaGxpc3QiLCJwb3B1bGFyIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJjb29raWUiLCJnZXQiLCJtZXRob2QiLCJoZWFkZXJzIiwiYm9keSIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXNwb25zZSIsImZvckVhY2giLCJtb3ZpZSIsImltYWdlcyIsImltYWdlIiwiYWN0aXZlIiwidHlwZSIsInBhdGgiLCJiYWNrZHJvcCIsInBvc3RlciIsImdldE5ld0VwaXNvZGVMaXN0IiwiZXBpc29kZSIsImNvbnNvbGUiLCJsb2ciLCJnZXRTaG93TGlzdCIsInVwY29taW5nIiwiZ2V0QWN0aXZlSW1hZ2UiLCJ1c2VFZmZlY3QiLCJ2YWxpZGF0ZVNlcnZlckFjY2VzcyIsInNlcnZlclRva2VuIiwib24iLCJtb3ZpZUVsZW1lbnRzIiwiaW1nIiwicHVzaCIsImlkIiwid2F0Y2h0aW1lIiwicnVudGltZSIsInRpdGxlIiwib3ZlcnZpZXciLCJzZWxlY3RNb3ZpZSIsInN0YXR1cyIsImFjdGl2ZUxvZ28iLCJtb3ZpZXMiLCJyZXZlcnNlIiwib2JqZWN0Rml0IiwiaGVpZ2h0IiwibWluSGVpZ2h0IiwiY3Vyc29yIiwidGV4dFNoYWRvdyIsInNob3dzIiwic2hvd0VsZW1lbnRzIiwic2hvdyIsInNlbGVjdFNob3ciLCJ0aW1lX3dhdGNoZWQiLCJzZWFzb25fbmFtZSIsImVwaXNvZGVfbnVtYmVyIiwidG90YWxfdGltZSIsInNlbGVjdEVwaXNvZGUiLCJzaG93X2lkIiwic2Vhc29uX251bWJlciIsImludGVybmFsZXBpc29kZWlkIiwiZXBpc29kZXMiLCJlcGlzb2RlRWxlbWVudHMiLCJzZXJpZV9pZCIsInNlYXNvbiIsImludGVybmFsRXBpc29kZUlEIiwiUm91dGVyIiwic2VydmVyX2lkIiwic2hvd0lEIiwic2Vhc29uTnVtYmVyIiwiZXBpc29kZU51bWJlciIsInNjcm9sbExlZnQiLCJkb2N1bWVudCIsImdldEVsZW1lbnRCeUlkIiwid2luZG93IiwiaW5uZXJXaWR0aCIsInNjcm9sbFRvIiwic2Nyb2xsWCIsInNjcm9sbFkiLCJzY3JvbGxSaWdodCIsIlN0eWxlcyIsImxvYWRpbmdpb1NwaW5uZXJFY2xpcHNlIiwibGRpbyIsInJlY29tbWVuZGVkIiwicmVjb21tZW5kZWRJbmZvcm1hdGlvbiIsImxvZ28iLCJjb250cm9scyIsInByb2Nlc3MiLCJjb2xvciIsImNvbnRlbnRSb3dzIiwibGVuZ3RoIiwidGV4dFRyYW5zZm9ybSIsIm1vdmllUm93Iiwic2Nyb2xsYWJsZSIsIndpZHRoIiwic2Nyb2xsQnV0dG9uIiwicmlnaHQiLCJkaXZpZGVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLElBQU1BLE9BQU8sR0FBRyxTQUFWQSxPQUFVLENBQUFDLEdBQUc7QUFBQSxTQUNqQkMsaURBQUssQ0FBQ0QsR0FBRCxDQUFMLENBQ0dFLElBREgsQ0FDUSxVQUFBQyxDQUFDLEVBQUk7QUFDVCxXQUFPQSxDQUFDLENBQUNDLElBQUYsR0FBU0YsSUFBVCxDQUFjLFVBQUFHLE1BQU0sRUFBSTtBQUMzQixhQUFPQSxNQUFQO0FBQ0gsS0FGTSxDQUFQO0FBR0QsR0FMSCxDQURpQjtBQUFBLENBQW5COztBQVNBLElBQU1DLElBQUksR0FBRyxTQUFQQSxJQUFPLENBQUNDLEtBQUQsRUFBVztBQUFBOztBQUNwQjtBQUNBLE1BQUlDLE1BQU0sR0FBR0QsS0FBSyxDQUFDQyxNQUFuQjs7QUFGb0Isa0JBSW1CQyxzREFBUSxDQUFDLElBQUQsQ0FKM0I7QUFBQSxNQUliQyxZQUphO0FBQUEsTUFJQ0MsY0FKRDs7QUFBQSxtQkFLc0JGLHNEQUFRLENBQUMsRUFBRCxDQUw5QjtBQUFBLE1BS2JHLGFBTGE7QUFBQSxNQUtFQyxnQkFMRjs7QUFBQSxtQkFNd0JKLHNEQUFRLENBQUMsRUFBRCxDQU5oQztBQUFBLE1BTWJLLGNBTmE7QUFBQSxNQU1HQyxpQkFOSDs7QUFBQSxtQkFPb0JOLHNEQUFRLENBQUMsRUFBRCxDQVA1QjtBQUFBLE1BT2JPLFlBUGE7QUFBQSxNQU9DQyxlQVBEOztBQUFBLG1CQVE0QlIsc0RBQVEsQ0FBQyxFQUFELENBUnBDO0FBQUEsTUFRYlMsZ0JBUmE7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QUFBQTtBQUFBO0FBQUE7QUFBQSxJQURKLENBREosRUFJSTtBQUFLLGFBQVMsRUFBRVAsaUVBQU0sQ0FBQ2UsWUFBdkI7QUFBcUMsU0FBSyxFQUFFO0FBQUNDLFdBQUssRUFBRTtBQUFSLEtBQTVDO0FBQTBELFdBQU8sRUFBRTtBQUFBLGFBQU1qQixXQUFXLENBQUMsaUJBQUQsQ0FBakI7QUFBQSxLQUFuRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEtBQ0k7QUFBSyxPQUFHLFlBQUtRLHVCQUFMLHNCQUFSO0FBQW9FLFNBQUssRUFBQyxJQUExRTtBQUErRSxVQUFNLEVBQUMsSUFBdEY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQURKLENBSkosQ0FMUixDQUZKLEVBaUJBO0FBQUksYUFBUyxFQUFFUCxpRUFBTSxDQUFDaUIsT0FBdEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQWpCQSxDQXRJUixDQURKLENBakNBLENBVkksQ0FBUjtBQTRNSCxDQXByQkQ7O0dBQU05SSxJO1VBa0JrQjZCLDJELEVBV0RPLHFFOzs7O0FBeXBCUnBDLG1FQUFmLEUsQ0FTQSIsImZpbGUiOiJzdGF0aWMvd2VicGFjay9wYWdlcy9zZXJ2ZXIvW3NlcnZlcl0uZjE4NGIyOTg3YzVmMWFmOGRkM2IuaG90LXVwZGF0ZS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBMYXlvdXQgZnJvbSAnLi4vLi4vLi4vY29tcG9uZW50cy9sYXlvdXQnXHJcbmltcG9ydCBIZWFkIGZyb20gJ25leHQvaGVhZCdcclxuaW1wb3J0IGZldGNoIGZyb20gJ25vZGUtZmV0Y2gnXHJcbmltcG9ydCBjb29raWUgZnJvbSAnanMtY29va2llJztcclxuaW1wb3J0IFJvdXRlciBmcm9tICduZXh0L3JvdXRlcic7XHJcbmltcG9ydCB7IHVzZUVmZmVjdCwgdXNlU3RhdGUgfSBmcm9tICdyZWFjdCc7XHJcbmltcG9ydCB7IENhcm91c2VsLCBDb250YWluZXIsIFJvdywgQ29sIH0gZnJvbSAncmVhY3QtYm9vdHN0cmFwJztcclxuaW1wb3J0IExpbmsgZnJvbSAnbmV4dC9saW5rJztcclxuaW1wb3J0IHZhbGlkYXRlU2VydmVyQWNjZXNzIGZyb20gJy4uLy4uLy4uL2xpYi92YWxpZGF0ZVNlcnZlckFjY2Vzcyc7XHJcbmltcG9ydCB1c2VXaW5kb3dTaXplIGZyb20gJy4uLy4uLy4uL2NvbXBvbmVudHMvaG9va3MvV2luZG93U2l6ZSc7XHJcbmltcG9ydCBTdHlsZXMgZnJvbSAnLi4vLi4vLi4vc3R5bGVzL3NlcnZlci5tb2R1bGUuY3NzJztcclxuaW1wb3J0IE1vdmllQmFja2Ryb3AgZnJvbSAnLi4vLi4vLi4vY29tcG9uZW50cy9tb3ZpZUJhY2tkcm9wJztcclxuaW1wb3J0IEVwaXNvZGVQb3N0ZXIgZnJvbSAnLi4vLi4vLi4vY29tcG9uZW50cy9lcGlzb2RlUG9zdGVyJztcclxuaW1wb3J0IHNvY2tldElPQ2xpZW50IGZyb20gXCJzb2NrZXQuaW8tY2xpZW50XCI7XHJcbmltcG9ydCBtb3ZpZVN0eWxlcyBmcm9tICcuLi8uLi8uLi9jb21wb25lbnRzL21vdmllQmFja2Ryb3AubW9kdWxlLmNzcydcclxuaW1wb3J0IHsgdXNlVHJhbnNpdGlvbiwgYW5pbWF0ZWQsIHNldEl0ZW1zIH0gZnJvbSAncmVhY3Qtc3ByaW5nJztcclxuXHJcbmNvbnN0IGZldGNoZXIgPSB1cmwgPT5cclxuICBmZXRjaCh1cmwpXHJcbiAgICAudGhlbihyID0+IHtcclxuICAgICAgcmV0dXJuIHIuanNvbigpLnRoZW4ocmVzdWx0ID0+IHtcclxuICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICk7XHJcblxyXG5jb25zdCBtYWluID0gKHByb3BzKSA9PiB7XHJcbiAgICAvLyBwcm9wcy5zZXJ2ZXIgaXMgZnJvbSB0aGUgU1NSIHVuZGVyIHRoaXMgZnVuY3Rpb25cclxuICAgIGxldCBzZXJ2ZXIgPSBwcm9wcy5zZXJ2ZXI7XHJcbiAgICBcclxuICAgIGNvbnN0IFtsYXRlc3RNb3ZpZXMsIHNldExhdGVzTW92aWVzXSA9IHVzZVN0YXRlKG51bGwpO1xyXG4gICAgY29uc3QgW29uZ29pbmdNb3ZpZXMsIHNldE9uZ29pbmdNb3ZpZXNdID0gdXNlU3RhdGUoW10pO1xyXG4gICAgY29uc3QgW21vdmllV2F0Y2hMaXN0LCBzZXRNb3ZpZVdhdGNoTGlzdF0gPSB1c2VTdGF0ZShbXSk7XHJcbiAgICBjb25zdCBbb25nb2luZ1Nob3dzLCBzZXRPbmdvaW5nU2hvd3NdID0gdXNlU3RhdGUoW10pO1xyXG4gICAgY29uc3QgW25ld2x5QWRkZWRNb3ZpZXMsIHNldE5ld2x5QWRkZWRNb3ZpZXNdID0gdXNlU3RhdGUoW10pO1xyXG4gICAgY29uc3QgW25ld2x5QWRkZWRTaG93cywgc2V0TmV3bHlBZGRlZFNob3dzXSA9IHVzZVN0YXRlKFtdKTtcclxuICAgIGNvbnN0IFtuZXdseUFkZGVkRXBpc29kZXMsIHNldE5ld2x5QWRkZWRFcGlzb2Rlc10gPSB1c2VTdGF0ZShbXSk7XHJcbiAgICBjb25zdCBbcmVjb21tZW5kZWRNb3ZpZSwgc2V0UmVjb21tZW5kZWRNb3ZpZV0gPSB1c2VTdGF0ZShmYWxzZSk7XHJcbiAgICBjb25zdCBbcG9wdWxhck1vdmllcywgc2V0UG9wdWxhck1vdmllc10gPSB1c2VTdGF0ZShbXSk7XHJcbiAgICBsZXQgbG9hZGluZyA9IDA7XHJcbiAgICBjb25zdCBbbG9hZGVkLCBzZXRMb2FkZWRdID0gdXNlU3RhdGUoZmFsc2UpXHJcbiAgICBjb25zdCBzb2NrZXQgPSBzb2NrZXRJT0NsaWVudChzZXJ2ZXIuc2VydmVyX2lwKTtcclxuXHJcblxyXG4gICAgY29uc3QgdHJhbnNpdGlvbnMgPSB1c2VUcmFuc2l0aW9uKG5ld2x5QWRkZWRNb3ZpZXMsIHtcclxuICAgICAgICBmcm9tOiB7IG9wYWNpdHk6IDAgfSxcclxuICAgICAgICBlbnRlcjogeyBvcGFjaXR5OiAxIH0sXHJcbiAgICAgICAgZGVsYXk6IDIwMCxcclxuICAgICAgICBvblJlc3Q6ICgpID0+IHNldE5ld2x5QWRkZWRNb3ZpZXMobmV3bHlBZGRlZE1vdmllcyksXHJcbiAgICB9KVxyXG4gICAgXHJcbiAgICBcclxuXHJcblxyXG5cclxuICAgIGNvbnN0IHdpbmRvd1NpemUgPSB1c2VXaW5kb3dTaXplKCk7XHJcbiAgICBsZXQgYWxsQ29udGVudCA9IFtdO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogTWFrZXMgYSBxdWVyeSB0byB0aGUgY3VycmVudCBhY3RpdmUgc2VydmVyIGZvciBhIGxpc3Qgb2YgbW92aWVzXHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBnZW5yZSBcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBvcmRlcmJ5IFxyXG4gICAgICogQHBhcmFtIHtpbnR9IGxpbWl0IFxyXG4gICAgICovXHJcbiAgICBjb25zdCBnZXRNb3ZpZUxpc3QgPSBhc3luYyAoZ2VucmU9bnVsbCwgb3JkZXJieT1udWxsLCBsaW1pdD0yMCwgb25nb2luZz1mYWxzZSwgd2F0Y2hsaXN0PWZhbHNlLCBwb3B1bGFyPWZhbHNlKSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgbGV0IHVybDtcclxuICAgICAgICAgICAgaWYgKG9uZ29pbmcpIHtcclxuICAgICAgICAgICAgICAgIHVybCA9IGAke3NlcnZlci5zZXJ2ZXJfaXB9L2FwaS9tb3ZpZXMvbGlzdC9vbmdvaW5nPyR7b3JkZXJieSAhPT0gbnVsbCA/ICdvcmRlcmJ5PScrb3JkZXJieSsnJicgOiAnJ31saW1pdD0ke2xpbWl0fSZ0b2tlbj0ke2Nvb2tpZS5nZXQoJ3NlcnZlclRva2VuJyl9YFxyXG4gICAgICAgICAgICB9IGVsc2UgaWYod2F0Y2hsaXN0KSB7XHJcbiAgICAgICAgICAgICAgICB1cmwgPSBgJHtzZXJ2ZXIuc2VydmVyX2lwfS9hcGkvbW92aWVzL2xpc3Qvd2F0Y2hsaXN0PyR7b3JkZXJieSAhPT0gbnVsbCA/ICdvcmRlcmJ5PScrb3JkZXJieSsnJicgOiAnJ31saW1pdD0ke2xpbWl0fSZ0b2tlbj0ke2Nvb2tpZS5nZXQoJ3NlcnZlclRva2VuJyl9YFxyXG4gICAgICAgICAgICB9IGVsc2UgaWYocG9wdWxhcikge1xyXG4gICAgICAgICAgICAgICAgdXJsID0gYCR7c2VydmVyLnNlcnZlcl9pcH0vYXBpL21vdmllcy9saXN0L3BvcHVsYXI/JHtvcmRlcmJ5ICE9PSBudWxsID8gJ29yZGVyYnk9JytvcmRlcmJ5KycmJyA6ICcnfWxpbWl0PSR7bGltaXR9JnRva2VuPSR7Y29va2llLmdldCgnc2VydmVyVG9rZW4nKX1gXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB1cmwgPSBgJHtzZXJ2ZXIuc2VydmVyX2lwfS9hcGkvbW92aWVzL2xpc3Qke2dlbnJlICE9PSBudWxsID8gJy9nZW5yZS8nK2dlbnJlIDogJyd9PyR7b3JkZXJieSAhPT0gbnVsbCA/ICdvcmRlcmJ5PScrb3JkZXJieSsnJicgOiAnJ31saW1pdD0ke2xpbWl0fSZ0b2tlbj0ke2Nvb2tpZS5nZXQoJ3NlcnZlclRva2VuJyl9YFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZldGNoKHVybCwge1xyXG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICAgICAgICBsaW1pdDogMjBcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC50aGVuKChyKSA9PiByLmpzb24oKSlcclxuICAgICAgICAgICAgLnRoZW4oKHJlc3BvbnNlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAvLyBNYXJrIHRoZSBtb3ZpZXMgYWN0aXZlIGltYWdlXHJcbiAgICAgICAgICAgICAgICByZXNwb25zZS5yZXN1bHQuZm9yRWFjaChtb3ZpZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaW1hZ2Ugb2YgbW92aWUuaW1hZ2VzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS5hY3RpdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS50eXBlID09PSAnQkFDS0RST1AnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlLnBhdGggPT09ICdub19pbWFnZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW92aWUuYmFja2Ryb3AgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmllLmJhY2tkcm9wID0gaW1hZ2UucGF0aDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS5wYXRoID09PSAnbm9faW1hZ2UnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmllLmJhY2tkcm9wID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3ZpZS5wb3N0ZXIgPSBpbWFnZS5wYXRoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobW92aWUuYmFja2Ryb3AgIT0gbnVsbCAmJiBtb3ZpZS5wb3N0ZXIgIT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlLnJlc3VsdCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTWFrZXMgYSBxdWVyeSB0byB0aGUgY3VycmVudCBhY3RpdmUgc2VydmVyIGZvciBhIGxpc3Qgb2YgbmV3IGVwaXNvZGVzXHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBnZW5yZSBcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBvcmRlcmJ5IFxyXG4gICAgICogQHBhcmFtIHtpbnR9IGxpbWl0IFxyXG4gICAgICovXHJcbiAgICAgICAgIGNvbnN0IGdldE5ld0VwaXNvZGVMaXN0ID0gYXN5bmMgKG9yZGVyYnk9bnVsbCwgbGltaXQ9MjApID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGxldCB1cmw7XHJcbiAgICAgICAgICAgICAgICB1cmwgPSBgJHtzZXJ2ZXIuc2VydmVyX2lwfS9hcGkvc2VyaWVzL2xpc3QvZXBpc29kZXM/JHtvcmRlcmJ5ICE9PSBudWxsID8gJ29yZGVyYnk9JytvcmRlcmJ5KycmJyA6ICcnfWxpbWl0PSR7bGltaXR9JnRva2VuPSR7Y29va2llLmdldCgnc2VydmVyVG9rZW4nKX1gXHJcbiAgICAgICAgICAgICAgICBmZXRjaCh1cmwsIHtcclxuICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgICAgICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGltaXQ6IDIwXHJcbiAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAudGhlbigocikgPT4gci5qc29uKCkpXHJcbiAgICAgICAgICAgICAgICAudGhlbigocmVzcG9uc2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBNYXJrIHRoZSBtb3ZpZXMgYWN0aXZlIGltYWdlXHJcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2UucmVzdWx0LmZvckVhY2goZXBpc29kZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGltYWdlIG9mIGVwaXNvZGUuaW1hZ2VzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW1hZ2UuYWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlLnR5cGUgPT09ICdCQUNLRFJPUCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlLnBhdGggPT09ICdub19pbWFnZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVwaXNvZGUuYmFja2Ryb3AgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXBpc29kZS5iYWNrZHJvcCA9IGltYWdlLnBhdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGltYWdlLnR5cGUgPT09ICdQT1NURVInKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS5wYXRoID09PSAnbm9faW1hZ2UnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcGlzb2RlLnBvc3RlciA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcGlzb2RlLnBvc3RlciA9IGltYWdlLnBhdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW1hZ2UucGF0aCA9PT0gJ25vX2ltYWdlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXBpc29kZS5iYWNrZHJvcCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcGlzb2RlLnBvc3RlciA9IGltYWdlLnBhdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXBpc29kZS5iYWNrZHJvcCAhPSBudWxsICYmIGVwaXNvZGUucG9zdGVyICE9IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmVzcG9uc2UucmVzdWx0KTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlLnJlc3VsdCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgIGNvbnN0IGdldFNob3dMaXN0ID0gYXN5bmMgKGdlbnJlPW51bGwsIG9yZGVyYnk9bnVsbCwgbGltaXQ9MjAsIG9uZ29pbmc9ZmFsc2UpID0+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgdXJsO1xyXG4gICAgICAgICAgICBpZiAob25nb2luZykge1xyXG4gICAgICAgICAgICAgICAgdXJsID0gYCR7c2VydmVyLnNlcnZlcl9pcH0vYXBpL3Nlcmllcy9saXN0L29uZ29pbmc/JHtvcmRlcmJ5ICE9PSBudWxsID8gJ29yZGVyYnk9JytvcmRlcmJ5KycmJyA6ICcnfWxpbWl0PSR7bGltaXR9JnRva2VuPSR7Y29va2llLmdldCgnc2VydmVyVG9rZW4nKX1gXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB1cmwgPSBgJHtzZXJ2ZXIuc2VydmVyX2lwfS9hcGkvc2VyaWVzL2xpc3Qke2dlbnJlICE9PSBudWxsID8gJy9nZW5yZS8nK2dlbnJlIDogJyd9PyR7b3JkZXJieSAhPT0gbnVsbCA/ICdvcmRlcmJ5PScrb3JkZXJieSsnJicgOiAnJ31saW1pdD0ke2xpbWl0fSZ0b2tlbj0ke2Nvb2tpZS5nZXQoJ3NlcnZlclRva2VuJyl9YFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZldGNoKHVybCwge1xyXG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICAgICAgICBsaW1pdDogMjBcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC50aGVuKChyKSA9PiByLmpzb24oKSlcclxuICAgICAgICAgICAgLnRoZW4oKHJlc3BvbnNlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAvLyBNYXJrIHRoZSBtb3ZpZXMgYWN0aXZlIGltYWdlXHJcbiAgICAgICAgICAgICAgICBpZiAob25nb2luZykge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlLnVwY29taW5nLmZvckVhY2gobW92aWUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpbWFnZSBvZiBtb3ZpZS5pbWFnZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS5hY3RpdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW1hZ2UudHlwZSA9PT0gJ0JBQ0tEUk9QJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW1hZ2UucGF0aCA9PT0gJ25vX2ltYWdlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW92aWUuYmFja2Ryb3AgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW92aWUuYmFja2Ryb3AgPSBpbWFnZS5wYXRoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlLnBhdGggPT09ICdub19pbWFnZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmllLmJhY2tkcm9wID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmllLnBvc3RlciA9IGltYWdlLnBhdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobW92aWUuYmFja2Ryb3AgIT0gbnVsbCAmJiBtb3ZpZS5wb3N0ZXIgIT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2Uub25nb2luZy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaW1hZ2Ugb2YgbW92aWUuaW1hZ2VzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW1hZ2UuYWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlLnR5cGUgPT09ICdCQUNLRFJPUCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlLnBhdGggPT09ICdub19pbWFnZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmllLmJhY2tkcm9wID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmllLmJhY2tkcm9wID0gaW1hZ2UucGF0aDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS5wYXRoID09PSAnbm9faW1hZ2UnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3ZpZS5iYWNrZHJvcCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3ZpZS5wb3N0ZXIgPSBpbWFnZS5wYXRoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1vdmllLmJhY2tkcm9wICE9IG51bGwgJiYgbW92aWUucG9zdGVyICE9IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuXHJcbiAgICAgICAgICAgICAgICByZXNwb25zZS5yZXN1bHQuZm9yRWFjaChtb3ZpZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaW1hZ2Ugb2YgbW92aWUuaW1hZ2VzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS5hY3RpdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS50eXBlID09PSAnQkFDS0RST1AnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlLnBhdGggPT09ICdub19pbWFnZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW92aWUuYmFja2Ryb3AgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmllLmJhY2tkcm9wID0gaW1hZ2UucGF0aDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS5wYXRoID09PSAnbm9faW1hZ2UnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmllLmJhY2tkcm9wID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3ZpZS5wb3N0ZXIgPSBpbWFnZS5wYXRoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobW92aWUuYmFja2Ryb3AgIT0gbnVsbCAmJiBtb3ZpZS5wb3N0ZXIgIT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlLnJlc3VsdCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGdldEFjdGl2ZUltYWdlID0gKGltYWdlcywgdHlwZSkgPT4ge1xyXG4gICAgICAgIGZvciAobGV0IGltYWdlIG9mIGltYWdlcykge1xyXG4gICAgICAgICAgICBpZiAoaW1hZ2UudHlwZSA9PT0gdHlwZSAmJiBpbWFnZS5hY3RpdmUgJiYgaW1hZ2UucGF0aCAhPSBcIm5vX2ltYWdlXCIpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbWFnZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgdXNlRWZmZWN0KCgpID0+IHtcclxuICAgICAgICB2YWxpZGF0ZVNlcnZlckFjY2VzcyhzZXJ2ZXIsIChzZXJ2ZXJUb2tlbikgPT4ge1xyXG4gICAgICAgICAgICBzb2NrZXQub24oXCJNT1ZJRVwiLCBtb3ZpZSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhtb3ZpZSk7XHJcbiAgICAgICAgICAgICAgICBsZXQgbW92aWVFbGVtZW50cyA9IG5ld2x5QWRkZWRNb3ZpZXM7XHJcbiAgICAgICAgICAgICAgICBsZXQgaW1nID0gbW92aWUuYmFja2Ryb3AgIT09IG51bGwgPyBgaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC8ke21vdmllLmJhY2tkcm9wfWAgOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzIwMDB4MTAwMCcgXHJcbiAgICAgICAgICAgICAgICBtb3ZpZUVsZW1lbnRzLnB1c2goXHJcbiAgICAgICAgICAgICAgICAgICAgPE1vdmllQmFja2Ryb3AgbWFya0FzRG9uZUJ1dHRvbiBpZD17bW92aWUuaWR9IHRpbWU9e21vdmllLndhdGNodGltZX0gcnVudGltZT17bW92aWUucnVudGltZX0gdGl0bGU9e21vdmllLnRpdGxlfSBvdmVydmlldz17bW92aWUub3ZlcnZpZXd9IHJ1bnRpbWU9e21vdmllLnJ1bnRpbWV9IGJhY2tkcm9wPXtpbWd9IG9uQ2xpY2s9eyhpZCkgPT4gc2VsZWN0TW92aWUobW92aWUuaWQpfT48L01vdmllQmFja2Ryb3A+XHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgc2V0TmV3bHlBZGRlZE1vdmllcyhtb3ZpZUVsZW1lbnRzKTtcclxuICAgICAgICAgICAgfSk7ICAgICAgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gR2V0IHJlY29tbWVuZGVkIHZpZGVvIChyYW5kb20gdmlkZW8gcmlnaHQgbm93KVxyXG4gICAgICAgICAgICBmZXRjaChgJHtzZXJ2ZXIuc2VydmVyX2lwfS9hcGkvbW92aWVzL2xpc3QvcmFuZG9tP3RyYWlsZXI9dHJ1ZSZ0b2tlbj0ke2Nvb2tpZS5nZXQoJ3NlcnZlclRva2VuJyl9YCwge1xyXG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLnRoZW4oKHIpID0+IHIuanNvbigpKVxyXG4gICAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5tb3ZpZS5hY3RpdmVMb2dvID0gZ2V0QWN0aXZlSW1hZ2UocmVzdWx0Lm1vdmllLmltYWdlcywgJ0xPR08nKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBzZXRSZWNvbW1lbmRlZE1vdmllKHJlc3VsdC5tb3ZpZSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRXJyb3IgZ2V0dGluZyByZWNvbW1lbmRlZCBtb3ZpZVwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBuZXdlc3QgcmVsZWFzZWQgbW92aWVzIChUaGUgc2xpZXNob3cpXHJcbiAgICAgICAgICAgIGdldE1vdmllTGlzdChudWxsLCAncmVsZWFzZV9kYXRlJywgNSkudGhlbihtb3ZpZXMgPT4ge1xyXG4gICAgICAgICAgICAgICAgbW92aWVzLnJldmVyc2UoKTtcclxuICAgICAgICAgICAgICAgIGxldCBtb3ZpZUVsZW1lbnRzID0gW107XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBtb3ZpZSBvZiBtb3ZpZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgaW1nID0gbW92aWUuYmFja2Ryb3AgIT09IG51bGwgPyBgaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3Avb3JpZ2luYWwvJHttb3ZpZS5iYWNrZHJvcH1gIDogJ2h0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS8yMDAweDEwMDAnIFxyXG4gICAgICAgICAgICAgICAgICAgIG1vdmllRWxlbWVudHMucHVzaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgPENhcm91c2VsLkl0ZW0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW1nIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImQtYmxvY2sgdy0xMDBcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNyYz17aW1nfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFsdD17bW92aWUudGl0bGV9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3tvYmplY3RGaXQ6ICdjb3ZlcicsIGhlaWdodDogJzkwdmgnLCBtaW5IZWlnaHQ6ICc1MDBweCcsIGN1cnNvcjogJ3BvaW50ZXInfX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7c2VsZWN0TW92aWUobW92aWUuaWQpfX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Q2Fyb3VzZWwuQ2FwdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aDMgc3R5bGU9e3t0ZXh0U2hhZG93OiAnMHB4IDBweCA2cHggIzAwMCd9fT57bW92aWUudGl0bGV9PC9oMz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8cCBzdHlsZT17e3RleHRTaGFkb3c6ICcwcHggMHB4IDZweCAjMDAwJ319Pnttb3ZpZS5vdmVydmlld308L3A+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L0Nhcm91c2VsLkNhcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvQ2Fyb3VzZWwuSXRlbT5cclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbG9hZGluZysrXHJcbiAgICAgICAgICAgICAgICBzZXRMYXRlc01vdmllcyhtb3ZpZUVsZW1lbnRzKTtcclxuXHJcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYobG9hZGluZyA9PSA3KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2V0TG9hZGVkKHRydWUpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgICAgICAvLyBHZXQgcG9wdWxhciBtb3ZpZXNcclxuICAgICAgICAgICAgZ2V0TW92aWVMaXN0KG51bGwsICdyZWxlYXNlX2RhdGUnLCAyMCwgZmFsc2UsIGZhbHNlLCB0cnVlKS50aGVuKG1vdmllcyA9PiB7XHJcbiAgICAgICAgICAgICAgICBtb3ZpZXMucmV2ZXJzZSgpO1xyXG4gICAgICAgICAgICAgICAgbGV0IG1vdmllRWxlbWVudHMgPSBbXTtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IG1vdmllIG9mIG1vdmllcykge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBpbWcgPSBtb3ZpZS5iYWNrZHJvcCAhPT0gbnVsbCA/IGBodHRwczovL2ltYWdlLnRtZGIub3JnL3QvcC93NTAwLyR7bW92aWUuYmFja2Ryb3B9YCA6ICdodHRwczovL3ZpYS5wbGFjZWhvbGRlci5jb20vMjAwMHgxMDAwJyBcclxuICAgICAgICAgICAgICAgICAgICBtb3ZpZUVsZW1lbnRzLnB1c2goXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxNb3ZpZUJhY2tkcm9wIG1hcmtBc0RvbmVCdXR0b24gaWQ9e21vdmllLmlkfSB0aW1lPXttb3ZpZS53YXRjaHRpbWV9IHJ1bnRpbWU9e21vdmllLnJ1bnRpbWV9IHRpdGxlPXttb3ZpZS50aXRsZX0gb3ZlcnZpZXc9e21vdmllLm92ZXJ2aWV3fSBydW50aW1lPXttb3ZpZS5ydW50aW1lfSBiYWNrZHJvcD17aW1nfSBvbkNsaWNrPXsoaWQpID0+IHNlbGVjdE1vdmllKG1vdmllLmlkKX0+PC9Nb3ZpZUJhY2tkcm9wPlxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsb2FkaW5nKytcclxuICAgICAgICAgICAgICAgIHNldFBvcHVsYXJNb3ZpZXMobW92aWVFbGVtZW50cyk7XHJcblxyXG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmKGxvYWRpbmcgPT0gNykge1xyXG4gICAgICAgICAgICAgICAgICAgIHNldExvYWRlZCh0cnVlKVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgICAgLy8gR2V0IG9uZ29pbmcgbW92aWVzXHJcbiAgICAgICAgICAgIGdldE1vdmllTGlzdChudWxsLCAncmVsZWFzZV9kYXRlJywgMjAsIHRydWUpLnRoZW4obW92aWVzID0+IHtcclxuICAgICAgICAgICAgICAgIG1vdmllcy5yZXZlcnNlKCk7XHJcbiAgICAgICAgICAgICAgICBsZXQgbW92aWVFbGVtZW50cyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgbW92aWUgb2YgbW92aWVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGltZyA9IG1vdmllLmJhY2tkcm9wICE9PSBudWxsID8gYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvJHttb3ZpZS5iYWNrZHJvcH1gIDogJ2h0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS8yMDAweDEwMDAnIFxyXG4gICAgICAgICAgICAgICAgICAgIG1vdmllRWxlbWVudHMucHVzaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgPE1vdmllQmFja2Ryb3AgbWFya0FzRG9uZUJ1dHRvbiBpZD17bW92aWUuaWR9IHRpbWU9e21vdmllLndhdGNodGltZX0gcnVudGltZT17bW92aWUucnVudGltZX0gdGl0bGU9e21vdmllLnRpdGxlfSBvdmVydmlldz17bW92aWUub3ZlcnZpZXd9IHJ1bnRpbWU9e21vdmllLnJ1bnRpbWV9IGJhY2tkcm9wPXtpbWd9IG9uQ2xpY2s9eyhpZCkgPT4gc2VsZWN0TW92aWUobW92aWUuaWQpfT48L01vdmllQmFja2Ryb3A+XHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGxvYWRpbmcrK1xyXG4gICAgICAgICAgICAgICAgc2V0T25nb2luZ01vdmllcyhtb3ZpZUVsZW1lbnRzKTtcclxuXHJcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYobG9hZGluZyA9PSA3KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2V0TG9hZGVkKHRydWUpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgICAgICAvLyBHZXQgd2F0Y2hsaXN0IGZvciBtb3ZpZXNcclxuICAgICAgICAgICAgZ2V0TW92aWVMaXN0KG51bGwsICdyZWxlYXNlX2RhdGUnLCAyMCwgZmFsc2UsIHRydWUpLnRoZW4obW92aWVzID0+IHtcclxuICAgICAgICAgICAgICAgIG1vdmllcy5yZXZlcnNlKCk7XHJcbiAgICAgICAgICAgICAgICBsZXQgbW92aWVFbGVtZW50cyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgbW92aWUgb2YgbW92aWVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGltZyA9IG1vdmllLmJhY2tkcm9wICE9PSBudWxsID8gYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvJHttb3ZpZS5iYWNrZHJvcH1gIDogJ2h0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS8yMDAweDEwMDAnIFxyXG4gICAgICAgICAgICAgICAgICAgIG1vdmllRWxlbWVudHMucHVzaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgPE1vdmllQmFja2Ryb3AgbWFya0FzRG9uZUJ1dHRvbiBpZD17bW92aWUuaWR9IHRpbWU9e21vdmllLndhdGNodGltZX0gcnVudGltZT17bW92aWUucnVudGltZX0gdGl0bGU9e21vdmllLnRpdGxlfSBvdmVydmlldz17bW92aWUub3ZlcnZpZXd9IHJ1bnRpbWU9e21vdmllLnJ1bnRpbWV9IGJhY2tkcm9wPXtpbWd9IG9uQ2xpY2s9eyhpZCkgPT4gc2VsZWN0TW92aWUobW92aWUuaWQpfT48L01vdmllQmFja2Ryb3A+XHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGxvYWRpbmcrK1xyXG4gICAgICAgICAgICAgICAgc2V0TW92aWVXYXRjaExpc3QobW92aWVFbGVtZW50cyk7XHJcblxyXG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmKGxvYWRpbmcgPT0gNykge1xyXG4gICAgICAgICAgICAgICAgICAgIHNldExvYWRlZCh0cnVlKVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgICAgLy8gR2V0IG5ld2x5IGFkZGVkIG1vdmllc1xyXG4gICAgICAgICAgICBnZXRNb3ZpZUxpc3QobnVsbCwgJ2FkZGVkX2RhdGUnLCAyMCkudGhlbihtb3ZpZXMgPT4ge1xyXG4gICAgICAgICAgICAgICAgbGV0IG1vdmllRWxlbWVudHMgPSBbXTtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IG1vdmllIG9mIG1vdmllcykge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBpbWcgPSBtb3ZpZS5iYWNrZHJvcCAhPT0gbnVsbCA/IGBodHRwczovL2ltYWdlLnRtZGIub3JnL3QvcC93NTAwLyR7bW92aWUuYmFja2Ryb3B9YCA6ICdodHRwczovL3ZpYS5wbGFjZWhvbGRlci5jb20vMjAwMHgxMDAwJyBcclxuICAgICAgICAgICAgICAgICAgICBtb3ZpZUVsZW1lbnRzLnB1c2goXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxNb3ZpZUJhY2tkcm9wIG1hcmtBc0RvbmVCdXR0b24gaWQ9e21vdmllLmlkfSB0aW1lPXttb3ZpZS53YXRjaHRpbWV9IHJ1bnRpbWU9e21vdmllLnJ1bnRpbWV9IHRpdGxlPXttb3ZpZS50aXRsZX0gb3ZlcnZpZXc9e21vdmllLm92ZXJ2aWV3fSBydW50aW1lPXttb3ZpZS5ydW50aW1lfSBiYWNrZHJvcD17aW1nfSBvbkNsaWNrPXsoaWQpID0+IHNlbGVjdE1vdmllKG1vdmllLmlkKX0+PC9Nb3ZpZUJhY2tkcm9wPlxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsb2FkaW5nKytcclxuICAgICAgICAgICAgICAgIHNldE5ld2x5QWRkZWRNb3ZpZXMobW92aWVFbGVtZW50cyk7XHJcblxyXG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmKGxvYWRpbmcgPT0gNykge1xyXG4gICAgICAgICAgICAgICAgICAgIHNldExvYWRlZCh0cnVlKVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgICAgLy8gR2V0IG5ld2x5IGFkZGVkIHNob3dzXHJcbiAgICAgICAgICAgIGdldFNob3dMaXN0KG51bGwsICdhZGRlZF9kYXRlJywgMjApLnRoZW4oc2hvd3MgPT4ge1xyXG4gICAgICAgICAgICAgICAgbGV0IHNob3dFbGVtZW50cyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgc2hvdyBvZiBzaG93cykge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBpbWcgPSBzaG93LmJhY2tkcm9wICE9PSBudWxsID8gYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvJHtzaG93LmJhY2tkcm9wfWAgOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzIwMDB4MTAwMCcgXHJcbiAgICAgICAgICAgICAgICAgICAgc2hvd0VsZW1lbnRzLnB1c2goXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxNb3ZpZUJhY2tkcm9wIG1hcmtBc0RvbmVCdXR0b24gaWQ9e3Nob3cuaWR9IHRpbWU9e3Nob3cud2F0Y2h0aW1lfSBydW50aW1lPXtzaG93LnJ1bnRpbWV9IHRpdGxlPXtzaG93LnRpdGxlfSBvdmVydmlldz17c2hvdy5vdmVydmlld30gcnVudGltZT17c2hvdy5ydW50aW1lfSBiYWNrZHJvcD17aW1nfSBvbkNsaWNrPXsoaWQpID0+IHNlbGVjdFNob3coc2hvdy5pZCl9PjwvTW92aWVCYWNrZHJvcD5cclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbG9hZGluZysrXHJcbiAgICAgICAgICAgICAgICBzZXROZXdseUFkZGVkU2hvd3Moc2hvd0VsZW1lbnRzKTtcclxuXHJcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYobG9hZGluZyA9PSA3KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2V0TG9hZGVkKHRydWUpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC8vIEdldCBvbmdvaW5nIHNob3dzXHJcbiAgICAgICAgICAgIGdldFNob3dMaXN0KG51bGwsICdhZGRlZF9kYXRlJywgMjAsIHRydWUpLnRoZW4ocmVzdWx0ID0+IHtcclxuICAgICAgICAgICAgICAgIGxldCBzaG93RWxlbWVudHMgPSBbXTtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IHNob3cgb2YgcmVzdWx0LnVwY29taW5nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGltZyA9IHNob3cuYmFja2Ryb3AgIT09IG51bGwgPyBgaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC8ke3Nob3cuYmFja2Ryb3B9YCA6ICdodHRwczovL3ZpYS5wbGFjZWhvbGRlci5jb20vMjAwMHgxMDAwJyBcclxuICAgICAgICAgICAgICAgICAgICBzaG93RWxlbWVudHMucHVzaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgPE1vdmllQmFja2Ryb3Agc2hvd1RpdGxlIG1hcmtBc0RvbmVCdXR0b24gaWQ9e3Nob3cuaWR9IHRpbWU9e3Nob3cudGltZV93YXRjaGVkfSBydW50aW1lPXtzaG93LnJ1bnRpbWV9IHRpdGxlPXtzaG93LnNlYXNvbl9uYW1lICsgXCIgLSBFcGlzb2RlIFwiICsgc2hvdy5lcGlzb2RlX251bWJlcn1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnZpZXc9e3Nob3cub3ZlcnZpZXd9IHJ1bnRpbWU9e3Nob3cudG90YWxfdGltZX0gYmFja2Ryb3A9e2ltZ30gb25DbGljaz17KGlkKSA9PiBzZWxlY3RFcGlzb2RlKHNob3cuc2hvd19pZCwgc2hvdy5zZWFzb25fbnVtYmVyLCBzaG93LmVwaXNvZGVfbnVtYmVyLCBzaG93LmludGVybmFsZXBpc29kZWlkKX0+PC9Nb3ZpZUJhY2tkcm9wPlxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBzaG93IG9mIHJlc3VsdC5vbmdvaW5nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGltZyA9IHNob3cuYmFja2Ryb3AgIT09IG51bGwgPyBgaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC8ke3Nob3cuYmFja2Ryb3B9YCA6ICdodHRwczovL3ZpYS5wbGFjZWhvbGRlci5jb20vMjAwMHgxMDAwJyBcclxuICAgICAgICAgICAgICAgICAgICBzaG93RWxlbWVudHMucHVzaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgPE1vdmllQmFja2Ryb3Agc2hvd1RpdGxlIG1hcmtBc0RvbmVCdXR0b24gaWQ9e3Nob3cuaWR9IHRpbWU9e3Nob3cudGltZV93YXRjaGVkfSBydW50aW1lPXtzaG93LnJ1bnRpbWV9IHRpdGxlPXtzaG93LnNlYXNvbl9uYW1lICsgXCIgLSBFcGlzb2RlIFwiICsgc2hvdy5lcGlzb2RlX251bWJlcn1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnZpZXc9e3Nob3cub3ZlcnZpZXd9IHJ1bnRpbWU9e3Nob3cudG90YWxfdGltZX0gYmFja2Ryb3A9e2ltZ30gb25DbGljaz17KGlkKSA9PiBzZWxlY3RFcGlzb2RlKHNob3cuc2hvd19pZCwgc2hvdy5zZWFzb25fbnVtYmVyLCBzaG93LmVwaXNvZGVfbnVtYmVyLCBzaG93LmludGVybmFsZXBpc29kZWlkKX0+PC9Nb3ZpZUJhY2tkcm9wPlxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsb2FkaW5nKytcclxuICAgICAgICAgICAgICAgIHNldE9uZ29pbmdTaG93cyhzaG93RWxlbWVudHMpO1xyXG5cclxuICAgICAgICAgICAgfSkudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZihsb2FkaW5nID09IDcpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZXRMb2FkZWQodHJ1ZSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgICAgIGdldE5ld0VwaXNvZGVMaXN0KCdhZGRlZF9kYXRlJywgMjApLnRoZW4oZXBpc29kZXMgPT4ge1xyXG4gICAgICAgICAgICAgICAgbGV0IGVwaXNvZGVFbGVtZW50cyA9IFtdO1xyXG5cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGVwaXNvZGUgb2YgZXBpc29kZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgcG9zdGVyID0gZXBpc29kZS5wb3N0ZXIgIT09IG51bGwgPyBgaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC8ke2VwaXNvZGUucG9zdGVyfWAgOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHgxMDAwJztcclxuICAgICAgICAgICAgICAgICAgICBsZXQgYmFja2Ryb3AgPSBlcGlzb2RlLmJhY2tkcm9wICE9PSBudWxsID8gYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvJHtlcGlzb2RlLmJhY2tkcm9wfWAgOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHgxMDAwJyBcclxuICAgICAgICAgICAgICAgICAgICBlcGlzb2RlRWxlbWVudHMucHVzaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgPEVwaXNvZGVQb3N0ZXIgc2hvdz17ZXBpc29kZS5zZXJpZV9pZH0gc2Vhc29uPXtlcGlzb2RlLnNlYXNvbn0gZXBpc29kZT17ZXBpc29kZS5lcGlzb2RlfSBwb3N0ZXI9e3Bvc3Rlcn0gaW50ZXJuYWxFcGlzb2RlSUQ9e2VwaXNvZGUuaW50ZXJuYWxlcGlzb2RlaWR9IGJhY2tkcm9wPXtiYWNrZHJvcH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9eyhzZWFzb24sIGVwaXNvZGUsIHNob3csIGludGVybmFsRXBpc29kZUlEKSA9PiBzZWxlY3RFcGlzb2RlKHNob3csIHNlYXNvbiwgZXBpc29kZSwgaW50ZXJuYWxFcGlzb2RlSUQpfT48L0VwaXNvZGVQb3N0ZXI+XHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGxvYWRpbmcrK1xyXG4gICAgICAgICAgICAgICAgc2V0TmV3bHlBZGRlZEVwaXNvZGVzKGVwaXNvZGVFbGVtZW50cyk7XHJcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYobG9hZGluZyA9PSA3KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2V0TG9hZGVkKHRydWUpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSk7XHJcbiAgICB9LCBbbG9hZGluZ10pO1xyXG5cclxuXHJcbiAgICBjb25zdCBzZWxlY3RNb3ZpZSA9IChpZCkgPT4ge1xyXG4gICAgICAgIFJvdXRlci5wdXNoKGAvc2VydmVyLyR7c2VydmVyLnNlcnZlcl9pZH0vbW92aWVzL3ZpZGVvLyR7aWR9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2VsZWN0U2hvdyA9IChpZCkgPT4ge1xyXG4gICAgICAgIFJvdXRlci5wdXNoKGAvc2VydmVyLyR7c2VydmVyLnNlcnZlcl9pZH0vc2hvd3MvdmlkZW8vJHtpZH1gKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZWxlY3RFcGlzb2RlID0gKHNob3dJRCwgc2Vhc29uTnVtYmVyLCBlcGlzb2RlTnVtYmVyLCBpbnRlcm5hbEVwaXNvZGVJRCkgPT4ge1xyXG4gICAgICAgIFJvdXRlci5wdXNoKGAvc2VydmVyLyR7c2VydmVyLnNlcnZlcl9pZH0vc2hvd3MvdmlkZW8vJHtzaG93SUR9L3NlYXNvbi8ke3NlYXNvbk51bWJlcn0vZXBpc29kZS8ke2VwaXNvZGVOdW1iZXJ9P2ludGVybmFsSUQ9JHtpbnRlcm5hbEVwaXNvZGVJRH1gKVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBjb25zdCBzY3JvbGxMZWZ0ID0gKGlkKSA9PiB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpLnNjcm9sbExlZnQgLT0gKHdpbmRvdy5pbm5lcldpZHRoKSowLjg7XHJcbiAgICAgICAgd2luZG93LnNjcm9sbFRvKHdpbmRvdy5zY3JvbGxYLCB3aW5kb3cuc2Nyb2xsWSAtIDEpO1xyXG4gICAgICAgIHdpbmRvdy5zY3JvbGxUbyh3aW5kb3cuc2Nyb2xsWCwgd2luZG93LnNjcm9sbFkgKyAxKTtcclxuICAgIH1cclxuICAgIGNvbnN0IHNjcm9sbFJpZ2h0ID0gKGlkKSA9PiB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpLnNjcm9sbExlZnQgKz0gKHdpbmRvdy5pbm5lcldpZHRoKSowLjg7XHJcbiAgICAgICAgd2luZG93LnNjcm9sbFRvKHdpbmRvdy5zY3JvbGxYLCB3aW5kb3cuc2Nyb2xsWSAtIDEpO1xyXG4gICAgICAgIHdpbmRvdy5zY3JvbGxUbyh3aW5kb3cuc2Nyb2xsWCwgd2luZG93LnNjcm9sbFkgKyAxKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBMQVlPVVQgLy9cclxuICAgIHJldHVybiAoPD5cclxuICAgICAgICB7IWxvYWRlZCAmJlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLmxvYWRpbmdpb1NwaW5uZXJFY2xpcHNlfT5cclxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5sZGlvfT5cclxuICAgICAgICAgICAgICAgIDxkaXY+PC9kaXY+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICB9XHJcbiAgICAgICAge2xvYWRlZCAmJlxyXG5cclxuICAgICAgICA8TGF5b3V0IHNlYXJjaEVuYWJsZWQgc2VydmVyPXtzZXJ2ZXJ9IHNlcnZlclRva2VuPXtjb29raWUuZ2V0KCdzZXJ2ZXJUb2tlbicpfT5cclxuICAgICAgICA8SGVhZD5cclxuICAgICAgICA8L0hlYWQ+XHJcblxyXG4gICAgICAgIHtyZWNvbW1lbmRlZE1vdmllICE9IGZhbHNlICYmXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtTdHlsZXMucmVjb21tZW5kZWR9PlxyXG4gICAgICAgICAgICAgICAgPHZpZGVvICBhdXRvUGxheT17dHJ1ZX0gbG9vcD17dHJ1ZX0gcHJlbG9hZD1cImF1dG9cIiBtdXRlZD5cclxuICAgICAgICAgICAgICAgICAgICA8c291cmNlIHNyYz17YCR7c2VydmVyLnNlcnZlcl9pcH0vYXBpL3RyYWlsZXIvJHtyZWNvbW1lbmRlZE1vdmllW1wiaWRcIl19P3R5cGU9TU9WSUUmdG9rZW49JHtjb29raWUuZ2V0KCdzZXJ2ZXJUb2tlbicpfWB9dHlwZT1cInZpZGVvL21wNFwiIC8+XHJcbiAgICAgICAgICAgICAgICA8L3ZpZGVvPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5yZWNvbW1lbmRlZEluZm9ybWF0aW9ufT5cclxuICAgICAgICAgICAgICAgICAgICB7cmVjb21tZW5kZWRNb3ZpZVtcImFjdGl2ZUxvZ29cIl0gIT0gZmFsc2UgJiZcclxuICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz17YGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL29yaWdpbmFsLyR7cmVjb21tZW5kZWRNb3ZpZVtcImFjdGl2ZUxvZ29cIl0ucGF0aH1gfSBjbGFzc05hbWU9e1N0eWxlcy5sb2dvfSAvPlxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB7cmVjb21tZW5kZWRNb3ZpZVtcImFjdGl2ZUxvZ29cIl0gPT0gZmFsc2UgJiZcclxuICAgICAgICAgICAgICAgICAgICA8aDE+e3JlY29tbWVuZGVkTW92aWVbXCJ0aXRsZVwiXX08L2gxPlxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICA8cD57cmVjb21tZW5kZWRNb3ZpZVtcIm92ZXJ2aWV3XCJdfTwvcD5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLmNvbnRyb2xzfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPExpbmsgaHJlZj17YC9zZXJ2ZXIvJHtzZXJ2ZXIuc2VydmVyX2lkfS9tb3ZpZXMvdmlkZW8vJHtyZWNvbW1lbmRlZE1vdmllW1wiaWRcIl19P2F1dG9QbGF5PXRydWVgfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbWcgc3JjPXtgJHtwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TRVJWRVJfVVJMfS9pbWFnZXMvMDAxLXBsYXktYnV0dG9uLnBuZ2B9IC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvTGluaz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPExpbmsgaHJlZj17YC9zZXJ2ZXIvJHtzZXJ2ZXIuc2VydmVyX2lkfS9tb3ZpZXMvdmlkZW8vJHtyZWNvbW1lbmRlZE1vdmllW1wiaWRcIl19YH0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz17YCR7cHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU0VSVkVSX1VSTH0vaW1hZ2VzLzAwMi1pbmZvcm1hdGlvbi5wbmdgfSAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L0xpbms+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgIFxyXG4gICAgXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIDxicj48L2JyPlxyXG4gICAgICAgIDxkaXYgc3R5bGU9e3tjb2xvcjogJ3doaXRlJ319PlxyXG4gICAgICAgICAgICA8Q29udGFpbmVyIGZsdWlkIGNsYXNzTmFtZT17U3R5bGVzLmNvbnRlbnRSb3dzfT5cclxuICAgICAgICAgICAge3BvcHVsYXJNb3ZpZXMubGVuZ3RoID4gMCAmJlxyXG4gICAgICAgICAgICAgICAgICAgIDw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxoMiBzdHlsZT17e3RleHRUcmFuc2Zvcm06ICdjYXBpdGFsaXplJ319PlBvcHVsw6RydCBqdXN0IG51PC9oMj4gIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLm1vdmllUm93fT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJwb3B1bGFyTW92aWVzXCIgY2xhc3NOYW1lPXtTdHlsZXMuc2Nyb2xsYWJsZX0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge3BvcHVsYXJNb3ZpZXN9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtwb3B1bGFyTW92aWVzLmxlbmd0aCAqIDQ4MCA+IHdpbmRvd1NpemUud2lkdGggJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLnNjcm9sbEJ1dHRvbn0gb25DbGljaz17KCkgPT4gc2Nyb2xsTGVmdCgncG9wdWxhck1vdmllcycpfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbWcgc3JjPXtgJHtwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TRVJWRVJfVVJMfS9pbWFnZXMvbGVmdC5zdmdgfSB3aWR0aD1cIjcwXCIgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtTdHlsZXMuc2Nyb2xsQnV0dG9ufSBzdHlsZT17e3JpZ2h0OiAnMCd9fSBvbkNsaWNrPXsoKSA9PiBzY3JvbGxSaWdodCgncG9wdWxhck1vdmllcycpfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbWcgc3JjPXtgJHtwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TRVJWRVJfVVJMfS9pbWFnZXMvcmlnaHQuc3ZnYH0gd2lkdGg9XCI3MFwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj4gXHJcbiAgICAgICAgICAgICAgICAgICAgPGhyIGNsYXNzTmFtZT17U3R5bGVzLmRpdmlkZXJ9PjwvaHI+XHJcbiAgICAgICAgICAgICAgICAgICAgPC8+IFxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHtvbmdvaW5nTW92aWVzLmxlbmd0aCA+IDAgJiZcclxuICAgICAgICAgICAgICAgICAgICA8PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aDIgc3R5bGU9e3t0ZXh0VHJhbnNmb3JtOiAnY2FwaXRhbGl6ZSd9fT5Qw6Vnw6VlbmRlIGZpbG1lcjwvaDI+ICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5tb3ZpZVJvd30+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGlkPVwib25nb2luZ01vdmllc1wiIGNsYXNzTmFtZT17U3R5bGVzLnNjcm9sbGFibGV9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtvbmdvaW5nTW92aWVzfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7b25nb2luZ01vdmllcy5sZW5ndGggKiA0ODAgPiB3aW5kb3dTaXplLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5zY3JvbGxCdXR0b259IG9uQ2xpY2s9eygpID0+IHNjcm9sbExlZnQoJ29uZ29pbmdNb3ZpZXMnKX0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz17YCR7cHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU0VSVkVSX1VSTH0vaW1hZ2VzL2xlZnQuc3ZnYH0gd2lkdGg9XCI3MFwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLnNjcm9sbEJ1dHRvbn0gc3R5bGU9e3tyaWdodDogJzAnfX0gb25DbGljaz17KCkgPT4gc2Nyb2xsUmlnaHQoJ29uZ29pbmdNb3ZpZXMnKX0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz17YCR7cHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU0VSVkVSX1VSTH0vaW1hZ2VzL3JpZ2h0LnN2Z2B9IHdpZHRoPVwiNzBcIiAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Lz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+IFxyXG4gICAgICAgICAgICAgICAgICAgIDxociBjbGFzc05hbWU9e1N0eWxlcy5kaXZpZGVyfT48L2hyPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvPiBcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB7b25nb2luZ1Nob3dzLmxlbmd0aCA+IDAgJiZcclxuICAgICAgICAgICAgICAgICAgICA8PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aDIgc3R5bGU9e3t0ZXh0VHJhbnNmb3JtOiAnY2FwaXRhbGl6ZSd9fT5Qw6Vnw6VlbmRlIHNlcmllcjwvaDI+ICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLm1vdmllUm93fT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJvbmdvaW5nU2hvd3NcIiBjbGFzc05hbWU9e1N0eWxlcy5zY3JvbGxhYmxlfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7b25nb2luZ1Nob3dzfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7b25nb2luZ1Nob3dzLmxlbmd0aCAqIDQ4MCA+IHdpbmRvd1NpemUud2lkdGggJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLnNjcm9sbEJ1dHRvbn0gb25DbGljaz17KCkgPT4gc2Nyb2xsTGVmdCgnb25nb2luZ1Nob3dzJyl9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9e2Ake3Byb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NFUlZFUl9VUkx9L2ltYWdlcy9sZWZ0LnN2Z2B9IHdpZHRoPVwiNzBcIiBoZWlnaHQ9XCI3MFwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLnNjcm9sbEJ1dHRvbn0gc3R5bGU9e3tyaWdodDogJzAnfX0gb25DbGljaz17KCkgPT4gc2Nyb2xsUmlnaHQoJ29uZ29pbmdTaG93cycpfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbWcgc3JjPXtgJHtwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TRVJWRVJfVVJMfS9pbWFnZXMvcmlnaHQuc3ZnYH0gd2lkdGg9XCI3MFwiIGhlaWdodD1cIjcwXCIgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PiBcclxuICAgICAgICAgICAgICAgICAgICA8aHIgY2xhc3NOYW1lPXtTdHlsZXMuZGl2aWRlcn0+PC9ocj5cclxuICAgICAgICAgICAgICAgICAgICA8Lz4gXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAge25ld2x5QWRkZWRNb3ZpZXMubGVuZ3RoID4gMCAmJlxyXG4gICAgICAgICAgICAgICAgICAgIDw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxMaW5rIGhyZWY9e1wiL3NlcnZlci9cIiArIHNlcnZlci5zZXJ2ZXJfaWQgKyBcIi9tb3ZpZXNcIn0+PGEgc3R5bGU9e3tjb2xvcjogJ3doaXRlJ319PjxoMiBzdHlsZT17e3RleHRUcmFuc2Zvcm06ICdjYXBpdGFsaXplJ319Pk55bGlnZW4gdGlsbGFnZGEgZmlsbWVyPC9oMj48L2E+PC9MaW5rPiAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLm1vdmllUm93fT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJuZXdseUFkZGVkTW92aWVzXCIgY2xhc3NOYW1lPXtTdHlsZXMuc2Nyb2xsYWJsZX0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtuZXdseUFkZGVkTW92aWVzfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7bmV3bHlBZGRlZE1vdmllcy5sZW5ndGggKiA0ODAgPiB3aW5kb3dTaXplLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5zY3JvbGxCdXR0b259IG9uQ2xpY2s9eygpID0+IHNjcm9sbExlZnQoJ25ld2x5QWRkZWRNb3ZpZXMnKX0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz17YCR7cHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU0VSVkVSX1VSTH0vaW1hZ2VzL2xlZnQuc3ZnYH0gd2lkdGg9XCI3MFwiIGhlaWdodD1cIjcwXCIgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtTdHlsZXMuc2Nyb2xsQnV0dG9ufSBzdHlsZT17e3JpZ2h0OiAnMCd9fSBvbkNsaWNrPXsoKSA9PiBzY3JvbGxSaWdodCgnbmV3bHlBZGRlZE1vdmllcycpfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbWcgc3JjPXtgJHtwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TRVJWRVJfVVJMfS9pbWFnZXMvcmlnaHQuc3ZnYH0gd2lkdGg9XCI3MFwiIGhlaWdodD1cIjcwXCIgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PiBcclxuICAgICAgICAgICAgICAgICAgICA8aHIgY2xhc3NOYW1lPXtTdHlsZXMuZGl2aWRlcn0+PC9ocj5cclxuICAgICAgICAgICAgICAgICAgICA8Lz4gXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAge21vdmllV2F0Y2hMaXN0Lmxlbmd0aCA+IDAgJiZcclxuICAgICAgICAgICAgICAgICAgICA8PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8TGluayBocmVmPXtcIi9zZXJ2ZXIvXCIgKyBzZXJ2ZXIuc2VydmVyX2lkICsgXCIvbW92aWVzXCJ9PjxhIHN0eWxlPXt7Y29sb3I6ICd3aGl0ZSd9fT48aDIgc3R5bGU9e3t0ZXh0VHJhbnNmb3JtOiAnY2FwaXRhbGl6ZSd9fT5GaWxtZXIgYXR0IHNlIHNlbmFyZTwvaDI+PC9hPjwvTGluaz4gICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5tb3ZpZVJvd30+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGlkPVwibW92aWVXYXRjaExpc3RcIiBjbGFzc05hbWU9e1N0eWxlcy5zY3JvbGxhYmxlfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7bW92aWVXYXRjaExpc3R9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHttb3ZpZVdhdGNoTGlzdC5sZW5ndGggKiA0ODAgPiB3aW5kb3dTaXplLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5zY3JvbGxCdXR0b259IG9uQ2xpY2s9eygpID0+IHNjcm9sbExlZnQoJ21vdmllV2F0Y2hMaXN0Jyl9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9e2Ake3Byb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NFUlZFUl9VUkx9L2ltYWdlcy9sZWZ0LnN2Z2B9IHdpZHRoPVwiNzBcIiBoZWlnaHQ9XCI3MFwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17U3R5bGVzLnNjcm9sbEJ1dHRvbn0gc3R5bGU9e3tyaWdodDogJzAnfX0gb25DbGljaz17KCkgPT4gc2Nyb2xsUmlnaHQoJ21vdmllV2F0Y2hMaXN0Jyl9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9e2Ake3Byb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NFUlZFUl9VUkx9L2ltYWdlcy9yaWdodC5zdmdgfSB3aWR0aD1cIjcwXCIgaGVpZ2h0PVwiNzBcIiAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Lz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+IFxyXG4gICAgICAgICAgICAgICAgICAgIDxociBjbGFzc05hbWU9e1N0eWxlcy5kaXZpZGVyfT48L2hyPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvPiBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAge25ld2x5QWRkZWRFcGlzb2Rlcy5sZW5ndGggPiAwICYmXHJcbiAgICAgICAgICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPExpbmsgaHJlZj17XCIvc2VydmVyL1wiICsgc2VydmVyLnNlcnZlcl9pZCArIFwiL3Nob3dzXCJ9PjxhIHN0eWxlPXt7Y29sb3I6ICd3aGl0ZSd9fT48aDIgc3R5bGU9e3t0ZXh0VHJhbnNmb3JtOiAnY2FwaXRhbGl6ZSd9fT5OeWxpZ2VuIHRpbGxhZ2RhIGF2c25pdHQ8L2gyPjwvYT48L0xpbms+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtTdHlsZXMubW92aWVSb3d9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cIm5ld2x5QWRkZWRFcGlzb2Rlc1wiIGNsYXNzTmFtZT17U3R5bGVzLnNjcm9sbGFibGV9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtuZXdseUFkZGVkRXBpc29kZXN9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtuZXdseUFkZGVkRXBpc29kZXMubGVuZ3RoICogNDgwID4gd2luZG93U2l6ZS53aWR0aCAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtTdHlsZXMuc2Nyb2xsQnV0dG9ufSBvbkNsaWNrPXsoKSA9PiBzY3JvbGxMZWZ0KCduZXdseUFkZGVkRXBpc29kZXMnKX0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz17YCR7cHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU0VSVkVSX1VSTH0vaW1hZ2VzL2xlZnQuc3ZnYH0gd2lkdGg9XCI3MFwiIGhlaWdodD1cIjcwXCIgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtTdHlsZXMuc2Nyb2xsQnV0dG9ufSBzdHlsZT17e3JpZ2h0OiAnMCd9fSBvbkNsaWNrPXsoKSA9PiBzY3JvbGxSaWdodCgnbmV3bHlBZGRlZEVwaXNvZGVzJyl9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9e2Ake3Byb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NFUlZFUl9VUkx9L2ltYWdlcy9yaWdodC5zdmdgfSB3aWR0aD1cIjcwXCIgaGVpZ2h0PVwiNzBcIiAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Lz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+IFxyXG4gICAgICAgICAgICAgICAgICAgIDxociBjbGFzc05hbWU9e1N0eWxlcy5kaXZpZGVyfT48L2hyPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvPiBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAge25ld2x5QWRkZWRTaG93cy5sZW5ndGggPiAwICYmXHJcbiAgICAgICAgICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPExpbmsgaHJlZj17XCIvc2VydmVyL1wiICsgc2VydmVyLnNlcnZlcl9pZCArIFwiL3Nob3dzXCJ9PjxhIHN0eWxlPXt7Y29sb3I6ICd3aGl0ZSd9fT48aDIgc3R5bGU9e3t0ZXh0VHJhbnNmb3JtOiAnY2FwaXRhbGl6ZSd9fT5OeWxpZ2VuIHRpbGxhZ2RhIHNlcmllcjwvaDI+PC9hPjwvTGluaz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5tb3ZpZVJvd30+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGlkPVwibmV3bHlBZGRlZFNob3dzXCIgY2xhc3NOYW1lPXtTdHlsZXMuc2Nyb2xsYWJsZX0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge25ld2x5QWRkZWRTaG93c31cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAge25ld2x5QWRkZWRTaG93cy5sZW5ndGggKiA0ODAgPiB3aW5kb3dTaXplLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5zY3JvbGxCdXR0b259IG9uQ2xpY2s9eygpID0+IHNjcm9sbExlZnQoJ25ld2x5QWRkZWRTaG93cycpfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbWcgc3JjPXtgJHtwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TRVJWRVJfVVJMfS9pbWFnZXMvbGVmdC5zdmdgfSB3aWR0aD1cIjcwXCIgaGVpZ2h0PVwiNzBcIiAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e1N0eWxlcy5zY3JvbGxCdXR0b259IHN0eWxlPXt7cmlnaHQ6ICcwJ319IG9uQ2xpY2s9eygpID0+IHNjcm9sbFJpZ2h0KCduZXdseUFkZGVkU2hvd3MnKX0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz17YCR7cHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU0VSVkVSX1VSTH0vaW1hZ2VzL3JpZ2h0LnN2Z2B9IHdpZHRoPVwiNzBcIiBoZWlnaHQ9XCI3MFwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj4gXHJcbiAgICAgICAgICAgICAgICAgICAgPGhyIGNsYXNzTmFtZT17U3R5bGVzLmRpdmlkZXJ9PjwvaHI+XHJcbiAgICAgICAgICAgICAgICAgICAgPC8+IFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICA8L0NvbnRhaW5lcj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L0xheW91dD5cclxuICAgICAgICB9XHJcbiAgICAgICAgPC8+XHJcbiAgICApXHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IG1haW47XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuLy8gR2V0IHRoZSBpbmZvcm1hdGlvbiBhYm91dCB0aGUgc2VydmVyIGFuZCBzZW5kIGl0IHRvIHRoZSBmcm9udCBlbmQgYmVmb3JlIHJlbmRlciAodGhpcyBpcyBzZXJ2ZXItc2lkZSlcclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNlcnZlclNpZGVQcm9wcyhjb250ZXh0KSB7XHJcbiAgICBsZXQgc2VydmVySWQgPSBjb250ZXh0LnBhcmFtcy5zZXJ2ZXI7XHJcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2goYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwcm9jZXNzLmVudi5TRVJWRVJfUE9SVH0ke3Byb2Nlc3MuZW52LlNFUlZFUl9TVUJfRk9MREVSfS9hcGkvc2VydmVycy9nZXRTZXJ2ZXJgLCB7XHJcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXHJcbiAgICAgICAgfSxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICAgIGlkOiBzZXJ2ZXJJZFxyXG4gICAgICAgIH0pLFxyXG4gICAgfSlcclxuICAgIC50aGVuKChyKSA9PiByLmpzb24oKSlcclxuICAgIC50aGVuKChkYXRhKSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgcHJvcHM6IHtcclxuICAgICAgICAgICAgICAgIHNlcnZlcjogZGF0YS5zZXJ2ZXJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG4iXSwic291cmNlUm9vdCI6IiJ9