const admin = require('firebase-admin');
const octokit = require('@octokit/rest')();
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const initConfigs = require('./util/config');
initConfigs(admin);

const app = express();

const router = require('./routes/api')(admin.database(), octokit, app);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'frontend/dist')));

const handler = (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));

const routes = ['/', '/leaderboard', '/resources'];
routes.forEach(route => app.get(route, handler));

app.use('/api', router);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

module.exports = app;
