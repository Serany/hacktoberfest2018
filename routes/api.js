const express = require('express');
const router = express.Router();
const debug = require('debug')('hacktoberfest2018:server');
const axios = require('axios');

const { afterPush } = require('../util/helpers');

const key = process.env.GITHUB_ID;
const secret = process.env.GITHUB_SECRET;
const env = process.env.NODE_ENV || 'dev';
const rootURL =
  // env === 'dev' ? 'http://localhost:5000' : 'https://hacktoberfestffm.de';
  env === 'dev'
    ? 'http://localhost:5000'
    : 'https://hacktoberfest-frankfurt.herokuapp.com';
const callbackUrl = rootURL + '/api/callback';

let octokit = null;
let firebase = null;
let usersDB = null;
let dataDB = null;

/**
 * GET Login
 */
router.get('/login', (req, res, next) => {
  debug('[AUTH] Redirecting to Github Authorization');
  res.send(
    'https://github.com/login/oauth/authorize?' +
      `client_id=${key}&scope=read:user,repo:status` +
      `&redirect_uri=${callbackUrl}`
  );
});

/**
 * GET Callback
 */
router.get('/callback', async (req, res, next) => {
  const code = req.query.code;

  let accessToken = null;
  debug("[AUTH] Getting user's access token");

  await axios
    .post('https://github.com/login/oauth/access_token', {
      client_id: key,
      client_secret: secret,
      code: code
    })
    .then(response => {
      accessToken = response.data.split('&')[0].split('token=')[1];
      octokit.authenticate({
        type: 'oauth',
        token: accessToken
      });
    });

  debug("[AUTH] Got user's access token");

  const userData = await octokit.users.get({});
  const login = userData.data.login;

  const newDBUser = {
    login,
    accessToken
  };
  let userEntry = usersDB.push(newDBUser, afterPush);
  debug('Firebase generated key: ' + userEntry.key);

  res.redirect(rootURL);
});

/**
 * GET users + PR data
 */
router.get('/data', async (req, res, next) => {
  const gotAll = async data => {
    let users = await data.val();
    users = Object.values(users);

    if (users) {
      let prsPerUser = {};
      for (let i = 0; i < users.length; i++) {
        octokit.authenticate({
          type: 'oauth',
          token: '82e84ff3b26a3b5752872c5b318b666cbea3da0a'
        });
        const result = await octokit.activity.getEventsForUser({
          username: [users[i].login],
          per_page: 100
        });
        result.data.forEach(obj => {
          if (
            obj.type === 'PullRequestEvent' &&
            obj.payload.action === 'opened' &&
            new Date(obj.payload.pull_request.created_at.split('T')[0]) >
              new Date('2018-10-01')
          ) {
            prsPerUser[users[i].login] = prsPerUser[users[i].login]
              ? {
                  ...prsPerUser[users[i].login],
                  prs: prsPerUser[users[i].login].prs + 1
                }
              : {
                  latestPr: obj.payload.pull_request.created_at.split('T')[0],
                  latestProject: obj.repo.name,
                  prs: 1
                };
          }
        });
      }

      let data = [];
      for (let username in prsPerUser) {
        if (!prsPerUser.hasOwnProperty(username)) continue; // skip prototype properties

        data.push({
          name: username,
          prs: prsPerUser[username].prs,
          latestPr: prsPerUser[username].latestPr,
          latestProject: prsPerUser[username].latestProject
        });
      }

      dataDB.child('data').set(data);

      res.send(data);
    } else {
      res.json({
        status: 500,
        err: 'Error while getting users'
      });
    }
  };

  const errData = error => {
    debug('Something went wrong.');
    debug(error);
    res.json({
      status: 500,
      err: 'Error while getting user data'
    });
  };

  await usersDB.on('value', gotAll, errData);
});

function getRouter(adminRef, octokitRef) {
  firebase = adminRef;
  usersDB = firebase.ref('users');
  dataDB = firebase.ref('/');
  octokit = octokitRef;

  return router;
}

module.exports = getRouter;
