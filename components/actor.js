import { fetchAuthImage } from '../lib/fetchAuthImage';
import Styles from './actor.module.css';
import { Component } from 'react';

export default class Actor extends Component {
    constructor(props) {
        super(props);
        this.name = props.name;
        this.characterName = props.characterName;
        this.image = props.image;
        this.id = props.id;

        this.state = {
            imageUrl: undefined
        }
    }

    componentDidMount() {
        if (this.image) {
            fetchAuthImage(this.image)
                .then(url => this.setState({ imageUrl: url }))
        }
    }

    getImageStyle() {
        return {
            backgroundImage: `url('${this.state.imageUrl}')`
        }
    }

    render() {
        return (
            <div className={Styles.actorBox}>
                <div className={Styles.actorImage} style={this.getImageStyle()}></div>
                <h2>{this.name}</h2>
                <p>as {this.characterName}</p>
            </div>
        )
    }
}
