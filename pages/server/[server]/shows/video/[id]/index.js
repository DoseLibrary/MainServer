import Head from 'next/head'
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router'
import Styles from '../../../../../../styles/shows.video.module.css';
import Router from 'next/router';
import SeasonPoster from '../../../../../../components/seasonPoster';
import cookies from 'next-cookies'
import ContentServer from '../../../../../../lib/ContentServer';
import { fetchAuthImage } from '../../../../../../lib/fetchAuthImage';

// Fetcher for useSWR, redirect to login if not authorized
let fetchedMetadata = false;


export default function Home(props) {
  const server = props.server;
  const contentServer = new ContentServer(server);
  const router = useRouter();
  const { id } = router.query;
  const serverToken = props.serverToken;
  const [metadata, setMetadata] = useState({
    seasons: []
  });
  const [poster, setPoster] = useState(undefined);
  const [backdrop, setBackdrop] = useState(undefined);
  const [loaded, setLoaded] = useState(false)


  // This has it's own useEffect because if it doesn't videojs doesn't work (????)
  useEffect(() => {
    contentServer.getShowInfo(id)
      .then(async (show) => {
        const posterUrl = await fetchAuthImage(`${server.server_ip}/api/image/${show.posterId}?size=small`);
        const backdropUrl = await fetchAuthImage(`${server.server_ip}/api/image/${show.backdropId}?size=large`);
        setBackdrop(backdropUrl);
        setPoster(posterUrl);
        setMetadata(show);
      }).then(() => {
        setLoaded(true)
      });
  }, []);

  const selectSeason = (seasonId) => {
    Router.push(`/server/${server.server_id}/shows/video/${id}/season/${seasonId}`);
  }



  const getSeasonElements = () => {
    return metadata.seasons.map(season => {
      const img = season.posterId != null ? `${server.server_ip}/api/image/${season.posterId}?size=small` : undefined;
      return <SeasonPoster key={season.number} name={season.title} title={season.title} id={season.number} poster={img} onClick={() => selectSeason(season.number)}></SeasonPoster>
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
                <h1>{metadata.title}</h1>
                <div className={Styles.metadata}>
                  <p className={Styles.releaseDate}>First air date: {metadata.firstAirDate}</p>
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
              <h1>Seasons</h1>
              <div className={Styles.seasons}>
                {getSeasonElements()}
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
