import Head from 'next/head'
import styles from './layout.module.css'
import Search from './search';
import { useState } from 'react'
import MovieBackdrop from './movieBackdrop';
import Router from 'next/router';
import Menu from './Menu/menu';


export default function Layout({ children, home, searchEnabled, server, relative, serverToken }) {
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  let count = 0;
  searchEnabled = searchEnabled == undefined ? false : true;
  const shouldShowMenu = server == undefined ? false : true;

  const selectMovie = (id) => {
    Router.push(`/server/${server.server_id}/movies/video/${id}`);
  }

  const selectShow = (id) => {
    Router.push(`/server/${server.server_id}/shows/video/${id}`);
  }

  const onSearch = (result) => {
    const elements = [];
    result.movies.forEach(movie => {
      const img = movie.backdropId != null ? `${server.server_ip}/api/image/${movie.backdropId}?size=small` :  undefined;
      elements.push(<MovieBackdrop multipleRows key={movie.id} id={movie.id} title={movie.title} overview={movie.overview} backdrop={img} onClick={(id) => selectMovie(id)} />);
    });
    result.shows.forEach(show => {
      const img = show.backdropId != null ? `${server.server_ip}/api/image/${show.backdropId}?size=small` :  undefined;
      elements.push(<MovieBackdrop multipleRows key={show.id} id={show.id} title={show.title} overview={show.overview} backdrop={img} onClick={(id) => selectShow(id)} />);
    });
    setIsSearching(true);
    setSearchResults(elements);
  }

  const onClose = () => {
    setIsSearching(false);
  }

  return (
    <div>
      <Head>
        <link rel="shortcut icon"
          type="image/x-icon"
          href={`${process.env.NEXT_PUBLIC_SERVER_URL}/favicon.ico`} />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300&display=swap" rel="stylesheet" />
        <title>Dose</title>
      </Head>
      <header className={styles.header} style={relative !== undefined ? { position: 'relative' } : {}}>
        <div className={styles.headerContent}>
          <h1>dose</h1>
          {shouldShowMenu &&
            <>
              <Menu className={styles.menu} server={server}></Menu>
            </>
          }
        </div>

        {searchEnabled &&
          <Search
            className={styles.search}
            onClose={() => onClose()}
            searchEnabled={searchEnabled}
            server={server}
            serverToken={serverToken}
            onSearch={(result) => onSearch(result)}>
          </Search>
        }
      </header>
      {isSearching &&
        <div style={{ position: 'relative', top: '115px', textAlign: 'center' }}>
          <h2 style={{ textTransform: 'capitalize', margin: '0 0 15px 15px', color: 'white' }}>Results ({searchResults.length})</h2>
          <div className={styles.searchResultBox}>
            {searchResults}
          </div>
        </div>
      }

      {!isSearching &&
        <main>{children}</main>
      }
    </div>
  )
}

