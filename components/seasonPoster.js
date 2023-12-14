import { fetchAuthImage } from '../lib/fetchAuthImage';
import style from './seasonPoster.module.css';
import { Component } from 'react';

export default class SeasonPoster extends Component {
  constructor(props) {
    super(props);
    this.season = props.title;
    this.name = props.name
    this.poster = props.poster
    this.id = props.id;

    this.state = {
      img: ''
    }
  }

  async componentDidMount() {
    if (this.poster !== undefined) {
      const posterUrl = await fetchAuthImage(this.poster);
      this.setState({ img: posterUrl });
    }
  }

  getPosterStyle() {
    return {
      backgroundImage: `url('${this.state.img}')`
    }
  }

  render() {
    return (
      <div onClick={() => this.props.onClick(this.id)} className={style.poster}>
        <div className={style.posterImage} style={this.getPosterStyle()}></div>
        <h3 className={style.seasonName}>{this.name}</h3>
      </div>
    )
  }
}