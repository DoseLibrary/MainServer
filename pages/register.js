import Layout from '../components/layout'
import styles from '../styles/register.module.css';
import { Component } from 'react';
import { Form } from 'react-bootstrap';
import Router from 'next/router';


import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


export default class Register extends Component {
  constructor(props) {
    super(props);
    this.state = {
        username: '',
        password: '',
        email: ''
    }

    this.register = this.register.bind(this);
  }

  register(e) {
    e.preventDefault();
    console.log(process.env.NEXT_PUBLIC_SERVER_URL)
      fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/auth/register`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              email: this.state.email,
              password: this.state.password,
              username: this.state.username
          }),
      })
      .then((r) => r.json())
      .then((data) => {
        console.log(data.message)
        if (data.message == "success") {
          toast.success('Successfully created an account!', {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "colored",
          });
        } else {
          toast.error('Error registering account!', {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "colored",
          });
        }
      });
  }
  
  render() {
    return (
      <Layout>
        <div className={styles.loginBox}>
        <img className={styles.logo} src={'/images/logo.png'} alt='logo'></img>
          <Form onSubmit={this.register}>
            <label className={styles.inputLabel} htmlFor="uname"><b>Username</b></label>
            <input className={styles.inputBox} type="text" placeholder="" name="uname" onChange={(e) => this.setState({username: e.target.value})} required></input>
            
            <label className={styles.inputLabel} htmlFor="email"><b>E-mail</b></label>
            <input className={styles.inputBox} type="text" placeholder="" name="email" onChange={(e) => this.setState({email: e.target.value})} required></input>
            
            <label className={styles.inputLabel} htmlFor="psw"><b>Password</b></label>
            <input className={styles.inputBox} type="password" placeholder="" name="psw" onChange={(e) => this.setState({password: e.target.value})} required></input>
            <button type="submit" style={{display: "none"}}></button>
          </Form>
          <div className={styles.loginButtonRow}>
            <button className={styles.registerButton} type="submit" onClick={this.register}>Register</button>
            <button className={styles.backButton} onClick={() => { Router.push('/login'); return false }}>Back</button>
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
