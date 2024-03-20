import Style from './search.module.css';
import Form from 'react-bootstrap/Form';
import validateServerAccess from '../lib/validateServerAccess';
import didYouMean from 'didyoumean';
import { Component } from 'react';
import ContentServer from '../lib/ContentServer';
didYouMean.threshold = 0.1;

export default class Search extends Component {
    constructor(props) {
        super(props);
        this.contentServer = new ContentServer(props.server);
        this.series = [];
        this.movies = [];
        this.enabled = props.searchEnabled;
        this.search = this.search.bind(this);
        this.onClose = props.onClose;
        this.onSearch = props.onSearch;
        this.className = props.className;

        this.state = {
            formVisible: false
        }

        this.openForm = this.openForm.bind(this);
    }

    async search(event) {
        const query = event.target.value;
        if (query === "") {
            this.onClose();
            return;
        }
        const result = await this.contentServer.search(query);
        this.onSearch(result);
    }

    openForm() {
        this.setState({ formVisible: true });
    }

    render() {
        return (
            <div className={this.className}>
                <img alt="" onClick={this.openForm} src="/images/search.png" width={30} height={30} className={Style.searchIcon} />

                <Form autoComplete="off" className={`${Style.searchForm} ${this.state.formVisible ? Style.visible : ''}`}>
                    <Form.Control onInput={this.search} type="text" placeholder="Search.." />
                </Form>

            </div>
        )
    }
}