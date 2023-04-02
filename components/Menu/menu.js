import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Styles from './menu.module.css';

const Menu = (props) => {
    const {
        server,
        className
    } = props;
    const router = useRouter();

    useEffect(() => {
        const links = document.getElementsByClassName(Styles.link);
        for (const link of links) {
            if (router.asPath === link.getAttribute('href')) {
                link.classList.add(Styles.active);
            }
        }
    }, []);

    return (
        <nav className={className}>
            <Link href={`/server/${server.server_id}`} className={Styles.link}>Home</Link>
            <Link href={`/server/${server.server_id}/movies`} className={Styles.link}>Movies</Link>
            <Link href={`/server/${server.server_id}/shows`} className={Styles.link}>TV Shows</Link>
        </nav>
    );
}

export default Menu;