// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: loopback-workspace
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var GridFSConnector = require('./grid_fs_conn');
var loopback = require('loopback');
var boot = require('loopback-boot');
var request = require('request');
const os = require('os');
const fs = require('fs-extra');
const path = require('path');
var promise =require('promise');
var url = 'http://localhost:3000/api/faxes/container/upload'

var app = module.exports = loopback();

// define database URI
const DBURI = 'mongodb://127.0.0.1:27017/faxUploads';
var localGridFSConnector = new GridFSConnector(DBURI);

app.start = function () {
  // start the web server
  return app.listen(function () {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

app.use('/process_fax', async function(req, res, next) {
  request.get('http://50.200.140.121:33935/fax', function(err, result){
    try{
      localGridFSConnector.uploadFax(err, result);
    } catch (e) {
      console.log('failed to upload fax');
      console.error(e);
    }
  });
});

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
