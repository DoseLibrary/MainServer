import { fetchAuthImage } from '../lib/fetchAuthImage';
import style from './episodePoster.module.css';
import { Component } from 'react';

export default class EpisodePoster extends Component {
    constructor(props) {
        super(props);
        this.show = props.show;
        this.season = props.season;
        this.episode = props.episode;
        this.poster = props.poster
        this.state = {
            img: '',
            hover: false
        };
        this.animate = props.animate ? props.animate : false
    }

    async componentDidMount() {
        const posterUrl = await fetchAuthImage(this.poster);
        this.setState({ img: posterUrl });
    }

    getAnimation() {
        if (this.animate) {
            return style.posterWithAnimation
        }
        return ''
    }

    getPosterStyle() {
        return {
            backgroundImage: `url('${this.state.img}')`
        }
    }

    render() {
        return (
            <div onClick={() => this.props.onClick(this.season, this.episode, this.show)} className={style.poster + ' ' + this.getAnimation()}>
                <div className={style.posterImage} style={this.getPosterStyle()}>
                    <div className={style.episodeInfo}>
                        <h3 className={style.seasonName}>S{this.season} E{this.episode}</h3>
                    </div>
                </div>
            </div>
        )
    }
}