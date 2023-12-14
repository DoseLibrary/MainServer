import style from './serverBox.module.css';
import { useRef } from 'react';
import { Component, createRef } from 'react';

export default class ServerBox extends Component {
    constructor(props) {
        super(props);
        this.serverBox = createRef();


        this.serverName = props.name;
        this.serverAdress = props.adress;
        this.checkStatus();
    }

    fetchWithTimeout(url, options, timeout = 10000) {
        return Promise.race([
            fetch(url, options),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
        ]);
    }

    checkStatus() {
        this.fetchWithTimeout(`${this.serverAdress}/api/ping`, {}, 10000)    
        .then((res) => {
            // check so that the server we are pinging is responding to the request
            if(res.status == 200) {
                this.serverBox.current.classList.add(style.statusSuccess);
                this.serverBox.current.classList.remove(style.statusPing);
            } else {
                this.serverBox.current.classList.add(style.statusError);
                this.serverBox.current.classList.remove(style.statusPing);
            }
        })
        .catch(e => {
            if (this.serverBox.current == null) return; // if the component is unmounted, dont try to set state
            this.serverBox.current.classList.add(style.statusError);
            this.serverBox.current.classList.remove(style.statusPing);
        });
    }

    render() {
        return (
            <div onClick={this.props.onClick} className={style.server + ' ' + style.statusPing} ref={this.serverBox}>
                <img src={'/images/test_logo.png'} alt='server logo' className={style.serverLogo}></img>
                <p className={style.serverTitle}>{this.serverName}</p>
            </div>
        )
    }
}
