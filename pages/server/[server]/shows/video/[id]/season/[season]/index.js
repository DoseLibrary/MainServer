import Head from 'next/head'
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router'
import Styles from '../../../../../../../../styles/shows.video.module.css'
import Router from 'next/router';
import validateServerAccess from '../../../../../../../../lib/validateServerAccess';
import EpisodeRow from '../../../../../../../../components/episodeRow';

import cookies from 'next-cookies'
import ContentServer from '../../../../../../../../lib/ContentServer';
import { fetchAuthImage } from '../../../../../../../../lib/fetchAuthImage';

// Fetcher for useSWR, redirect to login if not authorized
let fetchedMetadata = false;


export default function Home(props) {
  const server = props.server;
  const contentServer = new ContentServer(server);
  const router = useRouter();
  const { id, season } = router.query;
  const serverToken = props.serverToken;
  const [metadata, setMetadata] = useState();
  const [poster, setPoster] = useState(undefined);
  const [backdrop, setBackdrop] = useState(undefined);

  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    contentServer.getSeasonInfo(id, season).then(async (result) => {
      setMetadata(result);
      const posterUrl = await fetchAuthImage(`${server.server_ip}/api/image/${result.posterId}?size=small`);
      const backdropUrl = await fetchAuthImage(`${server.server_ip}/api/image/${result.backdropId}?size=large`);
      setPoster(posterUrl);
      setBackdrop(backdropUrl);
      setLoaded(true);
    });
  }, []);

  const selectEpisode = (episodeID) => {
    Router.push(`/server/${server.server_id}/shows/video/${id}/season/${season}/episode/${episodeID}`);
  }

  const getEpisodeElements = () => {
    return metadata.episodes.map(episode => {
      const image = episode.backdropId != null ? `${server.server_ip}/api/image/${episode.backdropId}?size=small` : undefined;
      return (
        <EpisodeRow
          key={episode.episode}
          name={episode.name}
          overview={episode.overview}
          episode={episode.episode}
          backdrop={image}
          onClick={() => selectEpisode(episode.episode)}
        />
      );
    });
  }

  return (

    <>
      {!loaded &&
        <div className={Styles.loadingioSpinnerEclipse}>
          <div className={Styles.ldio}>
            <div></div>
          </div>
        </div>
      }
      {loaded &&
        <>
          <Head>
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300&display=swap" rel="stylesheet" />
          </Head>

          <div id="container">
            <div style={{ backgroundImage: `url('${backdrop}')` }} className={Styles.background}></div>
            <div className="backIcon" onClick={() => Router.back()}></div>


            <div className={Styles.top}>
              <div className={Styles.poster} style={{ backgroundImage: `url('${poster}')` }} />
              <div className={Styles.description}>
                <h1>{metadata.show.title} {metadata.title}</h1>
                <div className={Styles.metadata}>
                  <p className={Styles.releaseDate}>First air date: {metadata.airDate}</p>
                  <p className={Styles.addedDate}>Added to library: {metadata.addedDate}</p>
                </div>
                <div className={Styles.overview}>
                  <p>{metadata.overview}</p>
                </div>
                <div className={Styles.actions}>
                </div>
              </div>
            </div>
            <div className={Styles.bottom}>
              <h1>Episodes</h1>
              <div className={Styles.EpisodeContainer}>
                {getEpisodeElements()}
              </div>
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
