import validateServerAccess from './validateServerAccess';

export default class ContentServer {
    // The server
    #server;
    // The IP
    #ip;

    constructor(server) {
        this.#server = server;
        this.#ip = server.server_ip;
    }

    getActiveLogo(images) {
        for (let image of images) {
            if (image.type === 'LOGO' && image.active && image.path != "no_image") {
                return image;
            }
        }
        return false;
    }

    getActiveImages(images) {
        const result = {
            backdrop: null,
            poster: null
        }

        for (let image of images) {
            if (image.active) {
                if (image.type === 'BACKDROP') {
                    if (image.path === 'no_image') {
                        result.backdrop = null;
                    } else {
                        result.backdrop = image.path;
                    }
                } else {
                    if (image.path === 'no_image') {
                        result.poster = null;
                    } else {
                        result.poster = image.path;
                    }
                }

                if (result.backdrop != null && result.poster != null) {
                    break;
                }
            }
        }
        return result;
    }

    #requestNoResponse(url, options) {
        return fetch(url, options);
    }

    #request(url, options) {
        return fetch(url, options).then(r => r.json());
    }

    getStandardPostOptions(token) {
        return {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        }
    }

    getStandardGetOptions(token) {
        return {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        }
    }

    getStandardDeleteOptions(token) {
        return {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        }
    }

    getStandardPutOptions(token) {
        return {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        }
    }

    getPopularMovies(limit = 20) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/movies/list/popular?orderBy=releaseDate&limit=${limit}`
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getOngoingMovies(limit = 20) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/user/ongoing/movies?orderBy=releaseDate&limit=${limit}`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getWatchlist(limit = 20) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/user/watchlist?orderBy=releaseDate&limit=${limit}`
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getNewlyAddedMovies(limit = 20) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/movies/list?orderBy=addedDate&limit=${limit}`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getNewlyAddedShows(limit = 20) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/shows/list?orderBy=addedDate&limit=${limit}`
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getNewlyAddedEpisodes(limit = 20) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/shows/list/episodes?orderBy=addedDate&limit=${limit}`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getRandomTrailer() {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, (token) => {
                // Get recommended video (random video right now)
                const url = `${this.#ip}/api/movies/random?requireTrailer=true`
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getOngoingShows(limit = 20) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/user/ongoing/episodes?orderBy=addedDate&limit=${limit}`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getAllGenres() {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/genre/list`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getMoviesByGenre(genre, limit = 20, offset = 0) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/movies/list/genre/${genre}?orderBy=addedDate&limit=${limit}&offset=${offset}`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            });
        });
    }

    getMovieInfo(id) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const movieDataUrl = `${this.#ip}/api/movie/${id}`;
                const charactersInfoUrl = `${this.#ip}/api/movie/${id}/characters`;
                const userMovieDataUrl = `${this.#ip}/api/user/movie/${id}`;
                Promise.all([
                    this.#request(movieDataUrl, this.getStandardGetOptions(token)),
                    this.#request(charactersInfoUrl, this.getStandardGetOptions(token)),
                    this.#request(userMovieDataUrl, this.getStandardGetOptions(token))
                ]).then(([movie, characters, userMovieData]) => {
                    resolve({
                        movie,
                        characters,
                        userMovieData
                    });
                });
            });
        });
    }

    getMovieSubtitles(id) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/movie/${id}/subtitles`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            })
        });
    }

    getMovieResolutions(id) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/movie/${id}/resolutions`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            })
        });
    }

    getMovieLanguages(id) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/movie/${id}/languages`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            })
        });
    }

    updateVideoProgress(type, id, time) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/user/${type}/${id}/current-time?time=${time}`;
                resolve(this.#requestNoResponse(url, this.getStandardPutOptions(token)));
            })
        });
    }

    getMovieProgress(id) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/user/progres/movie/${id}`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            })
        });
    }

    addMovieToWatchlist(id) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/user/watchlist?id=${id}`;
                const options = this.getStandardPutOptions(token);
                this.#requestNoResponse(url, options)
                    .then(resolve)
                    .catch(reject);
            })
        });
    }

    removeMovieFromWatchlist(id) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/user/watchlist?id=${id}`;
                const options = this.getStandardDeleteOptions(token);
                this.#requestNoResponse(url, options)
                    .then(resolve)
                    .catch(reject);
            })
        });
    }

    markMovieAsWatched(id) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/user/movie/${id}/watched`;
                this.#requestNoResponse(url, this.getStandardPostOptions(token))
                    .then(resolve)
                    .catch(reject);
            })
        });
    }

    markMovieAsUnwatched(id) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/user/movie/${id}/watched`;
                this.#requestNoResponse(url, this.getStandardDeleteOptions(token))
                    .then(resolve)
                    .catch(reject);
            })
        });
    }

    searchForMovieMetadata(query) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/metadata/movie/search?query=${query}`;
                this.#request(url, this.getStandardGetOptions(token))
                    .then(resolve)
                    .catch(reject);
            })
        });
    }

    updateMovieMetadata(movieId, externalId) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/metadata/movie/${movieId}/update`;
                const options = this.getStandardPostOptions(token);
                options.body = JSON.stringify({
                    externalId
                });
                this.#request(url, options).then(resolve).catch(reject);
            })
        });
    }

    listExternalImages(type, id) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/image/list/${type}/${id}/external`;
                this.#request(url, this.getStandardGetOptions(token))
                    .then(resolve).catch(reject);
            })
        });
    }

    listRecommendedMovies(id) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/movie/${id}/recommended`;
                this.#request(url, this.getStandardGetOptions(token))
                    .then(resolve).catch(reject);
            })
        });
    }

    stopTranscoding(transcodingId) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/video/hls/stop?id=${transcodingId}`;
                resolve(this.#requestNoResponse(url, this.getStandardDeleteOptions(token)));
            })
        });
    }

    getShowsByGenre(genre, limit = 20) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/shows/list/genre/${genre}?orderby=addedDate&limit=${limit}`;
                resolve(this.#request(url, this.getStandardGetOptions(limit)));
            });
        });
    }

    getShowInfo(id) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/show/${id}`;
                this.#request(url, this.getStandardGetOptions(token))
                    .then(resolve).catch(reject);
            });
        });
    }

    getSeasonInfo(showId, seasonNumber) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, (token) => {
                const url = `${this.#ip}/api/show/${showId}/season/${seasonNumber}`;
                this.#request(url, this.getStandardGetOptions(token))
                    .then(resolve).catch(reject);
            });
        });
    }

    /*
            validateServerAccess(this.#server, (token) => {
                const movieDataUrl = `${this.#ip}/api/movie/${id}`;
                const charactersInfoUrl = `${this.#ip}/api/movie/${id}/characters`;
                const userMovieDataUrl = `${this.#ip}/api/user/movie/${id}`;
                Promise.all([
                    this.#request(movieDataUrl, this.getStandardGetOptions(token)),
                    this.#request(charactersInfoUrl, this.getStandardGetOptions(token)),
                    this.#request(userMovieDataUrl, this.getStandardGetOptions(token))
                ]).then(([movie, characters, userMovieData]) => {
                    resolve({
                        movie,
                        characters,
                        userMovieData
                    });
                });
            });
    */

    getEpisodeInfo(showId, seasonNumber, episodeNumber) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, (token) => {
                const episodeDataUrl = `${this.#ip}/api/show/${showId}/season/${seasonNumber}/episode/${episodeNumber}`;
                const userEpisodeDataUrl = `${this.#ip}/api/user/show/${showId}/season/${seasonNumber}/episode/${episodeNumber}`;
                Promise.all([
                    this.#request(episodeDataUrl, this.getStandardGetOptions(token)),
                    this.#request(userEpisodeDataUrl, this.getStandardGetOptions(token))
                ]).then(([episode, userEpisodeData]) => {
                    resolve({
                        episode,
                        userEpisodeData
                    });
                });
            });
        });
    }

    getNextEpisode(showId, seasonNumber, episodeNumber) {
        return new Promise((resolve, reject) => {
            validateServerAccess(this.#server, (token) => {
                const episodeDataUrl = `${this.#ip}/api/show/${showId}/season/${seasonNumber}/episode/${episodeNumber}/next`;
                this.#request(episodeDataUrl, this.getStandardGetOptions(token))
                    .then(resolve).catch(reject);
            });
        });
    }

    getEpisodeSubtitles(episodeId) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/show/episode/${episodeId}/subtitles`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            })
        });
    }

    getEpisodeLanguages(episodeId) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/show/episode/${episodeId}/languages`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            })
        });
    }

    getEpisodeResolutions(episodeId) {
        return new Promise(resolve => {
            validateServerAccess(this.#server, token => {
                const url = `${this.#ip}/api/show/episode/${episodeId}/resolutions`;
                resolve(this.#request(url, this.getStandardGetOptions(token)));
            })
        });
    }
}