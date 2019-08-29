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

// Test upload functionality
app.use('/process_fax', async function(req, res, next) {
  request.get('http://50.200.140.121:33935/fax', function(err, result){
    if (err){
      console.error(err);
      res.status(404).send('Failed to fetch information from the provided URI');
    }
    try{
      localGridFSConnector.uploadFax(result);
      res.status(201).send('Fax file(s) successfully added to database');
    } catch (e) {
      console.log('failed to upload fax');
      console.error(e);
      res.status(500).send('Internal Server Error!');
    }
  });
});

// Test download method
// Change filename to a valid entry in mongoDB
app.use('/download_fax', async function(req, res, next) {
  try {
    localGridFSConnector.downloadFax("filename", res);
  } catch(err){
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Test metadata download method
// Change filename to a valid entry in mongoDB
app.use('/download_metadata', async function(req, res, next) {
  try {
    localGridFSConnector.getFaxMetadata("filename", res);
  } catch(err){
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Test search method
// Entry a valid query as the input
app.use('/query_fax', async function(req, res, next) {
  try {
    localGridFSConnector.searchFax({"metadata.JobId": "0fe11331-7755-49e9-9324-fa4031f75998"}, res);
  } catch(err){
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
