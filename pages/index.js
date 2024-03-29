import Head from 'next/head'
import Layout from '../components/layout'
import style from '../styles/index.module.css';
import useSWR from 'swr';
import ServerBox from '../components/serverBox';
import Router from 'next/router';
import cookie from 'js-cookie';

// Fetcher for useSWR, redirect to login if not authorized
const fetcher = url =>
    fetch(url)
        .then(r => {
            return r.json().then(result => {
                console.log(result)
                console.log(result["servers"].length)
                if (result["servers"].length != 1) {
                    return result;
                } else {
                    let server = result["servers"][0]
                    cookie.set('server', JSON.stringify({
                        id: server.server_id,
                        name: server.server_name,
                        ip: server.server_ip
                    }));
                    Router.push(`/server/${server.server_id}`);
                }
            });
        }
        );
const chooseServer = server => {
    cookie.remove('serverToken')
    cookie.set('server', JSON.stringify({
        id: server.server_id,
        name: server.server_name,
        ip: server.server_ip
    }));
    Router.push(`/server/${server.server_id}`);
}

export default function Home() {
    const { data, error } = useSWR(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/servers/getServers?token=${cookie.get('token')}`, fetcher);

    return (
        <Layout home relative>
            <Head>
                <title>Dose</title>
            </Head>
            {data && data.servers &&
                <div className={style.servers}>
                    {data.servers.map((server, idx) => <ServerBox onClick={() => chooseServer(server)} key={idx} name={server.server_name} adress={server.server_ip}></ServerBox>)}
                </div>
            }
            <div className={style.background} style={{backgroundImage: "url(/images/login_bg.jpg)"}}>
                <div className={style.blur}></div>
            </div>

            {!data &&
                <h1>Loading</h1>
            }
            {error &&
                <h1>fel</h1>
            }
        </Layout>
    )
}
