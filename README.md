<h1 align="center">DOSE</h1>

<div align="center">
  <img src="https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square" alt="Coverage status">
  <img src="https://github.com/GustavPS/Dose/actions/workflows/main.yml/badge.svg" alt="CI status">
  <img src="https://github.com/GustavPS/Dose/actions/workflows/codeql-analysis.yml/badge.svg" alt="Security status">
  <a href="https://www.codefactor.io/repository/github/gustavps/dose"><img src="https://www.codefactor.io/repository/github/gustavps/dose/badge" alt="CodeFactor" /></a>
  
</div>

A complete library solution for movies and TV Shows. Display and view your purchased content via the web using a beautiful UI.
This is the Main Server (front-end) part of Dose. The ContentServer (backend) is available [here](https://github.com/DoseLibrary/ContentServer)

### Table of Contents
1. [Features](#Features)
2. [Android TV](#AndroidTV)
3. [Setup](#Setup)
4. [Support](#Support)
5. [Screenshots](#Screenshots)
6. [Disclaimer](#Disclaimer)
7. [Contributors](#Contributors)

# Features <a name="Features"></a>
* Full TV Show support
* Full Movie support
* Support for multiple libraries
* Track current time on movies and TV Shows
* Track next episode for TV Show
* Automatically fetches Movie and TV Show metadata (images, title, release date, overview etc..)
* Support for manually changing Movie and TV Show metadata.
* Subtitle support
* Advanced Movie name matching
* Advanced TV Show, season and episode name matching
* Automatically extract subtitles from video files
* Support for videos with multiple audio streams

### Android TV <a name="AndroidTV"></a>
The android TV app is available [here](https://github.com/GustavPS/DoseReactNative)

## Setup <a name="Setup"></a>
DOSE is made up of two parts, the main server and then one or multiple movie servers. Each movie server connects to a main server. A movie request looks like this:
Client -> MainServer -> Client -> ContentServer -> Client

The client loads the webpage without any information from the MainServer. The client then sends a request to the MovieServer to get the movie information.

### Main Server
Import the file `dose` to a postgresql database called `dose`.

To start the main server run:

`$env:NODE_ENV="production"`

`npm run build`

`npm run start`

#### Add users
Users register by going to http://localhost:3000 and following the `register` link. Note that this step has to be done before adding users in the Content Server

## Support <a name="Support"></a>
Join our newly created discord for support [here](https://discord.gg/fKeYBzwxrE)

## Screenshots <a name="Screenshots"></a>
<img src="https://user-images.githubusercontent.com/8510654/166718874-d591ea8e-fd8d-4b36-8326-30cc9b1f7db3.png"/>
<img src="https://user-images.githubusercontent.com/8510654/167170674-38ed5d21-a402-4ff8-93b7-839a4d15b2b4.png"/>
<img src="https://user-images.githubusercontent.com/8510654/167170857-4b08d67a-91e0-4edc-8ed2-07ad41a98d07.png"/>
<img src="https://user-images.githubusercontent.com/8510654/167170947-e1d57afb-0648-4877-9ccd-906d4a43f1ae.png"/>

## DISCLAIMER <a name="Disclaimer"></a>
I am not responsible or liable in any manner for any illegal content that people uses DOSE to view and/or host. I do not control and are not responsible for what people host, transmit, share or view using DOSE. I am not responsible for any illegal, offensive, inappropriate, obscene, unlawful or otherwise objectionable content that people host or view using DOSE.

### General Copyright Statement
Most of the sourced material is posted according to the “fair use” doctrine of copyright law for non-commercial news reporting, education and discussion purposes. We comply with all takedown requests.
I do not claim ownership of any of the pictures displayed on this site. I do not knowingly intend or attempt to offend or violate any copyright or intellectual property rights of any entity. Some images used in this project are taken from the web and believed to be in the public domain.
If any images posted here are in violation of copyright law, please contact me and I will gladly remove the offending images immediately.

You may not use the Service for any illegal or unauthorized purpose. You must not, in the use of the Service, violate any laws in your jurisdiction (including but not limited to copyright or trademark laws).

## Contributors ✨ <a name="Contributors"></a>

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/weeklyvillain"><img src="https://avatars.githubusercontent.com/u/16028826?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Filip Eriksson</b></sub></a><br /><a href="https://github.com/GustavPS/Dose/commits?author=weeklyvillain" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/GustavPS"><img src="https://avatars.githubusercontent.com/u/8510654?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Gustav P Svensson</b></sub></a><br /><a href="https://github.com/GustavPS/Dose/commits?author=GustavPS" title="Code">💻</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
