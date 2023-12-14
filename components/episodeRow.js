import { fetchAuthImage } from '../lib/fetchAuthImage';
import style from './episodeRow.module.css';
import { Component } from 'react';

export default class EpisodeRow extends Component {
    constructor(props) {
        super(props);
        this.name = props.name
        this.episode = props.episode
        this.backdrop = props.backdrop
        this.overview = props.overview

        this.state = {
            img: ''
        }
    }

    async componentDidMount() {
        const posterUrl = await fetchAuthImage(this.backdrop);
        this.setState({ img: posterUrl });
    }

    getBackdropStyle() {
        return {
            backgroundImage: `url('${this.state.img}')`
        }
    }

    render() {

        return (
            <div className={style.row}>
                <div onClick={() => this.props.onClick(this.episode)} className={style.backdrop} style={this.getBackdropStyle()}>
                    <div className={style.playIcon}></div>
                </div>
                <div className={style.episodeInformation}>
                    <h3>{this.episode}. {this.name}</h3>
                    <p className={style.overview}>{this.overview}</p>
                </div>
            </div>

        )
    }
}