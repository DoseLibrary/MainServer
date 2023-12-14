import Head from 'next/head'
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router'
import { Form, Button, ListGroup, Image } from 'react-bootstrap';
import Styles from '../../../../../styles/movies.video.module.css';
import Router from 'next/router';
import cookies from 'next-cookies'
import HlsPlayer from '../../../../../components/hlsPlayer';
import VideoTrailer from '.././../../../../components/videoTrailer';
import validateServerAccess from '../../../../../lib/validateServerAccess';
import Actor from '../../../../../components/actor';
import useWindowSize from '../../../../../components/hooks/WindowSize';
import MovieBackdrop from '../../../../../components/movieBackdrop';
import ChangeImages from '../../../../../components/changeImages';
import ContentServer from '../../../../../lib/ContentServer';
import { fetchAuthImage } from '../../../../../lib/fetchAuthImage';


export default function Home(props) {
  const server = props.server;
  const contentServer = new ContentServer(server);
  const router = useRouter();
  const { id } = router.query;
  const serverToken = props.serverToken;
  const [metadata, setMetadata] = useState({});
  const [endsAt, setEndsAt] = useState('unknown');
  const [watched, setWatched] = useState(false);
  const [inWatchList, setInWatchList] = useState(false);
  const [watchtime, setWatchtime] = useState(undefined);
  const [characters, setCharacters] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [backdrop, setBackdrop] = useState(undefined);
  const [poster, setPoster] = useState(undefined);

  const [viewTrailer, setViewTrailer] = useState(false);
  const [trailer, setTrailer] = useState(false);

  const [loaded, setLoaded] = useState(false)
  const [recommendedLoaded, setRecommendedLoaded] = useState(false);

  const videoRef = useRef();
  const windowSize = useWindowSize();



  // Used for manual metadata search
  const [metadataBox, setMetadataBox] = useState(false);
  const [metadataSearchResult, setMetadataSearchResult] = useState([]);
  const metadataSearch = useRef(null);

  const formatSeconds = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    let minutes = Math.floor(seconds / 60) - hours * 60;
    let secondsLeft = seconds - minutes * 60 - hours * 3600;

    // Pad minutes and seconds with leading zero if needed
    minutes = minutes.toString().padStart(2, '0');
    secondsLeft = secondsLeft.toString().padStart(2, '0');

    let timeString = '';
    if (hours > 0) {
      timeString += `${hours}:`;
    }
    timeString += `${minutes}:${secondsLeft}`;

    return timeString;
  }

  // This has it's own useEffect because if it doesn't videojs doesn't work (????)
  useEffect(() => {
    contentServer.listRecommendedMovies(id)
      .then(movies => {
        setRecommended(movies);
        setRecommendedLoaded(true);
      });

    contentServer.getMovieInfo(id)
      .then(async ({ movie, characters, userMovieData }) => {
        // videoRef.current.setTitle(meta.title);

        const posterUrl = await fetchAuthImage(`${server.server_ip}/api/image/${movie.posterId}?size=small`);
        const backdropUrl = await fetchAuthImage(`${server.server_ip}/api/image/${movie.backdropId}?size=original`);
        setPoster(posterUrl);
        setBackdrop(backdropUrl);
        setMetadata(movie);
        setCharacters(characters);
        setInWatchList(userMovieData.inWatchlist);
        setWatchtime(userMovieData.timeWatched);
        setWatched(userMovieData.watched);
        if (movie.duration) {
          const endsAt = new Date(Date.now() + movie.duration * 1000);
          setEndsAt(endsAt.toTimeString().split(' ')[0]);
        }
        //setTrailer(meta.trailer);
        if (router.query.autoPlay) {
          videoRef.current.show();
        }
      }).then(() => {
        setLoaded(true)
      });
  }, []);

  const markAsWatched = () => {
    contentServer.markMovieAsWatched(id)
      .then(() => setWatched(true))
      .catch(err => {
        console.log("ERROR MARKING AS WATCHED: " + status);
        console.log(err);
      });
  }

  const markAsNotWatched = () => {
    contentServer.markMovieAsUnwatched(id)
      .then(() => setWatched(false))
      .catch(err => {
        console.log("ERROR MARKING AS NOT WATCHED: " + status);
        console.log(err);
      });
  }

  const addToWatchList = () => {
    contentServer.addMovieToWatchlist(id)
      .then(() => setInWatchList(true))
      .catch(err => {
        console.log("ERROR adding to watchlist: " + status);
        console.log(err);
      });
  }

  const removeFromWatchList = () => {
    contentServer.removeMovieFromWatchlist(id)
      .then(() => setInWatchList(false))
      .catch(err => {
        console.log("ERROR removing from watchlist: " + status);
        console.log(err);
      });
  }

  const searchMetadata = (event) => {
    let search = metadataSearch.current.value;
    if (search != "") {
      contentServer.searchForMovieMetadata(search)
        .then(result => result.map(movie => (
          <ListGroup.Item key={movie.externalid} className={Styles.metadataSearchRow} data-metadataid={movie.externalid}>
            <Image
              src={movie.poster !== undefined ? `https://image.tmdb.org/t/p/w500/${movie.poster}` : 'https://via.placeholder.com/500x750'}
              alt=""
            />
            <div>
              <h5>{movie.title}</h5>
              <p>{movie.overview}</p>
            </div>
            <Button onClick={() => updateMetadata(movie.externalId)}>Choose</Button>
          </ListGroup.Item>
        )))
        .then(setMetadataSearchResult);
    }

    event.preventDefault();
  }

  const updateMetadata = (externalId) => {
    contentServer.updateMovieMetadata(id, externalId)
      .then(() => Router.reload(window.location.pathname));
  }


  const getCharacters = () => {
    return characters.map(character =>
      <Actor
        key={character.orderInCredit}
        name={character.actor.name}
        characterName={character.name}
        image={character.actor.imageId ? `${server.server_ip}/api/image/${character.actor.imageId}?size=small` : undefined}
      />)
  }

  const getRecommended = () => {
    let elements = [];
    for (const movie of recommended) {
      const img = movie.backdropId != null ? `${server.server_ip}/api/image/${movie.backdropId}?size=small` : undefined;
      elements.push(
        <MovieBackdrop markAsDoneButton id={movie.id} runtime={movie.duration} title={movie.title} overview={movie.overview} backdrop={img} onClick={(id) => selectMovie(movie.id)}></MovieBackdrop>
      );
    }
    return elements;
  }

  const selectMovie = (id) => {
    Router.push(`/server/${server.server_id}/movies/video/${id}`);
    Router.events.on("routeChangeComplete", () => {
      Router.reload(window.location.pathname);
    });
  }

  const scrollLeft = (id) => {
    document.getElementById(id).scrollLeft -= (window.innerWidth) * 0.8;
    window.scrollTo(window.scrollX, window.scrollY - 1);
    window.scrollTo(window.scrollX, window.scrollY + 1);
  }
  const scrollRight = (id) => {
    document.getElementById(id).scrollLeft += (window.innerWidth) * 0.8;
    window.scrollTo(window.scrollX, window.scrollY - 1);
    window.scrollTo(window.scrollX, window.scrollY + 1);
  }

  return (
    <>
      <HlsPlayer
        ref={videoRef}
        server={server}
        id={id}
        type={"movie"}>

      </HlsPlayer>

      {(!loaded || !recommendedLoaded) &&
        <>
          <Head>
            <title>Dose</title>
          </Head>
          <div className={Styles.loadingioSpinnerEclipse}>
            <div className={Styles.ldio}>
              <div></div>
            </div>
          </div>
        </>
      }
      {loaded && recommendedLoaded &&
        <>
          <Head>
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300&display=swap" rel="stylesheet" />
            <title>{metadata.title + " (" + metadata.releaseDate}</title>
            <meta name="title" content={metadata.title + " (" + metadata.releaseDate + ")"} />
            <meta name="description" content={metadata.overview} />
          </Head>

          {trailer !== false && viewTrailer &&
            <VideoTrailer onClose={() => setViewTrailer(false)} videoPath={trailer} />
          }


          <div id="container">
            <div style={{ backgroundImage: `url('${backdrop}')` }} className={Styles.background}></div>
            <div className="backIcon" onClick={() => {
              Router.back();
              Router.events.on("routeChangeComplete", () => {
                Router.reload(window.location.pathname);
              });
            }}></div>


            {metadataBox &&
              <div className="metadataBox">
                <Form onSubmit={searchMetadata}>
                  <Form.Group controlId="formSearch">
                    <Form.Label>Update metadata for {metadata.path}</Form.Label>
                    <Form.Control ref={metadataSearch} type="text" placeholder="Search for new metadata..." />
                  </Form.Group>
                  <Button variant="primary" type="submit">
                    Search
                  </Button>
                </Form>
                <div style={{ clear: 'both' }}></div>

                <ListGroup id="metadataSearchResult">
                  {metadataSearchResult}
                </ListGroup>
              </div>
            }


            <div className={Styles.top}>
              <div className={Styles.poster} style={{ backgroundImage: `url('${poster}')` }} />
              <div className={Styles.description}>
                <h1>{metadata.title}</h1>
                <div className={Styles.metadata}>
                  <p className={Styles.releaseDate}>Released {metadata.releaseDate}</p>
                  <p className={Styles.runtime}>Length {Math.floor(metadata.duration / 3600) + "h " + Math.floor(metadata.duration % 60) + "m"}</p>
                  <p className={Styles.endsat}>Ends at {endsAt}</p>
                  <p className={Styles.addedDate}>Added {metadata.addedDate}</p>
                </div>
                <div className={Styles.overview}>
                  <p>{metadata.overview}</p>
                </div>
                <div className={Styles.actions}>
                  {watchtime > 0 &&
                    <div style={{ marginRight: "15px" }} className={Styles.actionButton}>
                      <div className={Styles.playButton} onClick={() => videoRef.current.show(watchtime)}></div>
                      <p style={{ marginTop: "5px", fontSize: '14px' }}>Resume from {formatSeconds(watchtime)}</p>
                    </div>
                  }
                  <div style={{ marginRight: "15px" }} className={Styles.actionButton}>
                    <div className={Styles.playButton} onClick={() => videoRef.current.show()}></div>
                    <p style={{ marginTop: "5px", fontSize: '14px' }}>Play from start</p>
                  </div>
                  <div className={`${Styles.actionButton} ${Styles.buttonHiddenForMobile}`}>
                    <div className={Styles.playButton} onClick={() => setViewTrailer(true)}></div>
                    <p style={{ marginTop: "5px", fontSize: '14px' }}>Show trailer</p>
                  </div>
                  {watched &&
                    <div style={{ marginLeft: "15px" }} className={Styles.actionButton}>
                      <div id="markAsWatched" style={{ backgroundImage: `url('${process.env.NEXT_PUBLIC_SERVER_URL}/images/cross.svg')` }} className={Styles.playButton} onClick={() => markAsNotWatched()}></div>
                      <p id="markAsWatchedText" style={{ marginTop: "5px", fontSize: '14px' }}>Mark as watched</p>
                    </div>
                  }
                  {!watched &&
                    <div style={{ marginLeft: "15px" }} className={Styles.actionButton}>
                      <div id="markAsWatched" style={{ backgroundImage: `url('${process.env.NEXT_PUBLIC_SERVER_URL}/images/eye.svg')` }} className={Styles.playButton} onClick={() => markAsWatched()}></div>
                      <p id="markAsWatchedText" style={{ marginTop: "5px", fontSize: '14px' }}>Unmark as watched</p>
                    </div>
                  }
                  {inWatchList &&
                    <div style={{ marginLeft: "15px" }} className={Styles.actionButton}>
                      <div id="inWatchList" style={{ backgroundImage: `url('${process.env.NEXT_PUBLIC_SERVER_URL}/images/cross.svg')` }} className={Styles.playButton} onClick={() => removeFromWatchList()}></div>
                      <p id="inWatchListText" style={{ marginTop: "5px", fontSize: '14px' }}>Remove from watchlist</p>
                    </div>
                  }
                  {!inWatchList &&
                    <div style={{ marginLeft: "15px" }} className={Styles.actionButton}>
                      <div id="inWatchList" style={{ backgroundImage: `url('${process.env.NEXT_PUBLIC_SERVER_URL}/images/eye.svg')` }} className={Styles.playButton} onClick={() => addToWatchList()}></div>
                      <p id="inWatchListText" style={{ marginTop: "5px", fontSize: '14px' }}>Add to watchlist</p>
                    </div>
                  }
                  <div className={`${Styles.actionButton} ${Styles.buttonHiddenForMobile}`}>
                    <div style={{ marginLeft: "15px", backgroundImage: `url('${process.env.NEXT_PUBLIC_SERVER_URL}/images/search.svg')` }} className={Styles.playButton} onClick={() => setMetadataBox(true)}></div>
                    <p style={{ marginLeft: "15px", marginTop: "5px", fontSize: '14px' }}>Update metadata</p>
                  </div>

                  <div style={{ clear: 'both' }}></div>
                </div>
              </div>
            </div>
            <div className={Styles.bottom}>
              <h1>Actors</h1>
              <div className={Styles.actors}>
                <div id="actors" className={Styles.actorBox}>
                  {getCharacters()}
                </div>
                {characters.length * 200 > windowSize.width &&
                  <>
                    <div className={Styles.scrollButton} onClick={() => scrollLeft('actors')}>
                      <img alt="" src={`${process.env.NEXT_PUBLIC_SERVER_URL}/images/left.svg`} width="70" height="70" />
                    </div>
                    <div className={Styles.scrollButton} style={{ right: '0' }} onClick={() => scrollRight('actors')}>
                      <img alt="" src={`${process.env.NEXT_PUBLIC_SERVER_URL}/images/right.svg`} width="70" height="70" />
                    </div>
                  </>
                }
              </div>

              <h1>Recommended</h1>
              {recommended.length > 0 &&
                <div style={{ position: 'relative' }}>
                  <div className={Styles.movieRow}>
                    <div id="recommended" className={Styles.scrollable}>
                      {getRecommended()}
                    </div>
                    {recommended.length * 480 > windowSize.width &&
                      <div>
                        <div className={Styles.scrollButton} onClick={() => scrollLeft('recommended')}>
                          <img alt="" src={`${process.env.NEXT_PUBLIC_SERVER_URL}/images/left.svg`} width="70" height="70" />
                        </div>
                        <div className={Styles.scrollButton} style={{ right: '0' }} onClick={() => scrollRight('recommended')}>
                          <img alt="" src={`${process.env.NEXT_PUBLIC_SERVER_URL}/images/right.svg`} width="70" height="70" />
                        </div>
                      </div>
                    }
                  </div>
                  <hr className={Styles.divider}></hr>
                </div>
              }
            </div>
          </div>
        </>
      }
    </>
  )
}

// Get the information about the server and send it to the front end before render (this is server-side)
export async function getServerSideProps(context) {
  let serverId = context.params.server;
  let movieID = context.params.id;

  return await fetch(`http://localhost:${process.env.SERVER_PORT}${process.env.SERVER_SUB_FOLDER}/api/servers/getServer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: serverId
    }),
  })
    .then((r) => r.json())
    .then(async (data) => {
      return {
        props: {
          server: data.server,
          serverToken: cookies(context).serverToken || ''
        }
      }

    });
}
