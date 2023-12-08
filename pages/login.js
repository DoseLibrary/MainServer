import Layout from '../components/layout'
import styles from '../styles/login.module.css';
import Router from 'next/router';
import { Component } from 'react';
import cookie from 'js-cookie';
import { Form } from 'react-bootstrap';


import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


export default class Login extends Component {
  constructor(props) {
    super(props);
    this.state = {
        username: '',
        password: '',
        remember: true
    }

    this.login = this.login.bind(this);
  }

  login(e) {
    e.preventDefault();
    let serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: this.state.username,
            password: this.state.password,
        }),
    })
    .then((r) => r.json())
    .then((data) => {
      if (data && data.status === 'error') {
        toast.error('Error Logging in!', {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "colored",
        });
      } else if (data && data.status === 'success') {
        cookie.set('token', data.token, {expires: 7});
        cookie.set('refreshToken', data.refreshToken, {expires: 7});
        cookie.set('validTo', data.validTo, {expires: 7});
        Router.push('/');
      }
    });
  }
  
  render() {
    return (
      <Layout>
        <div className={styles.loginBox}>
        <img className={styles.logo} src={'/images/logo.png'} alt='logo'></img>
          <Form onSubmit={this.login}>
            <label className={styles.inputLabel} htmlFor="uname"><b>Username</b></label>
            <input className={styles.inputBox} type="text" placeholder="" name="uname" onChange={(e) => this.setState({username: e.target.value})} required></input>

            <label className={styles.inputLabel} htmlFor="psw"><b>Password</b></label>
            <input className={styles.inputBox} type="password" placeholder="" name="psw" onChange={(e) => this.setState({password: e.target.value})} required></input>
            <button type="submit" style={{display: "none"}}></button>
          </Form>
          <div className={styles.loginButtonRow}>
            <button className={styles.loginButton} type="submit" onClick={this.login}>Login</button>
            <button className={styles.registerButton} onClick={() => { Router.push('/register'); return false }}>Register</button>
          </div>
        </div>

        <div className={styles.background} style={{backgroundImage: "url(/images/login_bg.jpg)"}}>
          <div className={styles.blur}></div>
        </div>
        <ToastContainer />
      </Layout>
    );
  }
}
