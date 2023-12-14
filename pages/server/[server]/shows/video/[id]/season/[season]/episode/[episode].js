import Head from 'next/head'
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router'
import Styles from '../../../../../../../../../styles/shows.video.module.css';
import Router from 'next/router';
import cookies from 'next-cookies'
import validateServerAccess from '../../../../../../../../../lib/validateServerAccess';
import HlsPlayer from '../../../../../../../../../components/hlsPlayer';
import ContentServer from '../../../../../../../../../lib/ContentServer';
import { fetchAuthImage } from '../../../../../../../../../lib/fetchAuthImage';

//let internalID, season, episode, show;

export default function Home(props) {
  const server = props.server;
  const contentServer = new ContentServer(server);
  const router = useRouter();
  const { id } = router.query;
  const serverToken = props.serverToken;
  const [metadata, setMetadata] = useState({});
  const [endsAt, setEndsAt] = useState(undefined);
  const [poster, setPoster] = useState(undefined);
  const [backdrop, setBackdrop] = useState(undefined);
  const [watched, setWatched] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState({
    id: undefined,
    season: router.query.season,
    episode: router.query.episode,
    show: router.query.id
  });

  const nextEpisode = useRef({
    season: 0,
    episode: 0,
    found: false
  });
  const [loaded, setLoaded] = useState(false)
  const initialRender = useRef(true);
  const nextEpisodeBoxVisible = useRef(false);

  const notifyAtValue = 40;
  /*
    season = router.query.season;
    episode = router.query.episode;
    show = router.query.id; // show id
    */

  const videoRef = useRef();
  const nextEpisodeButtonRef = useRef();

  const getEpisodeInformation = () => {
    return contentServer.getEpisodeInfo(id, currentEpisode.season, currentEpisode.episode)
      .then(async ({ episode, userEpisodeData }) => {
        const posterUrl = await fetchAuthImage(`${server.server_ip}/api/image/${episode.posterId}?size=small`);
        const backdropUrl = await fetchAuthImage(`${server.server_ip}/api/image/${episode.backdropId}?size=large`);
        setPoster(posterUrl);
        setBackdrop(backdropUrl);
        setMetadata(episode);
        setCurrentEpisode({
          ...currentEpisode,
          id: episode.id
        });
        if (episode.duration) {
          const endsAt = new Date(Date.now() + episode.duration * 1000);
          setEndsAt(endsAt.toTimeString().split(' ')[0]);
        }
        /*
            videoRef.current.setTitle(meta.show_name);
            videoRef.current.setInfoText(`Season ${currentEpisode.season} Episode ${currentEpisode.episode}`);
        */
      });
    /*
        return new Promise(resolve => {
          fetch(`${server.server_ip}/api/series/${id}/season/${currentEpisode.season}/episode/${currentEpisode.episode}?token=${serverToken}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          })
            .then(r => r.json())
            .then(result => {
              let meta = result.result;
              let finish_at = new Date(new Date().getTime() + meta.runtime * 60000);
              meta.finish_at = finish_at.getHours() + ":" + finish_at.getMinutes();
              for (let image of meta.images) {
                if (image.active && image.type === 'BACKDROP') {
                  meta.backdrop = image.path;
                }
                if (image.active && image.type === 'POSTER') {
                  meta.poster = image.path;
                }
              }
    
              let new_added_date = new Date(parseInt(meta.added_date));
              let added_year = new_added_date.getFullYear();
              let added_month = new_added_date.getMonth() + 1;
              if (added_month < 10) {
                added_month = "0" + added_month.toString();
              }
              let adde_date = new_added_date.getDate();
              if (adde_date < 10) {
                adde_date = "0" + adde_date.toString();
              }
              meta.added_date = `${added_year}-${added_month}-${adde_date}`
    
              let currentTime = "";
              let hours = Math.floor(meta.currentTime / 60 / 60)
              let minutes = Math.floor(meta.currentTime / 60)
              let seconds = Math.floor(meta.currentTime % 60);
              if (hours >= 1) {
                currentTime += `${hours}:`
              }
              if (minutes < 10) {
                minutes = `0${minutes}`;
              }
              if (seconds < 10) {
                seconds = `0${seconds}`
              }
              currentTime += `${minutes}:${seconds}`
              meta.currentTimeSeconds = meta.currentTime;
              meta.currentTime = currentTime;
              console.log(meta.show_name);
    
              videoRef.current.setTitle(meta.show_name);
              videoRef.current.setInfoText(`Season ${currentEpisode.season} Episode ${currentEpisode.episode}`);
              setWatched(meta.watched);
              setMetadata(meta);
              resolve();
            })
        });
        */
  };


  // This has it's own useEffect because if it doesn't videojs doesn't work (????)
  useEffect(() => {
    getEpisodeInformation().then(() => {
      setLoaded(true);
      getNextEpisodeID();
    });
  }, []);

  const markAsWatched = () => {
    validateServerAccess(server, (serverToken) => {
      fetch(`${server.server_ip}/api/movies/${id}/setWatched?watched=true&token=${serverToken}`)
        .then(r => r.json())
        .then(status => {
          if (status.success) {
            setWatched(true);
          } else {
            console.log("ERROR MARKING AS WATCHED: " + status);
          }
        }).catch(err => {
          console.log(err);
        });
    });
  }

  const markAsNotWatched = () => {
    validateServerAccess(server, (serverToken) => {
      fetch(`${server.server_ip}/api/movies/${id}/setWatched?watched=false&token=${serverToken}`)
        .then(r => r.json())
        .then(status => {
          if (status.success) {
            setWatched(false);
          } else {
            console.log("ERROR MARKING AS WATCHED: " + status);
          }
        })
        .catch(err => {
          console.log(err);
        });
    });
  }

  const showNextEpisodeBox = () => {
    console.log("Notified");
    console.log(nextEpisode);
    if (nextEpisode.current.found) {
      nextEpisodeBoxVisible.current = true;
      setShowNextEpisode(true);
    }
  }

  const timeUpdate = (time, duration) => {
    if (nextEpisodeBoxVisible.current) {
      const width = Math.abs(((duration - time) / notifyAtValue - 1) * 100);
      nextEpisodeButtonRef.current.style.width = `${width}%`;

      if (width == 100) {
        changeToNexEpisode();
      }
    }
  };

  /*
  // Called when currentEpisode is changed
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
    } else {
      console.log("Episode changed");
      console.log(currentEpisode);
      window.history.replaceState('state', 'Video', `${process.env.NEXT_PUBLIC_SERVER_URL}/server/${server.server_id}/shows/video/${id}/season/${currentEpisode.season}/episode/${currentEpisode.episode}`);

      getEpisodeInformation().then(() => {
        const src = `${server.server_ip}/api/video/${currentEpisode.internalID}/hls/master`; // TODO: set internal id here
        console.log(`Switching to next episode, src: ${src}`);
        videoRef.current.setSrc(currentEpisode.internalID);
        getNextEpisodeID();
      });
    }

  }, [currentEpisode]);
  */


  const changeToNexEpisode = () => {
    nextEpisodeBoxVisible.current = false;
    setShowNextEpisode(false);
    const episode = {
      season: nextEpisode.current.season,
      episode: nextEpisode.current.episode,
      show: currentEpisode.show
    };
    setCurrentEpisode(episode);
    // TODO: Fetch next episode info
  };


  const getNextEpisodeID = () => {
    contentServer.getNextEpisode(currentEpisode.show, currentEpisode.season, currentEpisode.episode)
      .then(({ found, season, episode }) => {
        const nextEpisodeData = found ? {
          season,
          episode,
          found: true
        } : {
          season: 0,
          episode: 0,
          found: false
        }
        if (found) {
          console.log(`Found next episode: season: ${season}, episode: ${episode}`);
        } else {
          console.log("No next episode found");
        }
        nextEpisode.current = nextEpisodeData;
      });
  }

  const goToShowPage = () => {
    router.push(`/server/${server.server_id}/shows/video/${id}`);
  };

  /*
          <HlsPlayer
              ref={videoRef}
              server={server}
              id={internalID}
              notifyAt={notifyAtValue}
              notify={showNextEpisodeBox}
              timeUpdate={timeUpdate}
              type={"serie"}>
              {showNextEpisode &&
                  <div className={Styles.nextEpisodeButton} onClick={changeToNexEpisode}>
                      <div className={Styles.nextEpisodeContainer}>
                          <div className={Styles.nextEpisodeColor} ref={nextEpisodeButtonRef}></div>
                          <p>Play Next Episode</p>
                      </div>
                  </div>
              }

          </HlsPlayer>
  */
  return (
    <>
      <Head>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300&display=swap" rel="stylesheet" />
      </Head>

      {currentEpisode.id &&
        <HlsPlayer
          ref={videoRef}
          server={server}
          id={currentEpisode.id}
          notifyAt={notifyAtValue}
          notify={showNextEpisodeBox}
          timeUpdate={timeUpdate}
          type={"episode"}>
          {showNextEpisode &&
            <div className={Styles.nextEpisodeButton} onClick={changeToNexEpisode}>
              <div className={Styles.nextEpisodeContainer}>
                <div className={Styles.nextEpisodeColor} ref={nextEpisodeButtonRef}></div>
                <p>Play Next Episode</p>
              </div>
            </div>
          }
        </HlsPlayer>
      }

      {!loaded &&
        <div className={Styles.loadingioSpinnerEclipse}>
          <div className={Styles.ldio}>
            <div></div>
          </div>
        </div>
      }
      {loaded &&
        <>
          <div className={Styles.episodeContainer}>
            <div style={{ backgroundImage: `url('${backdrop}')` }} className={Styles.background}></div>
            <div className="backIcon" onClick={() => Router.back()}></div>


            <div className={Styles.top + " " + Styles.episodeTop}>
              <div className={Styles.poster} style={{ backgroundImage: `url('${poster}')` }} />
              <div className={Styles.description}>
                <h1>{metadata.title}</h1>
                <div className={Styles.metadata}>
                  <>
                    <p className={Styles.releaseDate}>First air date {metadata.airDate}</p>
                    <p className={Styles.endsat}>Ends at {endsAt}</p>
                  </>
                  <p className={Styles.addedDate}>Added {metadata.addedDate}</p>

                </div>
                <div className={Styles.overview}>
                  <p>{metadata.overview}</p>
                </div>
                <div className={Styles.actions}>
                  {metadata.currentTimeSeconds > 0 &&
                    <div style={{ marginRight: "15px" }} className={Styles.actionButton}>
                      <div className={Styles.playButton} onClick={() => videoRef.current.show(metadata.currentTimeSeconds)}></div>
                      <p style={{ marginTop: "5px", fontSize: '14px' }}>Resume from {metadata.currentTime}</p>
                    </div>
                  }
                  <div className={Styles.actionButton}>
                    <div className={Styles.playButton} onClick={() => videoRef.current.show()}></div>
                    <p style={{ marginTop: "5px", fontSize: '14px' }}>Play from the start</p>
                  </div>
                  <div className={Styles.actionButton} style={{ marginLeft: "15px" }}>
                    <div id="goToShow" style={{ backgroundImage: `url('${process.env.NEXT_PUBLIC_SERVER_URL}/images/television.svg')` }} className={Styles.playButton} onClick={goToShowPage} ></div>
                    <p id="markAsWatchedText" style={{ marginTop: "5px", fontSize: '14px' }}>Go to the show</p>

                  </div>
                </div>
              </div>
            </div>
            {false &&
              <div className={Styles.bottom}>
                <h1>Actors</h1>
                <div className={Styles.actors}>
                  <div className={Styles.actor}>

                  </div>
                </div>
              </div>
            }
          </div>
        </>
      }
    </>
  )
}

// Get the information about the server and send it to the front end before render (this is server-side)
export async function getServerSideProps(context) {
  let serverId = context.params.server;

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
    })
}
